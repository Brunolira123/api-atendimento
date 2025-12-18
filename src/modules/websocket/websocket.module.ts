import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Solicitacao } from '@shared/entities/solicitacao.entity';
import { WebSocketGatewayService } from './websocket.gateway';
import { WebSocketManagerService } from './services/websocket-manager.service';
import { ConversationManagerService } from './services/conversation-manager.service';
import { WhatsAppEventsService } from './services/whatsapp-events.service';
import { AtendimentoHandler } from './handlers/atendimento.handler';
import { MensagemHandler } from './handlers/mensagem.handler';
import { DiscordHandler } from './handlers/discord.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Solicitacao]),
  ],
  providers: [
    WebSocketGatewayService,
    WebSocketManagerService,
    ConversationManagerService,
    WhatsAppEventsService,
    AtendimentoHandler,
    MensagemHandler,
    DiscordHandler,
  ],
  exports: [WebSocketGatewayService],
})
export class WebSocketModule {}