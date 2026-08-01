export function truncateAddress(address: string, lead = 4, tail = 4): string {
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}
