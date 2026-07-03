import { IsString, Length } from 'class-validator';

export class ChannelDto {
  @IsString()
  @Length(1, 64)
  channel: string;
}
