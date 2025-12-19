import { Module } from '@nestjs/common';
import { DiscordService } from './services/discord.service';
import { DiscordBotClient } from './discord-bot.client';
import { DiscordMessageService } from './services/discord-message.service';
import { DiscordChannelService } from './services/discord-channel.service';
import { DiscordNotificationService } from './services/discord-notification.service';
import { DiscordButtonHandler } from './handlers/button.handler';
import { DiscordCommandHandler } from './handlers/command.handler';
import { ReadyHandler } from './handlers/ready.handler';
import { SolicitacaoEmbed } from './embeds/solicitacao.embed';
import { StatusEmbed } from './embeds/status.embed';
import { AjudaEmbed } from './embeds/ajuda.embed';
import { DiscordUtils } from './utils/discord.utils';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  providers: [
    DiscordService,
    DiscordBotClient,
    DiscordMessageService,
    DiscordChannelService,
    DiscordNotificationService,
    DiscordButtonHandler,
    DiscordCommandHandler,
    ReadyHandler,
    SolicitacaoEmbed,
    StatusEmbed,
    AjudaEmbed,
    DiscordUtils,
  ],
  exports: [DiscordService],
})
export class DiscordModule {}