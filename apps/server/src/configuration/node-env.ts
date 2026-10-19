// Fail closed: anything but an explicit development/test opt-out is production.
export function isProductionEnv(nodeEnv: string | undefined): boolean {
  const env = (nodeEnv ?? '').trim();
  return env !== 'development' && env !== 'test';
}
