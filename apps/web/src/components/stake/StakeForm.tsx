"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowSquareOut,
  CheckCircle,
  Copy,
  CurrencyCircleDollar,
  Diamond,
  FileCode,
  Info,
  SealCheck,
  ShieldCheck,
  Wallet,
  Warning,
} from "@phosphor-icons/react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";

import {
  ERC20_ABI,
  EXPLORER_URL,
  STAKE_POT_ABI,
  STAKE_POT_ADDRESS,
  TOKENS,
  shortAddress,
  type StakeToken,
} from "@/lib/chain";
import { publicClient, walletClient, type WalletState } from "@/lib/useWallet";
import styles from "./StakeScreen.module.css";

type Balances = Record<string, bigint>;

type Step = "idle" | "approving" | "staking" | "done";

const PERCENTS = [25, 50, 75, 100] as const;

function tokenIcon(token: StakeToken) {
  if (token.symbol === "KOMBAT") {
    return (
      <span className={`${styles.tokenIcon} ${styles.tokenKombat}`}>
        <Diamond size={14} weight="fill" />
      </span>
    );
  }
  return (
    <span className={`${styles.tokenIcon} ${styles.tokenUsdc}`}>
      <CurrencyCircleDollar size={15} weight="fill" />
    </span>
  );
}

function format(value: bigint | undefined, decimals: number): string {
  if (value === undefined) {
    return "-";
  }
  const whole = formatUnits(value, decimals);
  const [int, frac = ""] = whole.split(".");
  return frac ? `${int}.${frac.slice(0, 4).padEnd(2, "0")}` : `${int}.00`;
}

function reason(error: unknown): string {
  const raw =
    typeof error === "object" && error && "shortMessage" in error
      ? String((error as { shortMessage: unknown }).shortMessage)
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  return raw.split("\n")[0];
}

