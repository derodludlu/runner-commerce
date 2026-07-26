// src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import * as express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { resolve } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const jsonBodyLimit = process.env.API_JSON_BODY_LIMIT || '25mb';
  const frontendUrls = (
    process.env.FRONTEND_URLS ||
    process.env.CORS_ORIGINS ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000,http://localhost:3002,http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081,http://127.0.0.1:19006'
  )
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  // Apply security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
          scriptSrc: ["'self'", 'cdnjs.cloudflare.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  // Raw body must be registered before JSON parsing so webhook signatures verify.
  app.use('/payments/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(
    '/whatsapp-imports/meta',
    bodyParser.json({
      limit: jsonBodyLimit,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Add JSON body parsing middleware for general requests
  app.use(bodyParser.json({ limit: jsonBodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: jsonBodyLimit }));

  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && frontendUrls.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
  });
  app.use(
    '/uploads',
    express.static(resolve(process.env.UPLOAD_PATH || './uploads')),
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true'
  ) {
    const config = new DocumentBuilder()
      .setTitle('Runner Commerce API')
      .setDescription('API documentation for the Runner Commerce platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  console.log(`CORS configuration: ${JSON.stringify(frontendUrls)}`);
  app.enableCors({
    origin: frontendUrls,
    credentials: true,
  });

  const port = parseInt(process.env.PORT || '3001', 10);

  await app.listen(port);
  console.log(`Application running on http://localhost:${port}`);
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true'
  ) {
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
