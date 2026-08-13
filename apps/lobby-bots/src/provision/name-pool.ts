/**
 * Handles that read like players, not like a fleet. Mixed styles on purpose:
 * a lobby where every name shares one pattern reads as generated.
 * All match the server's username rule: ^[a-zA-Z0-9_]{3,20}$
 */
export const NAME_POOL: string[] = [
  'mike_p', 'Jenna94', 'oldwolf77', 'tomkarlsen', 'bexx', 'Danno_23',
  'quietstorm', 'lu_ci', 'mattheww', 'Sara_K', 'pjotr', 'nightowl88',
  'grimsby', 'ellamae', 'RudyV', 'tinkerbell99', 'markos', 'Ana_Bee',
  'shortfuse', 'leonid_k', 'Wendy_R', 'coldbrew', 'jakethesnake', 'mmirza',
  'petra_s', 'HalfPint', 'donnie4', 'salla', 'brickhouse', 'yusuf_a',
  'nadia_z', 'TheRealJoe', 'plumtree', 'krisk', 'boombox77', 'ivanovic',
  'lauren_b', 'stumpy', 'Marek_92', 'redkite', 'gonzo_p', 'hannahlee',
  'twofoot', 'silvia_m', 'DocHolly', 'benji_r', 'nordwind', 'catseye',
  'oskar_w', 'PennyL', 'gravelpit', 'toma_s', 'hiddenriver', 'fjord22',
  'bellaq', 'ronnie_g', 'slowhand', 'mira_v', 'Chip_T', 'harborlight',
  'zoltan', 'freya_n', 'mudlark', 'kenji_o', 'Trish_M', 'saltflat',
  'dario_l', 'onyxbird', 'vera_p', 'jonty', 'clay_m', 'northstar_9',
  'esme_r', 'bramble', 'ottoline', 'vic_torres', 'harebell', 'kolya_s',
  'inkwell', 'ruthie_b', 'stonemill', 'aldo_p', 'Winnie_F', 'copperfox',
];

/** Pool names not already taken in the store, in order. */
export function availableNames(
  taken: (name: string) => boolean,
  count: number,
): string[] {
  const free = NAME_POOL.filter(name => !taken(name));
  if (free.length < count) {
    throw new Error(
      `Name pool exhausted: need ${count} more names, ${free.length} left. Add more to name-pool.ts.`,
    );
  }
  return free.slice(0, count);
}
