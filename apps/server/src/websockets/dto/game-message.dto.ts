import { IsString, IsUUID, Length } from 'class-validator';

export class GameMessageDto {
  @IsUUID()
  roomId: string;

  @IsString()
  @Length(1, 500)
  text: string;
}
