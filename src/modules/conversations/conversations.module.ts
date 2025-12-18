// src/conversations/conversations.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { Solicitacao } from '../../shared/entities/solicitacao.entity';
import { Message } from '../../shared/entities/message.entity';
import { Conversation } from '@shared/entities/conversation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Solicitacao, Message,Conversation ]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}