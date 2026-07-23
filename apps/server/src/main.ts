import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigurationService } from './configuration/configuration.service';
import { RedisIoAdapter } from './websockets/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // `transform: true` so query-string DTOs (e.g. ?excludeOwn=true) get coerced
  // to their declared types instead of arriving as raw strings.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Probe endpoints stay unprefixed/unversioned - infra hits them directly.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'healthcheck', 'status'] });

  // With Redis configured, socket.io broadcasts go through Redis pub/sub so
  // multiple instances behave as one socket server. A connection failure
  // degrades to the in-memory adapter (single instance) instead of crashing,
  // matching the cache module's fallback behavior.
  const { REDIS_URL } = app.get(ConfigurationService);
  if (REDIS_URL) {
    const redisIoAdapter = new RedisIoAdapter(app);
    try {
      await redisIoAdapter.connect(REDIS_URL);
      app.useWebSocketAdapter(redisIoAdapter);
    } catch (error) {
      new Logger('Bootstrap').warn(
        `socket.io adapter: memory (Redis connection failed: ${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
