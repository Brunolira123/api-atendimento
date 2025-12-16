import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebSocketModule],
  providers: [DiscordService],
  exports: [DiscordService],
})
export class DiscordModule {}