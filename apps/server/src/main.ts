import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // `transform: true` so query-string DTOs (e.g. ?excludeOwn=true) get coerced
  // to their declared types instead of arriving as raw strings.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // `health` stays unprefixed/unversioned — infra probes hit it directly.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
