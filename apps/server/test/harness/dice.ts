import { LudoDieRoller } from '../../src/games/ludo/ludo.dice';

export type ScriptedDice = LudoDieRoller & {
  queue(...dice: number[]): void;
  reset(): void;
};

// No fallback to real randomness: an unscripted roll means the test miscounted its rolls.
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
