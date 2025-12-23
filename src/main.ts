// main.ts - VERSÃO SIMPLIFICADA
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // 🔥 Configuração SIMPLES do WebSocket
  app.useWebSocketAdapter(new IoAdapter(app));
  
  // Configuração CORS
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
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
      forbidNonWhitelisted: true,
      disableErrorMessages: false,
    }),
  );

  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  
  console.log(`
  🚀 VR SOFTWARE - SISTEMA DE ATENDIMENTO
  ========================================
  📡 HTTP: http://localhost:${port}
  🔌 WebSocket: ws://localhost:${port}
  📡 Namespace: /atendimento
  🔗 Health: http://localhost:${port}/health
  ========================================
  `);
  
  // IMPORTANTE: Verifique se o WebSocket está funcionando
  console.log('\n🔍 Para testar WebSocket, execute:');
  console.log('node test-3001-simple.js');
}

bootstrap();