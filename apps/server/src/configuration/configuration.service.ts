import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigurationService {
  public readonly PORT: number;
  public readonly POSTGRES_HOST: string;
  public readonly POSTGRES_PORT: number;
  public readonly POSTGRES_DB: string;
  public readonly POSTGRES_USER: string;
  public readonly POSTGRES_PASSWORD: string;
  public readonly WALLET_ENCRYPTION_KEY: string

  constructor(private readonly configService: ConfigService) {
    this.PORT = parseInt(this.configService.get('PORT') ?? '3000', 10);
    this.POSTGRES_HOST = this.configService.getOrThrow('POSTGRES_HOST');
    this.POSTGRES_PORT = parseInt(
      this.configService.get('POSTGRES_PORT') ?? '5432',
      10,
    );
    this.POSTGRES_DB = this.configService.getOrThrow('POSTGRES_DB');
    this.POSTGRES_USER = this.configService.getOrThrow('POSTGRES_USER');
    this.POSTGRES_PASSWORD =
      this.configService.getOrThrow('POSTGRES_PASSWORD');
    this.WALLET_ENCRYPTION_KEY = this.configService.getOrThrow("WALLET_ENCRYPTION_KEY")
  }
}
