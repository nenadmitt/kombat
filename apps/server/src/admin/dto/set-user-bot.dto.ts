import { IsBoolean } from 'class-validator';

export class SetUserBotDto {
  @IsBoolean()
  isBot: boolean;
}
