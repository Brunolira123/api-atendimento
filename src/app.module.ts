import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { AtendimentoModule } from './modules/atendimento/atendimento.module';
import { ConversationsModule } from '@modules/conversations/conversations.module';
import { SharedModule } from '@shared/shared.module';

@Module({
  imports: [
    // Configuração simples
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    
    // Database (configuração inline)
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '8745'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'VrPost@Server',
      database: process.env.DB_NAME || 'atendimento_db_nest',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    WhatsAppModule,
    WebSocketModule,
    AtendimentoModule,
    ConversationsModule,
    SharedModule
  ],
})
export class AppModule {}