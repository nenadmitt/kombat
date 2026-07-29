import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateUsernameDto {
  @Matches(/^[a-zA-Z0-9_]{3,20}$/, {
    message:
      'Username must be 3-20 characters, letters/numbers/underscore only',
  })
  username: string;

  /**
   * Optional referral code entered during onboarding. Normalised and
   * validated in the service, which also enforces write-once attribution;
   * this only bounds the input.
   */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  referredByCode?: string;
}
