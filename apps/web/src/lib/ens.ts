import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// ENS names live on mainnet whichever chain the pot is on, so resolution gets
// its own client rather than the wagmi one.
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(
    process.env.NEXT_PUBLIC_ENS_RPC_URL || "https://ethereum-rpc.publicnode.com",
  ),
});

export function looksLikeEnsName(value: string): boolean {
  return /^[^\s.]+(\.[^\s.]+)+$/.test(value);
}

/** null when the name is unregistered, has no address record, or is malformed. */
export async function resolveEnsName(name: string): Promise<Address | null> {
  let normalized: string;
  try {
    normalized = normalize(name);
  } catch {
    return null;
  }
  return ensClient.getEnsAddress({ name: normalized });
}
