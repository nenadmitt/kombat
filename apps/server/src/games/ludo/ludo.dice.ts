import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { DIE_SIDES } from '@gaming-platform/core';

/** The die behind every Ludo roll. A seam so the e2e suite can script it. */
export abstract class LudoDieRoller {
  abstract roll(): number;
}

@Injectable()
export class CryptoLudoDieRoller extends LudoDieRoller {
  roll(): number {
    return randomInt(1, DIE_SIDES + 1);
  }
}
