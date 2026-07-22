import { IsBoolean, IsIn, IsInt, IsUUID, Max, Min } from 'class-validator';
import { ChromaSuit } from '@gaming-platform/core';

export class ChromaEnterDto {
  @IsUUID()
  roomId: string;
}

export class ChromaPlayDto {
  @IsUUID()
  roomId: string;

  @IsInt()
  @Min(0)
  // A hand can grow well past the deal (forced draws), but never past the deck.
  @Max(107)
  handIndex: number;

  @IsBoolean()
  solo: boolean;
}

export class ChromaDrawDto {
  @IsUUID()
  roomId: string;
}

export class ChromaPassDto {
  @IsUUID()
  roomId: string;
}

export class ChromaPickColorDto {
  @IsUUID()
  roomId: string;

  @IsIn(['crimson', 'amber', 'jade', 'azure'])
  suit: ChromaSuit;
}

export class ChromaForfeitDto {
  @IsUUID()
  roomId: string;
}
