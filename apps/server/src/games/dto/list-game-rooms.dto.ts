import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';
import { GameType, LobbyStakeFilter, StakeAsset } from '@gaming-platform/core';

/** Parse a `?key=0,1,2` query value into a number[]. */
function toIntArray(value: unknown): number[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const nums = raw.map(v => Number(v)).filter(v => Number.isInteger(v));
  return nums.length ? nums : undefined;
}

export class ListGameRoomsDto {
  /** When true, rooms created by the requesting user are left out of the list. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  excludeOwn?: boolean;

  /** Filter to these game types (comma-separated). Empty = every game. */
  @IsOptional()
  @Transform(({ value }) => toIntArray(value))
  @IsArray()
  @IsInt({ each: true })
  gameTypes?: GameType[];

  /** all (default) | free (no stake) | staked. */
  @IsOptional()
  @IsIn(['all', 'free', 'staked'])
  stake?: LobbyStakeFilter;

  /** Filter to these stake tokens (comma-separated). Only affects staked rooms. */
  @IsOptional()
  @Transform(({ value }) => toIntArray(value))
  @IsArray()
  @IsInt({ each: true })
  stakeTokens?: StakeAsset[];
}
