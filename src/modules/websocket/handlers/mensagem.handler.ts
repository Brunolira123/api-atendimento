import { Injectable, Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { WebSocketManagerService } from '../services/websocket-manager.service';
import { ConversationManagerService } from '../services/conversation-manager.service';
import { WhatsAppEventsService } from '../services/whatsapp-events.service';
import { ConversationsService } from '@modules/conversations/conversations.service';
import { MessageStatusService } from '../services/message-status.service';
import { Solicitacao } from '@shared/entities/solicitacao.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class MensagemHandler {
  private readonly logger = new Logger(MensagemHandler.name);

  constructor(
    private readonly websocketManager: WebSocketManagerService,
    private readonly conversationManager: ConversationManagerService,
    private readonly whatsappEvents: WhatsAppEventsService,
    private readonly conversationService: ConversationsService,
    private readonly messageStatusService: MessageStatusService,
    @InjectRepository(Solicitacao)
    private readonly solicitacaoRepository: Repository<Solicitacao>,
  ) {}

  async handleEnviarMensagem(
    client: Socket, 
    server: Server, 
    data: { 
      solicitacaoId: string; 
      mensagem: string; 
      whatsappId?: string;
      tempMessageId?: string;
    }
  ) {
    const { solicitacaoId, mensagem, whatsappId, tempMessageId } = data;
    const atendenteNome = this.websocketManager.getAtendenteNome(client);

    try {
      // Validações
      if (!mensagem || mensagem.trim().length === 0) {
        throw new Error('A mensagem não pode estar vazia');
      }

      // ✅ CORREÇÃO 1: WhatsAppService foi removido, então não verifique
      // if (!this.whatsappService) {
      //   throw new Error('Serviço WhatsApp não disponível');
      // }

      // Buscar whatsappId se não veio
      let targetWhatsappId = whatsappId;
      if (!targetWhatsappId) {
        const solicitacao = await this.buscarSolicitacao(solicitacaoId);
        if (solicitacao) {
          targetWhatsappId = solicitacao.whatsappId;
        }
      }

      if (!targetWhatsappId) {
        throw new Error('Não foi possível identificar o número do WhatsApp');
      }

      // ✅ 1. PRIMEIRO CRIAR MENSAGEM NO BANCO
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      let savedMessage = null;
      if (this.conversationService) {
        savedMessage = await this.conversationService.addMessage(solicitacaoId, {
          id: messageId,
          content: mensagem,
          direction: 'outgoing',
          atendenteDiscord: atendenteNome,
          status: 'sent', // Status inicial
        });
      }

      // ✅ 2. NOTIFICAR FRONTEND QUE MENSAGEM ESTÁ SENDO ENVIADA
      const mensagemEnviando = {
        id: savedMessage?.id || messageId,
        tempId: tempMessageId,
        solicitacaoId,
        content: mensagem,
        direction: 'outgoing',
        atendente_discord: atendenteNome,
        timestamp: new Date(),
        status: 'sending',
        deliveredAt: null,
        readAt: null,
      };

      server.to(`solicitacao:${solicitacaoId}`).emit('message:sending', {
        type: 'message_sending',
        data: mensagemEnviando,
        timestamp: new Date().toISOString(),
      });

      // ✅ CORREÇÃO 2: WhatsAppService não existe mais, então SIMULAMOS
      this.logger.log(`📤 SIMULAÇÃO ENVIO: ${atendenteNome} → ${targetWhatsappId}: ${mensagem.substring(0, 50)}...`);
      
      // Simular resultado de envio (sucesso sempre para teste)
      const result = { success: true, error: null };

      // ✅ 3. ATUALIZAR STATUS PARA 'sent' (ENVIADA)
      const novaMensagem = {
        id: savedMessage?.id || messageId,
        tempId: tempMessageId,
        solicitacaoId,
        content: mensagem,
        direction: 'outgoing',
        atendente_discord: atendenteNome,
        timestamp: new Date(),
        status: 'sent',
        deliveredAt: null,
        readAt: null,
      };

      // Atualizar no banco
      if (savedMessage?.id) {
        await this.messageStatusService.updateStatus(
          savedMessage.id,
          'sent',
          server,
          solicitacaoId
        );
      }

      // ✅ 4. NOTIFICAR CHAT QUE MENSAGEM FOI ENVIADA
      server.to(`solicitacao:${solicitacaoId}`).emit('message:new', {
        type: 'nova_mensagem',
        data: novaMensagem,
        timestamp: new Date().toISOString(),
      });

      // ✅ 5. SIMULAR ENTREGA E LEITURA
      setTimeout(async () => {
        if (savedMessage?.id) {
          await this.messageStatusService.markAsDelivered(
            savedMessage.id,
            server,
            solicitacaoId
          );
        }
      }, 2000);

      // ✅ 6. LOG E RESPOSTA PARA O CLIENTE
      this.logger.log(`✅ Mensagem simulada enviada: ${atendenteNome} → ${solicitacaoId}`);

      client.emit('message:sent', {
        success: true,
        messageId: novaMensagem.id,
        tempMessageId,
        message: 'Mensagem enviada com sucesso (simulação)',
        timestamp: new Date().toISOString(),
      });

      return {
        evento: 'message:new',
        data: {
          type: 'nova_mensagem',
          data: novaMensagem,
        }
      };

    } catch (error) {
      this.logger.error(`❌ Erro ao enviar mensagem: ${error.message}`);
      
      server.to(`solicitacao:${solicitacaoId}`).emit('message:error', {
        type: 'message_error',
        data: {
          tempId: tempMessageId,
          solicitacaoId,
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      });
      
      client.emit('error', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  async handleSimulateMessage(client: Socket, server: Server, data: { from: string; message: string }) {
    try {
      const { from, message } = data;

      // Criar solicitação simulada
      const solicitacao = await this.conversationManager.criarSolicitacaoSimulada({
        from,
        message,
      });

      // Notificar nova solicitação
      const conversa = this.conversationManager.mapearParaConversa(solicitacao);
      
      server.emit('solicitacao:nova', {
        type: 'nova_solicitacao',
        data: conversa,
        timestamp: new Date().toISOString(),
      });

      // Criar mensagem simulada
      const mensagemSimulada = {
        id: `sim_msg_${Date.now()}`,
        solicitacaoId: solicitacao.solicitacaoId,
        content: message,
        direction: 'incoming',
        atendente_discord: null,
        timestamp: new Date(),
        status: 'delivered',
        deliveredAt: new Date(),
        readAt: null,
      };

      server.to(`solicitacao:${solicitacao.solicitacaoId}`).emit('message:new', {
        type: 'nova_mensagem',
        data: mensagemSimulada,
        timestamp: new Date().toISOString(),
      });

      // Salvar no banco
      if (this.conversationService) {
        await this.conversationService.addMessage(solicitacao.solicitacaoId, {
          id: mensagemSimulada.id,
          content: message,
          direction: 'incoming',
          status: 'delivered',
        });
      }

      client.emit('whatsapp:simulated', {
        success: true,
        solicitacaoId: solicitacao.solicitacaoId,
        message: 'Mensagem simulada criada com sucesso',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`🧪 Simulação: ${solicitacao.solicitacaoId} de ${from}`);

      return {
        evento: 'solicitacao:nova',
        data: {
          type: 'nova_solicitacao',
          data: conversa,
        }
      };
    } catch (error) {
      this.logger.error(`❌ Erro na simulação: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao simular mensagem',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  // ✅ MÉTODO PARA MARCAR MENSAGENS COMO LIDAS
  async handleMarkMessagesAsRead(
    client: Socket,
    server: Server,
    data: { 
      solicitacaoId: string; 
      messageIds?: string[];
      markAll?: boolean;
    }
  ) {
    try {
      const atendenteNome = this.websocketManager.getAtendenteNome(client);
      const { solicitacaoId, messageIds, markAll } = data;

      if (markAll) {
        const result = await this.messageStatusService.markAllAsRead(
          solicitacaoId,
          server
        );

        this.logger.log(`📖 ${atendenteNome} marcou ${result.count} mensagens como lidas em ${solicitacaoId}`);

        client.emit('messages:all_marked_read', {
          success: true,
          solicitacaoId,
          count: result.count,
          timestamp: new Date().toISOString(),
        });

      } else if (messageIds && messageIds.length > 0) {
        const results = [];
        
        for (const messageId of messageIds) {
          const updated = await this.messageStatusService.markAsRead(
            messageId,
            server,
            solicitacaoId
          );
          
          if (updated) {
            results.push({
              messageId,
              success: true,
              readAt: updated.readAt,
            });
          }
        }

        this.logger.log(`📖 ${atendenteNome} marcou ${results.length} mensagens como lidas`);

        client.emit('messages:marked_read', {
          success: true,
          solicitacaoId,
          results,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        evento: 'messages:status_updated',
        data: { success: true, solicitacaoId }
      };

    } catch (error) {
      this.logger.error(`❌ Erro ao marcar como lidas: ${error.message}`);
      client.emit('error', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  // ✅ MÉTODO PARA RECEBER MENSAGENS DO WHATSAPP
  async handleIncomingWhatsAppMessage(
    server: Server,
    data: {
      solicitacaoId: string;
      whatsappId: string;
      message: string;
      messageId?: string;
    }
  ) {
    try {
      const { solicitacaoId, whatsappId, message, messageId } = data;
      
      const mensagemEntrada = {
        id: messageId || `whatsapp_${Date.now()}`,
        solicitacaoId,
        content: message,
        direction: 'incoming',
        atendente_discord: null,
        timestamp: new Date(),
        status: 'delivered',
        deliveredAt: new Date(),
        readAt: null,
      };

      // Salvar no banco
      if (this.conversationService) {
        await this.conversationService.addMessage(solicitacaoId, {
          id: mensagemEntrada.id,
          content: message,
          direction: 'incoming',
          status: 'delivered',
        });
      }

      // Enviar para sala
      server.to(`solicitacao:${solicitacaoId}`).emit('message:new', {
        type: 'nova_mensagem',
        data: mensagemEntrada,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`📩 WhatsApp → Chat ${solicitacaoId}: ${message.substring(0, 50)}...`);

      return { success: true, messageId: mensagemEntrada.id };

    } catch (error) {
      this.logger.error(`❌ Erro ao processar mensagem WhatsApp: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ✅ MÉTODO AUXILIAR PARA BUSCAR SOLICITAÇÃO
  private async buscarSolicitacao(solicitacaoId: string): Promise<Solicitacao | null> {
    try {
      return await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar solicitação: ${error.message}`);
      return null;
    }
  }

  // ✅ MÉTODO PARA VERIFICAR STATUS
  async handleGetMessageStatus(
    client: Socket,
    data: { 
      solicitacaoId: string; 
      messageIds: string[];
    }
  ) {
    try {
      const { solicitacaoId, messageIds } = data;
      const statuses = [];

      for (const messageId of messageIds) {
        const status = await this.messageStatusService.getMessageStatus(messageId);
        if (status) {
          statuses.push({
            messageId,
            status: status.status,
            deliveredAt: status.deliveredAt,
            readAt: status.readAt,
          });
        }
      }

      client.emit('messages:status', {
        solicitacaoId,
        statuses,
        timestamp: new Date().toISOString(),
      });

      return {
        evento: 'messages:status',
        data: { solicitacaoId, statuses }
      };

    } catch (error) {
      this.logger.error(`❌ Erro ao buscar status: ${error.message}`);
      client.emit('error', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }
}