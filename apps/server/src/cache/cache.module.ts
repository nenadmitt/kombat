import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ConfigurationService } from '../configuration/configuration.service';
import { CacheService } from './cache.service';
import { InMemoryCacheStore } from './stores/memory.store';
import { RedisCacheStore } from './stores/redis.store';

// A Redis connection failure falls back to memory with a warning rather than crashing.
@Global()
@Module({
  imports: [ConfigurationModule],
  providers: [
    {
      provide: CacheService,
      inject: [ConfigurationService],
      useFactory: async (
        configurationService: ConfigurationService,
      ): Promise<CacheService> => {
        const logger = new Logger('CacheModule');
        const redisUrl = configurationService.REDIS_URL;
        if (!redisUrl) {
          logger.log('Cache store: memory (REDIS_URL not set)');
          return new CacheService(new InMemoryCacheStore(), 'memory');
        }
        const client = new Redis(redisUrl, {
          connectTimeout: 10000,
          maxRetriesPerRequest: 2,
          lazyConnect: true,
        });
        try {
          await client.connect();
          logger.log('Cache store: redis');
          return new CacheService(new RedisCacheStore(client), 'redis');
        } catch (error) {
          client.disconnect();
          logger.warn(
            `Cache store: memory (Redis connection failed: ${
              error instanceof Error ? error.message : String(error)
            })`,
          );
          return new CacheService(new InMemoryCacheStore(), 'memory');
        }
      },
    },
  ],
  exports: [CacheService],
})
export class CacheModule {}
