import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configuração CORS
  app.enableCors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  });

   app.setGlobalPrefix('api');

  // Pipes de validação
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  
  console.log(`
  🚀 VR SOFTWARE - SISTEMA DE ATENDIMENTO
  ========================================
  📡 Servidor: http://localhost:${port}
  🔗 Health: http://localhost:${port}/health
  🚀 Portal: http://localhost:${port}/atendimento/SOL123456
  🤖 QR Code será exibido acima ↑
  ========================================
  `);
}

bootstrap();