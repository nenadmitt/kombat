import { IsEmail, Length } from 'class-validator';

export class ExchangeTokenDto {
  @IsEmail()
  email: string;

  @Length(8, 8)
  token: string;
}