export function StakeForm({ wallet }: { wallet: WalletState }) {
  const { provider, account, wrongNetwork } = wallet;

  const [beneficiary, setBeneficiary] = useState("");
  const [symbol, setSymbol] = useState(TOKENS[0].symbol);
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState<Balances>({});
  const [allowance, setAllowance] = useState<bigint>();
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [txHash, setTxHash] = useState<Hex>();
  const [error, setError] = useState<string>();

  const token = useMemo(
    () => TOKENS.find((t) => t.symbol === symbol) ?? TOKENS[0],
    [symbol],
  );

  const ready = Boolean(provider && account && !wrongNetwork);

  const refresh = useCallback(async () => {
    if (!provider || !account || wrongNetwork) {
      return;
    }
    const client = publicClient(provider);
    try {
      const [next, isPaused] = await Promise.all([
        Promise.all(
          TOKENS.map(async (t) =>
            t.native
              ? client.getBalance({ address: account })
              : client.readContract({
                  address: t.address,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [account],
                }),
          ),
        ),
        client.readContract({
          address: STAKE_POT_ADDRESS,
          abi: STAKE_POT_ABI,
          functionName: "paused",
        }),
      ]);
      setBalances(
        Object.fromEntries(TOKENS.map((t, i) => [t.symbol, next[i]])),
      );
      setPaused(isPaused);
    } catch (err) {
      setError(reason(err));
    }
  }, [provider, account, wrongNetwork]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!provider || !account || wrongNetwork || token.native) {
      setAllowance(undefined);
      return;
    }
    void publicClient(provider)
      .readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account, STAKE_POT_ADDRESS],
      })
      .then(setAllowance)
      .catch(() => setAllowance(undefined));
  }, [provider, account, wrongNetwork, token, step]);

  const balance = balances[token.symbol];
  const value = useMemo(() => {
    try {
      return amount ? parseUnits(amount, token.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, token.decimals]);

  const beneficiaryValid = isAddress(beneficiary.trim());
  const overBalance = balance !== undefined && value > balance;
  const needsApproval =
    !token.native && allowance !== undefined && value > allowance;

  const blocker = !STAKE_POT_ADDRESS
    ? "The stake pot address is not configured on this site."
    : paused
      ? "Staking is paused on the contract right now."
      : overBalance
        ? `Not enough ${token.symbol} in your wallet.`
        : undefined;

  const canStake =
    ready && beneficiaryValid && value > 0n && !blocker && step === "idle";

  const setPercent = (percent: number) => {
    if (balance === undefined) {
      return;
    }
    const part = (balance * BigInt(percent)) / 100n;
    setAmount(formatUnits(part, token.decimals));
  };

  const stake = async () => {
    if (!provider || !account || !canStake) {
      return;
    }
    setError(undefined);
    setTxHash(undefined);
    const wallet = walletClient(provider, account);
    const client = publicClient(provider);
    const to = beneficiary.trim() as Address;

    try {
      if (needsApproval) {
        setStep("approving");
        const approval = await wallet.writeContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [STAKE_POT_ADDRESS, value],
        });
        await client.waitForTransactionReceipt({ hash: approval });
      }

      setStep("staking");
      const hash = token.native
        ? await wallet.writeContract({
            address: STAKE_POT_ADDRESS,
            abi: STAKE_POT_ABI,
            functionName: "stakeNative",
            args: [to],
            value,
          })
        : await wallet.writeContract({
            address: STAKE_POT_ADDRESS,
            abi: STAKE_POT_ABI,
            functionName: "stake",
            args: [to, token.address, value],
          });
      setTxHash(hash);
      await client.waitForTransactionReceipt({ hash });
      setStep("done");
      setAmount("");
      void refresh();
    } catch (err) {
      setError(reason(err));
      setStep("idle");
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelKicker}>FROM YOUR WALLET</div>
        {account ? (
          <div className={styles.walletTag}>
            <Wallet size={13} weight="fill" className={styles.greenIcon} />
            <span className={styles.walletTagAddress}>
              {shortAddress(account)}
            </span>
          </div>
        ) : null}
      </div>

      <div className={styles.tokenStrip}>
        {TOKENS.map((t) => (
          <button
            key={t.symbol}
            type="button"
            className={`${styles.tokenCard} ${
              t.symbol === symbol ? styles.tokenCardActive : ""
            }`}
            onClick={() => {
              setSymbol(t.symbol);
              setAmount("");
            }}
          >
            <span className={styles.tokenCardHead}>
              {tokenIcon(t)}
              <span className={styles.tokenCardName}>{t.symbol}</span>
            </span>
            <span className={styles.tokenCardBalance}>
              {ready ? format(balances[t.symbol], t.decimals) : "-"}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.amountBox}>
        <div className={styles.amountBoxHead}>
          <span className={styles.amountLabel}>AMOUNT TO STAKE</span>
          <span className={styles.balanceNote}>
            {ready ? (
              <>
                Wallet balance{" "}
                <span className={styles.balanceValue}>
                  {format(balance, token.decimals)} {token.symbol}
                </span>
              </>
            ) : (
              "Connect a wallet to see your balance"
            )}
          </span>
        </div>
        <div className={styles.amountRow}>
          <input
            className={styles.amountInput}
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^0-9.]/g, ""))
            }
            placeholder="0.00"
            inputMode="decimal"
            disabled={!ready}
          />
          <div className={styles.tokenSelect}>
            {tokenIcon(token)}
            <span className={styles.tokenSelectName}>{token.symbol}</span>
          </div>
        </div>
        <div className={styles.percentRow}>
          {PERCENTS.map((percent) => (
            <button
              key={percent}
              type="button"
              className={styles.percentBtn}
              onClick={() => setPercent(percent)}
              disabled={!ready || balance === undefined}
            >
              {percent === 100 ? "MAX" : `${percent}%`}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.flowDivider}>
        <span className={styles.flowLine} />
        <span className={styles.flowArrow}>
          <ArrowDown size={16} weight="bold" />
        </span>
        <span className={`${styles.flowLine} ${styles.flowLineEnd}`} />
      </div>

      <div className={styles.destBox}>
        <div className={styles.panelKickerSm}>
          TO · YOUR KOMBAT ACCOUNT
        </div>
        <input
          className={`${styles.addressInput} ${
            beneficiary && !beneficiaryValid ? styles.addressInputBad : ""
          }`}
          value={beneficiary}
          onChange={(event) => setBeneficiary(event.target.value)}
          placeholder="0x… paste from the Kombat app"
          spellCheck={false}
        />
        <div className={styles.verifiedNote}>
          <SealCheck size={14} weight="fill" />
          Copy your wallet address from the app - Profile, then Wallet.
        </div>
      </div>

      <div className={styles.destBox}>
        <div className={styles.panelKickerSm}>VIA · KOMBAT STAKE POT</div>
        <div className={styles.destRow}>
          <span className={styles.destIcon}>
            <FileCode size={18} weight="bold" />
          </span>
          <span className={styles.destAddress}>
            {STAKE_POT_ADDRESS || "not configured"}
          </span>
          <span className={styles.destActions}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnGreen}`}
              onClick={() =>
                void navigator.clipboard.writeText(STAKE_POT_ADDRESS)
              }
              aria-label="Copy contract address"
            >
              <Copy size={14} weight="bold" />
            </button>
            <a
              className={styles.iconBtn}
              href={`${EXPLORER_URL}/address/${STAKE_POT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              aria-label="View on Etherscan"
            >
              <ArrowSquareOut size={14} weight="bold" />
            </a>
          </span>
        </div>
      </div>

      {error ? (
        <div className={styles.formError}>
          <Warning size={15} weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}

      {blocker ? (
        <div className={styles.formError}>
          <Warning size={15} weight="fill" />
          <span>{blocker}</span>
        </div>
      ) : null}

      {step === "done" && txHash ? (
        <div className={styles.formSuccess}>
          <CheckCircle size={15} weight="fill" />
          <span>
            Staked. It lands in the pot within a block.{" "}
            <a
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          </span>
        </div>
      ) : null}

      <div className={styles.actions}>
        {!wallet.hasWallet ? (
          <a
            className={styles.primaryBtn}
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
          >
            <Wallet size={17} weight="bold" />
            Install a wallet
          </a>
        ) : !account ? (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void wallet.connect()}
            disabled={wallet.connecting}
          >
            <Wallet size={17} weight="bold" />
            {wallet.connecting ? "Connecting…" : "Connect wallet"}
          </button>
        ) : wrongNetwork ? (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void wallet.switchNetwork()}
          >
            <Warning size={17} weight="bold" />
            Switch to Sepolia
          </button>
        ) : (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void stake()}
            disabled={!canStake}
          >
            <ShieldCheck size={17} weight="bold" />
            {step === "approving"
              ? `Approving ${token.symbol}…`
              : step === "staking"
                ? "Staking…"
                : needsApproval
                  ? `Approve & stake ${token.symbol}`
                  : `Stake ${amount || "0"} ${token.symbol}`}
          </button>
        )}
      </div>

      <div className={styles.infoNote}>
        <Info size={14} className={styles.infoIcon} />
        <span>
          {token.native
            ? "One signature to stake. Test mode uses Sepolia funds only."
            : "Two signatures the first time: one to approve the token, one to stake. Test mode uses Sepolia funds only."}
        </span>
      </div>
    </div>
  );
}
