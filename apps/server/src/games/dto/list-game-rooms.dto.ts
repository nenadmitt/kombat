import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';
import { GameType, LobbyStakeFilter, StakeAsset } from '@gaming-platform/core';

function toIntArray(value: unknown): number[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const nums = raw.map(v => Number(v)).filter(v => Number.isInteger(v));
  return nums.length ? nums : undefined;
}

export class ListGameRoomsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  excludeOwn?: boolean;

  @IsOptional()
  @Transform(({ value }) => toIntArray(value))
  @IsArray()
  @IsInt({ each: true })
  gameTypes?: GameType[];

  @IsOptional()
  @IsIn(['all', 'free', 'staked'])
  stake?: LobbyStakeFilter;

  @IsOptional()
  @Transform(({ value }) => toIntArray(value))
  @IsArray()
  @IsInt({ each: true })
  stakeTokens?: StakeAsset[];
}
