import { IsString, Length, Matches } from 'class-validator';

export class SiweVerifyDto {
  @IsString()
  @Length(1, 4096)
  message: string;

  @Matches(/^0x[0-9a-fA-F]+$/, { message: 'signature must be hex' })
  @Length(4, 8192)
  signature: string;
}
