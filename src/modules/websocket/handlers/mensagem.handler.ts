import { Injectable, Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { WebSocketManagerService } from '../services/websocket-manager.service';
import { ConversationManagerService } from '../services/conversation-manager.service';
import { WhatsAppEventsService } from '../services/whatsapp-events.service';

@Injectable()
export class MensagemHandler {
  private readonly logger = new Logger(MensagemHandler.name);

  constructor(
    private readonly websocketManager: WebSocketManagerService,
    private readonly conversationManager: ConversationManagerService,
    private readonly whatsappEvents: WhatsAppEventsService,
  ) {}

  async handleEnviarMensagem(client: Socket, server: Server, data: { solicitacaoId: string; mensagem: string; whatsappId?: string }) {
    const { solicitacaoId, mensagem, whatsappId } = data;
    const atendenteNome = this.websocketManager.getAtendenteNome(client);

    try {
      if (!mensagem || mensagem.trim().length === 0) {
        throw new Error('A mensagem não pode estar vazia');
      }

      // Criar objeto de mensagem
      const novaMensagem = {
        id: `msg_${Date.now()}`,
        solicitacaoId,
        content: mensagem,
        direction: 'outgoing',
        atendente_discord: atendenteNome,
        timestamp: new Date(),
        delivered: true,
        read: false,
      };

      // Emitir para todos
      this.whatsappEvents.emitNovaMensagem(server, novaMensagem);

      // Se tiver whatsappId, logar
      if (whatsappId) {
        this.logger.log(`📤 ${atendenteNome} → WhatsApp ${whatsappId}: ${mensagem.substring(0, 50)}...`);
      }

      // Resposta para o cliente
      client.emit('message:sent', {
        success: true,
        messageId: novaMensagem.id,
        message: 'Mensagem enviada com sucesso',
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
      this.whatsappEvents.emitNovaSolicitacao(server, conversa);

      // Criar mensagem simulada
      const mensagemSimulada = {
        id: `sim_msg_${Date.now()}`,
        solicitacaoId: solicitacao.solicitacaoId,
        content: message,
        direction: 'incoming',
        atendente_discord: null,
        timestamp: new Date(),
        delivered: true,
        read: false,
      };

      this.whatsappEvents.emitNovaMensagem(server, mensagemSimulada);

      // Resposta para o cliente
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
}