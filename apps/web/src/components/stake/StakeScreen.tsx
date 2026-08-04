"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle,
  CircleNotch,
  Flask,
  MagnifyingGlass,
  SealCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { ConnectKitButton } from "connectkit";
import { formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import type { RecipientLookup, TokenSymbol } from "@gaming-platform/core";

import { BrandIcon, PotIcon, type BrandIconName } from "@/components/BrandIcon";
import { LogoLockup } from "@/components/Logo";
import {
  CHAIN_ID,
  CHAIN_NAME,
  ERC20_ABI,
  EXPLORER_URL,
  IS_TESTNET,
  STAKE_POT_ABI,
  STAKE_POT_ADDRESS,
  TOKENS,
  shortAddress,
} from "@/lib/chain";
import { looksLikeEnsName, resolveEnsName } from "@/lib/ens";
import { lookupRecipient } from "@/lib/platform-api";
import styles from "./StakeScreen.module.css";

const STAKE_SYMBOLS: TokenSymbol[] = ["KOMBAT", "USDC", "USDT", "DAI"];

const BRAND: Record<TokenSymbol, BrandIconName> = {
  ETH: "eth",
  KOMBAT: "kombat",
  USDC: "usdc",
  USDT: "usdt",
  DAI: "dai",
};

type Player = Extract<RecipientLookup, { found: true }>;

type LookupState =
  | { status: "idle" }
  | { status: "typing" }
  | { status: "malformed" }
  | { status: "resolving"; name: string }
  | { status: "unresolved"; name: string }
  | { status: "ensError"; name: string }
  | { status: "checking"; address: Address }
  | { status: "found"; user: Player; name: string | undefined }
  | { status: "missing"; address: Address }
  | { status: "error" };

function formatBalance(value: bigint, decimals: number): string {
  const [int, frac] = formatUnits(value, decimals).split(".");
  if (!frac) {
    return int!;
  }
  return `${int}.${frac.slice(0, 4)}`.replace(/\.?0+$/, "") || "0";
}

function playerName(found: Extract<LookupState, { status: "found" }>): string {
  const { user, name } = found;
  return name ?? user.ensName ?? user.username ?? shortAddress(user.address);
}

export function StakeScreen() {
  // wagmi state only exists client-side; render the signed-out shell on the
  // server so hydration never disagrees with the wallet.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address: account } = useAccount();
  const connected = mounted && account !== undefined;

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <LogoLockup size={30} />
        </Link>
        <ConnectKitButton.Custom>
          {({ isConnected, show, truncatedAddress, ensName }) => (
            <button
              type="button"
              className={
                mounted && isConnected ? styles.walletChip : styles.connectBtn
              }
              onClick={show}
            >
              {mounted && isConnected ? (
                <>
                  <span className={styles.walletDot} />
                  {ensName ?? truncatedAddress}
                </>
              ) : (
                "Connect wallet"
              )}
            </button>
          )}
        </ConnectKitButton.Custom>
      </header>

      <div className={styles.content}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={13} weight="bold" />
          Back to Kombat
        </Link>

        <div className={styles.grid}>
          <WalletPanel account={connected ? account : undefined} />
          <StakeCard account={connected ? account : undefined} />
        </div>
      </div>
    </div>
  );
}

function WalletPanel({ account }: { account: Address | undefined }) {
  const erc20s = useMemo(() => TOKENS.filter(t => !t.native), []);
  const { data } = useReadContracts({
    contracts: erc20s.map(token => ({
      address: token.address as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [account ?? "0x"] as const,
    })),
    query: { enabled: account !== undefined, refetchInterval: 15_000 },
  });

  const missing = STAKE_SYMBOLS.filter(
    symbol => !TOKENS.some(t => t.symbol === symbol),
  );

  return (
    <aside className={styles.walletPanel}>
      <div className={styles.panelKicker}>YOUR COINS</div>
      <div className={styles.coinList}>
        {erc20s.map((token, index) => (
          <div key={token.symbol} className={styles.coinRow}>
            <BrandIcon type={BRAND[token.symbol]} size={26} />
            <span className={styles.coinSymbol}>{token.symbol}</span>
            <span className={styles.coinBalance}>
              {account === undefined
                ? "~"
                : data?.[index]?.status === "success"
                  ? formatBalance(data[index].result as bigint, token.decimals)
                  : "~"}
            </span>
          </div>
        ))}
        {missing.map(symbol => (
          <div key={symbol} className={styles.coinRowMuted}>
            <BrandIcon type={BRAND[symbol]} size={26} />
            <span className={styles.coinSymbol}>{symbol}</span>
            <span className={styles.coinNote}>Not on {CHAIN_NAME}</span>
          </div>
        ))}
      </div>
      <p className={styles.panelNote}>
        {account
          ? `In ${shortAddress(account)}, the wallet you connected.`
          : "Connect a wallet to see what you are holding."}
      </p>
    </aside>
  );
}

