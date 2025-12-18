import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './services/whatsapp.service';
import { WhatsAppSessionService } from '../whatsapp/services/whatsapp.session.service';
import { WhatsAppMessageService } from '../whatsapp/services/whatsapp.message.service';
import { WhatsAppNotificationService } from '../whatsapp/services/whatsapp-notification.service';
import { Solicitacao } from '../../shared/entities/solicitacao.entity';
import { Conversation } from '../../shared/entities/conversation.entity';
import { DiscordModule } from '../discord/discord.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Solicitacao, Conversation]),
    DiscordModule,
    WebSocketModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppSessionService,
    {
      provide: WhatsAppMessageService,
      useFactory: (whatsAppService: WhatsAppService) => {
        return new WhatsAppMessageService(
          whatsAppService['client'], 
          whatsAppService['isConnected'] 
        );
      },
      inject: [WhatsAppService],
    },
    WhatsAppNotificationService,
  ],
  exports: [
    WhatsAppService,
    WhatsAppSessionService,
    WhatsAppMessageService,
    WhatsAppNotificationService,
  ],
})
export class WhatsAppModule {}