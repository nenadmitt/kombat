import { IsEmail } from 'class-validator';

export class RequestTokenDto {
  @IsEmail()
  email: string;
}
