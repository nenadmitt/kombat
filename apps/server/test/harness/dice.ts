import { LudoDieRoller } from '../../src/games/ludo/ludo.dice';

export type ScriptedDice = LudoDieRoller & {
  queue(...dice: number[]): void;
  reset(): void;
};

/**
 * The Ludo die, scripted. There is no fallback to real randomness: a roll the
 * test did not script is the test being wrong about how many rolls its case
 * takes, and a random value there would only surface as a puzzling assertion
 * failure somewhere further down.
 */
export function scriptedDice(): ScriptedDice {
  let pending: number[] = [];
  return {
    roll(): number {
      const die = pending.shift();
      if (die === undefined) {
        throw new Error('The scripted die queue is empty.');
      }
      return die;
    },
    queue(...dice: number[]): void {
      pending.push(...dice);
    },
    reset(): void {
      pending = [];
    },
  };
}
