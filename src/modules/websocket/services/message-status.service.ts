// src/modules/websocket/services/message-status.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '@shared/entities/message.entity';
import { Server } from 'socket.io';

export interface MessageStatusUpdate {
  messageId: string;
  solicitacaoId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  reason?: string;
}

@Injectable()
export class MessageStatusService {
  private readonly logger = new Logger(MessageStatusService.name);

  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async updateStatus(
    messageId: string, 
    status: 'sent' | 'delivered' | 'read' | 'failed',
    server?: Server,
    solicitacaoId?: string
  ): Promise<Message | null> {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
      });

      if (!message) {
        this.logger.warn(`Mensagem ${messageId} não encontrada`);
        return null;
      }

      // Atualizar status
      message.status = status;

      // Atualizar timestamps específicos
      const now = new Date();
      if (status === 'delivered' && !message.deliveredAt) {
        message.deliveredAt = now;
      } else if (status === 'read' && !message.readAt) {
        message.readAt = now;
      }

      const updatedMessage = await this.messageRepository.save(message);

      // Emitir evento de atualização
      if (server && solicitacaoId) {
        server.to(`solicitacao:${solicitacaoId}`).emit('message:status', {
          type: 'message_status_update',
          data: {
            messageId,
            status,
            solicitacaoId,
            timestamp: now.toISOString(),
            deliveredAt: message.deliveredAt,
            readAt: message.readAt,
          },
        });
      }

      this.logger.log(`✅ Status atualizado: ${messageId} -> ${status}`);
      return updatedMessage;

    } catch (error) {
      this.logger.error(`❌ Erro ao atualizar status: ${error.message}`);
      return null;
    }
  }

  async markAsDelivered(messageId: string, server?: Server, solicitacaoId?: string) {
    return this.updateStatus(messageId, 'delivered', server, solicitacaoId);
  }

  async markAsRead(messageId: string, server?: Server, solicitacaoId?: string) {
    return this.updateStatus(messageId, 'read', server, solicitacaoId);
  }

  async markAsFailed(messageId: string, reason: string, server?: Server, solicitacaoId?: string) {
    const message = await this.updateStatus(messageId, 'failed', server, solicitacaoId);
    
    if (message && server && solicitacaoId) {
      server.to(`solicitacao:${solicitacaoId}`).emit('message:failed', {
        messageId,
        reason,
        timestamp: new Date().toISOString(),
      });
    }
    
    return message;
  }

  async getMessageStatus(messageId: string) {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
        select: ['id', 'status', 'deliveredAt', 'readAt', 'createdAt'],
      });

      return message;
    } catch (error) {
      this.logger.error(`Erro ao buscar status: ${error.message}`);
      return null;
    }
  }

  async markAllAsRead(solicitacaoId: string, server?: Server): Promise<{ count: number }> {
  try {
    // Buscar conversation pela solicitacaoId
    // (Você precisa adaptar conforme sua estrutura)
    
    // Exemplo simplificado:
    const messages = await this.messageRepository.find({
      where: { 
        // Algum campo que relacione com solicitacaoId
        // Ou busque via conversation
      },
    });

    const now = new Date();
    let count = 0;

    for (const message of messages) {
      if (message.status !== 'read' && message.direction === 'incoming') {
        message.status = 'read';
        message.readAt = now;
        await this.messageRepository.save(message);
        count++;
      }
    }

    if (server && count > 0) {
      server.to(`solicitacao:${solicitacaoId}`).emit('messages:all_read', {
        solicitacaoId,
        count,
        timestamp: now.toISOString(),
      });
    }

    return { count };

  } catch (error) {
    this.logger.error(`Erro ao marcar todas como lidas: ${error.message}`);
    return { count: 0 };
  }
    }
}