import {
  ENS_LABEL_MAX_LENGTH,
  ensLabelCandidate,
  toEnsLabel,
} from '@gaming-platform/core';

/**
 * Usernames are `[a-zA-Z0-9_]{3,20}`; ENS labels are lowercase `[a-z0-9-]`
 * and reject a leading, trailing or doubled hyphen. Everything below is a
 * username the DTO would accept today.
 */
describe('toEnsLabel', () => {
  it.each([
    ['arti', 'arti'],
    ['Arti', 'arti'],
    ['ARTI', 'arti'],
    ['my_name', 'my-name'],
    ['My_Name_2', 'my-name-2'],
    ['a__b', 'a-b'],
    ['a___________b', 'a-b'],
    ['_arti', 'arti'],
    ['arti_', 'arti'],
    ['_arti_', 'arti'],
    ['___a___', 'a'],
    ['123', '123'],
    ['a1_2b', 'a1-2b'],
  ])('%s -> %s', (username, expected) => {
    expect(toEnsLabel(username)).toBe(expected);
  });

  it('returns null when nothing usable survives', () => {
    for (const username of ['___', '_', '', '__']) {
      expect(toEnsLabel(username)).toBeNull();
    }
  });

  it('never emits a label ENS normalisation would reject', () => {
    const usernames = ['_a_b_', 'A__B', 'z_', '_9', 'a-b'];
    for (const username of usernames) {
      const label = toEnsLabel(username);
      if (label === null) {
        continue;
      }
      expect(label).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
      expect(label).not.toContain('--');
      expect(label.length).toBeLessThanOrEqual(ENS_LABEL_MAX_LENGTH);
    }
  });

  it('truncates an over-long label without leaving a trailing hyphen', () => {
    // 63 chars of 'a' then '_b' would slice to '...a' - but a username whose
    // 63rd char is the hyphen must not end on it.
    const username = `${'a'.repeat(ENS_LABEL_MAX_LENGTH - 1)}_bcd`;
    const label = toEnsLabel(username)!;
    expect(label.length).toBeLessThanOrEqual(ENS_LABEL_MAX_LENGTH);
    expect(label.endsWith('-')).toBe(false);
  });

  it('collides exactly where the username charset makes it unavoidable', () => {
    // Both are valid, distinct usernames today: Postgres UNIQUE is
    // case-sensitive. The suffix path exists for this.
    expect(toEnsLabel('Arti')).toBe(toEnsLabel('arti'));
    expect(toEnsLabel('a_b')).toBe(toEnsLabel('a__b'));
  });
});

describe('ensLabelCandidate', () => {
  it('returns the bare label first, then numbered', () => {
    expect(ensLabelCandidate('arti', 1)).toBe('arti');
    expect(ensLabelCandidate('arti', 2)).toBe('arti-2');
    expect(ensLabelCandidate('arti', 3)).toBe('arti-3');
  });

  it('keeps a suffixed label inside the length limit', () => {
    const long = 'a'.repeat(ENS_LABEL_MAX_LENGTH);
    const candidate = ensLabelCandidate(long, 2);
    expect(candidate.length).toBeLessThanOrEqual(ENS_LABEL_MAX_LENGTH);
    expect(candidate.endsWith('-2')).toBe(true);
  });

  it('does not leave a double hyphen when trimming for the suffix', () => {
    const label = `${'a'.repeat(ENS_LABEL_MAX_LENGTH - 2)}-b`;
    const candidate = ensLabelCandidate(label, 2);
    expect(candidate).not.toContain('--');
  });
});
