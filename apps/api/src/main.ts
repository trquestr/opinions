import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { envSchema, resolveLogFormat } from './config/env.schema.js';
import { configureApp } from './configure-app.js';
import { createLogger } from './core/logging/create-logger.js';

async function bootstrap() {
  // ConfigModule к этому моменту уже прочитал .env в process.env (при импорте AppModule).
  const env = envSchema.pick({ NODE_ENV: true, LOG_FORMAT: true }).parse(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: createLogger(resolveLogFormat(env)),
  });
  configureApp(app);
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'));
}
await bootstrap();
