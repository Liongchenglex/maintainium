import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowed = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000').split(',');
      if (!origin || allowed.includes(origin) || allowed.includes('*')) {
        callback(null, true);
      } else {
        // Allow cross-origin for preview endpoints (secured by API key guard, not CORS)
        callback(null, true);
      }
    },
  });

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);
}

bootstrap();
