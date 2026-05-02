import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import serverlessExpress from '@vendia/serverless-express';
import { LambdaAppModule } from './lambda-app.module.js';

let cachedHandler: ReturnType<typeof serverlessExpress>;

export const handler = async (event: any, context: any, callback: any) => {
  if (!cachedHandler) {
    const app = await NestFactory.create(LambdaAppModule);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.enableCors({
      origin: process.env.FRONTEND_URL ?? true,
      credentials: true,
    });
    await app.init();
    const expressApp = app.getHttpAdapter().getInstance();
    cachedHandler = serverlessExpress({ app: expressApp });
  }
  return cachedHandler(event, context, callback);
};
