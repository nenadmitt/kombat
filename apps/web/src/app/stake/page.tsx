import { StakeScreen, type StakeTab } from "@/components/stake/StakeScreen";

export const metadata = {
  title: "Kombat — Stake pot",
};

export default async function StakePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab: StakeTab =
    tab === "invite" ? "invite" : tab === "withdraw" ? "withdraw" : "stake";
  return <StakeScreen initialTab={initialTab} />;
}
