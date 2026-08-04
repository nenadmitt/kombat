import { StakeScreen } from "@/components/stake/StakeScreen";
import { Web3Providers } from "./providers";

export const metadata = {
  title: "Kombat - Stake pot",
};

export default function StakePage() {
  return (
    <Web3Providers>
      <StakeScreen />
    </Web3Providers>
  );
}