function StakeCard({ account }: { account: Address | undefined }) {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const connected = account !== undefined;
  const wrongChain = connected && chainId !== CHAIN_ID;

  const choices = useMemo(
    () =>
      STAKE_SYMBOLS.map(symbol => ({
        symbol,
        token: TOKENS.find(t => t.symbol === symbol),
      })),
    [],
  );
  const [symbol, setSymbol] = useState<TokenSymbol>(
    () => choices.find(c => c.token)?.symbol ?? "KOMBAT",
  );
  const token = choices.find(c => c.symbol === symbol)?.token;

  const [recipient, setRecipient] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [amount, setAmount] = useState("");

  const { data: reads, refetch: refetchReads } = useReadContracts({
    query: { enabled: connected },
    contracts: token
      ? [
          {
            address: token.address as Address,
            abi: ERC20_ABI,
            functionName: "balanceOf" as const,
            args: [account ?? "0x"] as const,
          },
          {
            address: token.address as Address,
            abi: ERC20_ABI,
            functionName: "allowance" as const,
            args: [account ?? "0x", STAKE_POT_ADDRESS] as const,
          },
          {
            address: STAKE_POT_ADDRESS,
            abi: STAKE_POT_ABI,
            functionName: "allowedTokens" as const,
            args: [token.address as Address] as const,
          },
          {
            address: STAKE_POT_ADDRESS,
            abi: STAKE_POT_ABI,
            functionName: "paused" as const,
          },
        ]
      : [],
  });
  const value = <T,>(i: number): T | undefined =>
    reads?.[i]?.status === "success" ? (reads[i].result as T) : undefined;
  const balance = value<bigint>(0);
  const allowance = value<bigint>(1);
  const tokenAllowed = value<boolean>(2);
  const potPaused = value<boolean>(3);

  // Debounced: an ENS name resolves on mainnet first, then the address is put
  // to the platform. The stake button never enables on an address the platform
  // has not confirmed belongs to a player.
  useEffect(() => {
    const query = recipient.trim();
    if (!query) {
      setLookup({ status: "idle" });
      return;
    }
    setLookup({ status: "typing" });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const name = isAddress(query, { strict: false })
        ? undefined
        : looksLikeEnsName(query)
          ? query
          : null;
      if (name === null) {
        setLookup({ status: "malformed" });
        return;
      }

      let address: Address;
      if (name === undefined) {
        address = getAddress(query);
      } else {
        setLookup({ status: "resolving", name });
        try {
          const resolved = await resolveEnsName(name);
          if (controller.signal.aborted) {
            return;
          }
          if (!resolved) {
            setLookup({ status: "unresolved", name });
            return;
          }
          address = resolved;
        } catch {
          if (!controller.signal.aborted) {
            setLookup({ status: "ensError", name });
          }
          return;
        }
      }

      setLookup({ status: "checking", address });
      try {
        const result = await lookupRecipient(address, controller.signal);
        setLookup(
          result.found
            ? { status: "found", user: result, name }
            : { status: "missing", address },
        );
      } catch {
        if (!controller.signal.aborted) {
          setLookup({ status: "error" });
        }
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [recipient]);

  let parsed: bigint | undefined;
  try {
    parsed = token ? parseUnits(amount || "0", token.decimals) : 0n;
  } catch {
    parsed = undefined;
  }

  const amountError =
    amount !== "" && parsed === undefined
      ? "That is not a number we can read"
      : parsed !== undefined && balance !== undefined && parsed > balance
        ? `You only have ${formatBalance(balance, token?.decimals ?? 18)} ${symbol}`
        : undefined;

  const approve = useWriteContract();
  const stake = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const stakeReceipt = useWaitForTransactionReceipt({ hash: stake.data });

  const needsApproval =
    parsed !== undefined && allowance !== undefined && allowance < parsed;

  // Chain the second transaction off the approval landing, so the pot always
  // has the allowance by the time stake() runs.
  useEffect(() => {
    if (
      approveReceipt.isSuccess &&
      !stake.data &&
      !stake.isPending &&
      !wrongChain &&
      token &&
      parsed !== undefined &&
      lookup.status === "found"
    ) {
      void refetchReads();
      stake.writeContract({
        chainId: CHAIN_ID,
        address: STAKE_POT_ADDRESS,
        abi: STAKE_POT_ABI,
        functionName: "stake",
        args: [lookup.user.address as Address, token.address as Address, parsed],
      });
    }
  }, [
    approveReceipt.isSuccess,
    stake,
    token,
    parsed,
    lookup,
    refetchReads,
    wrongChain,
  ]);

  const busy =
    approve.isPending ||
    stake.isPending ||
    (approve.data !== undefined && approveReceipt.isLoading) ||
    (stake.data !== undefined && stakeReceipt.isLoading);

  const blocked =
    potPaused === true
      ? "The stake pot is paused right now. Try again later."
      : tokenAllowed === false
        ? `The pot does not take ${symbol} yet.`
        : undefined;

  const canStake =
    connected &&
    !wrongChain &&
    !busy &&
    !blocked &&
    token !== undefined &&
    lookup.status === "found" &&
    parsed !== undefined &&
    parsed > 0n &&
    amountError === undefined &&
    !stakeReceipt.isSuccess;

  const submit = () => {
    if (!canStake || lookup.status !== "found" || !token || parsed === undefined) {
      return;
    }
    if (needsApproval) {
      approve.writeContract({
        chainId: CHAIN_ID,
        address: token.address as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [STAKE_POT_ADDRESS, parsed],
      });
      return;
    }
    stake.writeContract({
      chainId: CHAIN_ID,
      address: STAKE_POT_ADDRESS,
      abi: STAKE_POT_ABI,
      functionName: "stake",
      args: [lookup.user.address as Address, token.address as Address, parsed],
    });
  };

  const startOver = () => {
    approve.reset();
    stake.reset();
    setAmount("");
    setRecipient("");
    setLookup({ status: "idle" });
  };

  if (stakeReceipt.isSuccess && stake.data) {
    const name = lookup.status === "found" ? playerName(lookup) : "them";
    return (
      <section className={styles.stakeCard}>
        <div className={styles.successWrap}>
          <SealCheck size={44} weight="fill" className={styles.successIcon} />
          <h2 className={styles.cardTitle}>
            {amount} {symbol} is in the pot
          </h2>
          <p className={styles.lead}>
            It lands in {name}&apos;s pot once the server sees the transaction
            confirm. They can stake a match with it from then on.
          </p>
          <a
            href={`${EXPLORER_URL}/tx/${stake.data}`}
            target="_blank"
            rel="noreferrer"
            className={styles.explorerLink}
          >
            See it on Etherscan
            <ArrowUpRight size={14} weight="bold" />
          </a>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={startOver}
          >
            Stake for someone else
          </button>
        </div>
      </section>
    );
  }

  const writeError = stake.error ?? approve.error;

  return (
    <section className={styles.stakeCard}>
      <h1 className={styles.cardTitle}>Top up a player&apos;s stake pot</h1>
      <p className={styles.cardLead}>
        Your coins go into the StakePot contract and get credited to the player
        at the address you give. They can stake a match with them straight away,
        without signing anything. The transaction is final once it confirms, so
        we check the address belongs to a player before you sign.
      </p>

      {IS_TESTNET && (
        <p className={styles.testnetNotice}>
          <Flask size={16} weight="fill" className={styles.testnetIcon} />
          <span>
            <strong>{CHAIN_NAME} is a test network.</strong> These coins are
            free to get and worth nothing, so a stake here costs you no real
            money.
          </span>
        </p>
      )}

      {wrongChain && (
        <button
          type="button"
          className={styles.chainWarning}
          onClick={() => switchChain({ chainId: CHAIN_ID })}
        >
          <WarningCircle size={16} weight="fill" />
          You are on the wrong network. Switch to {CHAIN_NAME}.
        </button>
      )}

      <div className={styles.fieldLabel}>Coin</div>
      <div className={styles.tokenRow}>
        {choices.map(choice => (
          <button
            key={choice.symbol}
            type="button"
            className={
              choice.symbol === symbol ? styles.tokenBtnActive : styles.tokenBtn
            }
            disabled={!choice.token}
            title={choice.token ? undefined : `Not on ${CHAIN_NAME}`}
            onClick={() => setSymbol(choice.symbol)}
          >
            <BrandIcon type={BRAND[choice.symbol]} size={18} />
            {choice.symbol}
          </button>
        ))}
      </div>

      <div className={styles.fieldLabel}>Player</div>
      <div className={styles.inputWrap}>
        <input
          className={styles.input}
          placeholder="Wallet address or ENS name"
          value={recipient}
          onChange={event => setRecipient(event.target.value)}
          spellCheck={false}
        />
      </div>
      <RecipientStatus lookup={lookup} />

      <div className={styles.fieldLabel}>Amount</div>
      <div className={styles.inputWrap}>
        <input
          className={styles.input}
          placeholder="0.0"
          inputMode="decimal"
          value={amount}
          onChange={event => setAmount(event.target.value)}
        />
        <button
          type="button"
          className={styles.maxBtn}
          disabled={balance === undefined || !token}
          onClick={() =>
            balance !== undefined &&
            token &&
            setAmount(formatUnits(balance, token.decimals))
          }
        >
          Max
        </button>
      </div>
      {amountError && <p className={styles.fieldError}>{amountError}</p>}
      {blocked && <p className={styles.fieldError}>{blocked}</p>}
      {writeError && !busy && (
        <p className={styles.fieldError}>{writeError.message.split("\n")[0]}</p>
      )}

      {connected ? (
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canStake}
          onClick={submit}
        >
          <PotIcon size={17} />
          {lookup.status === "found"
            ? `Stake for ${playerName(lookup)}`
            : "Stake"}
        </button>
      ) : (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button type="button" className={styles.primaryBtn} onClick={show}>
              Connect wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      )}
      {needsApproval && connected && lookup.status === "found" && !busy && (
        <p className={styles.stepNote}>
          Your wallet will ask twice: once to let the pot move your {symbol},
          then once to stake it.
        </p>
      )}

      {busy && (
        <TxModal
          approving={approve.data !== undefined && !approveReceipt.isSuccess}
          signing={approve.isPending || stake.isPending}
          twoStep={needsApproval}
          symbol={symbol}
          amount={amount}
          hash={stake.data ?? approve.data}
        />
      )}
    </section>
  );
}

function TxModal({
  approving,
  signing,
  twoStep,
  symbol,
  amount,
  hash,
}: {
  approving: boolean;
  signing: boolean;
  twoStep: boolean;
  symbol: TokenSymbol;
  amount: string;
  hash: `0x${string}` | undefined;
}) {
  const step = approving ? 1 : 2;
  const title = signing
    ? "Check your wallet"
    : approving
      ? "Waiting on the approval"
      : "Waiting on the stake";
  const body = signing
    ? approving
      ? `Let the pot move ${amount} ${symbol} from your wallet.`
      : `Sign the transaction that puts ${amount} ${symbol} in the pot.`
    : "This usually takes under a minute.";

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <CircleNotch size={36} className={styles.spinner} />
        {twoStep && (
          <span className={styles.stepPill}>Step {step} of 2</span>
        )}
        <h2 className={styles.cardTitle}>{title}</h2>
        <p className={styles.lead}>{body}</p>
        {hash && (
          <a
            href={`${EXPLORER_URL}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className={styles.explorerLink}
          >
            {shortAddress(hash)}
            <ArrowUpRight size={14} weight="bold" />
          </a>
        )}
      </div>
    </div>
  );
}

function RecipientStatus({ lookup }: { lookup: LookupState }) {
  switch (lookup.status) {
    case "idle":
    case "typing":
      return null;
    case "resolving":
      return (
        <p className={styles.recipientChecking}>
          <MagnifyingGlass size={14} />
          Resolving {lookup.name}
        </p>
      );
    case "checking":
      return (
        <p className={styles.recipientChecking}>
          <MagnifyingGlass size={14} />
          Checking {shortAddress(lookup.address)}
        </p>
      );
    case "found":
      return (
        <p className={styles.recipientFound}>
          <CheckCircle size={15} weight="fill" />
          {playerName(lookup)} plays Kombat. Their pot is at{" "}
          {shortAddress(lookup.user.address)}.
        </p>
      );
    case "malformed":
      return (
        <p className={styles.recipientMissing}>
          <WarningCircle size={15} weight="fill" />
          Enter a wallet address (0x…) or an ENS name.
        </p>
      );
    case "unresolved":
      return (
        <p className={styles.recipientMissing}>
          <WarningCircle size={15} weight="fill" />
          {lookup.name} does not resolve to an address.
        </p>
      );
    case "ensError":
      return (
        <p className={styles.recipientMissing}>
          <WarningCircle size={15} weight="fill" />
          We could not reach ENS to resolve {lookup.name}. Try again in a
          moment.
        </p>
      );
    case "missing":
      return (
        <p className={styles.recipientMissing}>
          <WarningCircle size={15} weight="fill" />
          Nobody plays Kombat under {shortAddress(lookup.address)}.
        </p>
      );
    case "error":
      return (
        <p className={styles.recipientMissing}>
          <WarningCircle size={15} weight="fill" />
          We cannot reach the player directory. Try again in a moment.
        </p>
      );
  }
}
