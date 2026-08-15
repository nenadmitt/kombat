import { IsString, MaxLength, MinLength } from 'class-validator';

export class BotLoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  username: string;

  @IsString()
  @MaxLength(200)
  secret: string;
}
