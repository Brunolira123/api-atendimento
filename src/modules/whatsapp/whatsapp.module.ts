import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WebSocketModule } from '../websocket/websocket.module';
import { Conversation } from '../../shared/entities/conversation.entity';
import { Message } from '../../shared/entities/message.entity';
import { Solicitacao } from '../../shared/entities/solicitacao.entity';
import { DiscordModule } from '@modules/discord/discord.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Solicitacao]),
    WebSocketModule,
    DiscordModule,
  ],
  providers: [WhatsAppService],
  controllers: [WhatsAppController],
  exports: [WhatsAppService],
})
export class WhatsAppModule implements OnModuleInit {
  constructor(private readonly whatsappService: WhatsAppService) {}

  async onModuleInit() {
    await this.whatsappService.initialize();
  }
}