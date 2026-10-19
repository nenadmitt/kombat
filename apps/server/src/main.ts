import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigurationService } from './configuration/configuration.service';
import { INSTANCE_ID } from './instance-id';
import { adapterState, RedisIoAdapter } from './websockets/redis-io.adapter';

async function bootstrap() {
  // Otherwise an adapter publish that rejects after its retries kills the process and every open socket.
  process.on('unhandledRejection', (reason) => {
    new Logger('Process').error(
      `Unhandled rejection on instance ${INSTANCE_ID}: ${
        reason instanceof Error ? reason.stack : String(reason)
      }`,
    );
  });
  process.on('uncaughtException', (error) => {
    new Logger('Process').error(
      `Uncaught exception on instance ${INSTANCE_ID}: ${error.stack}`,
    );
  });

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // `transform: true` so query-string DTOs are coerced to their declared types.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Probe endpoints stay unprefixed: infra hits them directly.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'healthcheck', 'status'] });

  // A Redis connection failure degrades to the in-memory adapter instead of crashing.
  const { REDIS_URL } = app.get(ConfigurationService);
  if (REDIS_URL) {
    const redisIoAdapter = new RedisIoAdapter(app);
    try {
      await redisIoAdapter.connect(REDIS_URL);
      app.useWebSocketAdapter(redisIoAdapter);
    } catch (error) {
      new Logger('Bootstrap').warn(
        `socket.io adapter: memory (Redis connection failed: ${
          error instanceof Error ? error.stack : String(error)
        })`,
      );
    }
  } else {
    new Logger('Bootstrap').warn('socket.io adapter: memory (REDIS_URL unset)');
  }

  await app.listen(process.env.PORT ?? 3000);
  new Logger('Bootstrap').log(
    `Listening on ${process.env.PORT ?? 3000} | instance ${INSTANCE_ID} | adapter ${adapterState.mode}`,
  );
}
bootstrap();
