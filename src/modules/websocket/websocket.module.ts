import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config'; 
import { Solicitacao } from '@shared/entities/solicitacao.entity';
import { Message } from '@shared/entities/message.entity'; 
import { ConversationsModule } from '@modules/conversations/conversations.module';
import { WebSocketGatewayService } from './websocket.gateway';
import { WebSocketManagerService } from './services/websocket-manager.service';
import { ConversationManagerService } from './services/conversation-manager.service';
import { WhatsAppEventsService } from './services/whatsapp-events.service';
import { MessageStatusService } from './services/message-status.service';
import { AtendimentoHandler } from './handlers/atendimento.handler';
import { MensagemHandler } from './handlers/mensagem.handler';
import { DiscordHandler } from './handlers/discord.handler';
import { JwtService } from './../auth/jwt.service'; // Caminho relativo CORRETO
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot(), // ✅ Use forRoot() se precisar
    TypeOrmModule.forFeature([Solicitacao, Message]), 
    ConversationsModule,
    AuthModule,
  ],
  providers: [
    WebSocketGatewayService,
    WebSocketManagerService,
    ConversationManagerService,
    WhatsAppEventsService,
    MessageStatusService,
    JwtService,
    AtendimentoHandler,
    MensagemHandler,
    DiscordHandler,
  ],
  exports: [WebSocketGatewayService],
})
export class WebSocketModule {}