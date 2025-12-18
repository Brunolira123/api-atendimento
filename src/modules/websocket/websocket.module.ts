import { Module } from '@nestjs/common';
import { WebSocketGatewayService } from './websocket.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Solicitacao } from '@shared/entities/solicitacao.entity';
import { Message } from 'discord.js';
import { Conversation } from '@shared/entities/conversation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Solicitacao, Message, Conversation]),
  ],
  providers: [WebSocketGatewayService],
  exports: [WebSocketGatewayService],
})
export class WebSocketModule {}