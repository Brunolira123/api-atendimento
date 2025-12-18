import { Injectable, Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { WebSocketManagerService } from '../services/websocket-manager.service';
import { ConversationManagerService } from '../services/conversation-manager.service';
import { WhatsAppEventsService } from '../services/whatsapp-events.service';

@Injectable()
export class AtendimentoHandler {
  private readonly logger = new Logger(AtendimentoHandler.name);

  constructor(
    private readonly websocketManager: WebSocketManagerService,
    private readonly conversationManager: ConversationManagerService,
    private readonly whatsappEvents: WhatsAppEventsService,
  ) {}

  async handleLogin(client: Socket, server: Server, data: { nome: string; discordId?: string }) {
    try {
      const atendenteData = this.websocketManager.loginAtendente(client, data);

      client.emit('atendente:logged', {
        success: true,
        nome: data.nome,
        socketId: client.id,
        message: 'Login realizado com sucesso',
        timestamp: new Date().toISOString(),
      });

      // Notificar todos sobre novo atendente
      server.emit('atendente:novo', {
        id: client.id,
        nome: data.nome,
        discordId: data.discordId,
        timestamp: new Date().toISOString(),
      });

      // Enviar conversas pendentes após login
      await this.conversationManager.enviarConversasPendentes(client);

      this.logger.log(`👤 Atendente logado: ${data.nome}`);

      return {
        evento: 'atendente:novo',
        data: {
          id: client.id,
          nome: data.nome,
          discordId: data.discordId,
          timestamp: new Date().toISOString(),
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

  async handleAssumirSolicitacao(client: Socket, server: Server, data: { solicitacaoId: string }) {
    const { solicitacaoId } = data;
    const atendenteNome = this.websocketManager.getAtendenteNome(client);

    try {
      const solicitacao = await this.conversationManager.assumirSolicitacao(
        solicitacaoId,
        atendenteNome
      );

      const result = {
        type: 'atendimento_assumido',
        solicitacaoId,
        atendente: atendenteNome,
        whatsappId: solicitacao.whatsappId,
        atendenteSocketId: client.id,
        timestamp: new Date().toISOString(),
      };

      // Notificar todos os clientes
      server.emit('solicitacao:assumida', result);

      // Atualizar lista de conversas
      await this.conversationManager.enviarConversasAtualizadas(server);

      // Resposta específica para o cliente
      client.emit('solicitacao:assumida:success', {
        solicitacaoId,
        portalUrl: `http://localhost:3000/atendimento/${solicitacaoId}?atendente=${encodeURIComponent(atendenteNome)}`,
        message: 'Solicitação assumida com sucesso',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ ${atendenteNome} assumiu ${solicitacaoId}`);

      return {
        evento: 'solicitacao:assumida',
        data: result,
      };
    } catch (error) {
      this.logger.error(`❌ Erro ao assumir: ${error.message}`);
      client.emit('error', {
        message: error.message,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  async handleFinalizarSolicitacao(client: Socket, server: Server, data: { solicitacaoId: string; resolucao?: string }) {
    const { solicitacaoId, resolucao } = data;
    const atendenteNome = this.websocketManager.getAtendenteNome(client);

    try {
      const solicitacao = await this.conversationManager.finalizarSolicitacao(
        solicitacaoId,
        atendenteNome,
        resolucao
      );

      const result = {
        type: 'solicitacao_finalizada',
        solicitacaoId,
        atendente: atendenteNome,
        resolucao,
        timestamp: new Date().toISOString(),
      };

      // Notificar todos
      server.emit('solicitacao:finalizada', result);

      // Atualizar conversas
      await this.conversationManager.enviarConversasAtualizadas(server);

      // Resposta para o cliente
      client.emit('solicitacao:finalizada:success', {
        success: true,
        solicitacaoId,
        message: 'Atendimento finalizado com sucesso',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ ${atendenteNome} finalizou ${solicitacaoId}`);

      return {
        evento: 'solicitacao:finalizada',
        data: result,
      };
    } catch (error) {
      this.logger.error(`❌ Erro ao finalizar: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao finalizar solicitação',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }
}