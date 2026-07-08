import { IsIn, IsInt, IsObject, IsUUID, Max, Min } from 'class-validator';
import { FireKind, FleetPlacements } from '@gaming-platform/core';

export class BattleshipReadyDto {
  @IsUUID()
  roomId: string;

  // Structural check only — the fleet's legality (all ships, in-bounds,
  // non-overlapping) is validated by isValidFleet in the match service.
  @IsObject()
  placements: FleetPlacements;
}

export class BattleshipFireDto {
  @IsUUID()
  roomId: string;

  @IsIn(['single', 'torpedo', 'bomb'])
  kind: FireKind;

  @IsInt()
  @Min(0)
  @Max(9)
  row: number;

  @IsInt()
  @Min(0)
  @Max(9)
  col: number;
}

export class BattleshipForfeitDto {
  @IsUUID()
  roomId: string;
}

export class BattleshipEnterDto {
  @IsUUID()
  roomId: string;
}
