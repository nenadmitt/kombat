import { IsArray, IsIn, IsInt, IsObject, IsUUID, Max, Min } from 'class-validator';
import { FireKind, FleetPlacements, MinePlacement } from '@gaming-platform/core';

export class BattleshipReadyDto {
  @IsUUID()
  roomId: string;

  // Structural check only; isValidFleet checks legality in the match service.
  @IsObject()
  placements: FleetPlacements;

  // Structural check only; isValidMines checks legality in the match service.
  @IsArray()
  mines: MinePlacement[];
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
