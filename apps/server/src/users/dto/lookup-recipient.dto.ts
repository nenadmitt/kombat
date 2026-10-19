import { IsString, Length } from 'class-validator';

export class LookupRecipientDto {
  @IsString()
  @Length(1, 320)
  query: string;
}
