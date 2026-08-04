import { IsString, Length } from 'class-validator';

export class LookupRecipientDto {
  /** Wallet address, ENS name, or username. */
  @IsString()
  @Length(1, 320)
  query: string;
}
