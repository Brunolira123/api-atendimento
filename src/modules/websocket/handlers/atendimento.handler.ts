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
      // 🔥 SOLUÇÃO: Obter analistaId do socket ou usar fallback
      const analistaId = this.getAnalistaIdFromSocket(client);
      
      // Usar o método correto baseado na disponibilidade do analistaId
      let solicitacao;
      
      if (analistaId) {
        // Usar o novo método com analistaId
        solicitacao = await this.conversationManager.assumirSolicitacao(
          solicitacaoId,
          atendenteNome,
          analistaId
        );
      } else {
        // Usar método de compatibilidade (para sistemas antigos)
        solicitacao = await this.conversationManager.assumirSolicitacaoDiscord(
          solicitacaoId,
          atendenteNome
        );
      }

      const result = {
        type: 'atendimento_assumido',
        solicitacaoId,
        atendente: atendenteNome,
        whatsappId: solicitacao.whatsappId,
        atendenteSocketId: client.id,
        analistaId: analistaId || null,
        timestamp: new Date().toISOString(),
      };

      // Notificar todos os clientes
      server.emit('solicitacao:assumida', result);

      // Atualizar lista de conversas
      await this.conversationManager.enviarConversasAtualizadas(server);

      // Gerar URL do portal baseado no tipo de autenticação
      let portalUrl = `http://localhost:3000/atendimento/${solicitacaoId}`;
      const params = new URLSearchParams();
      
      if (analistaId) {
        // Sistema novo com login de analistas
        params.append('analistaId', analistaId.toString());
        params.append('analistaNome', encodeURIComponent(atendenteNome));
      } else {
        // Sistema antigo (Discord)
        params.append('atendente', encodeURIComponent(atendenteNome));
        if (client['discordId']) {
          params.append('discordId', client['discordId']);
        }
      }
      
      portalUrl += `?${params.toString()}`;

      // Resposta específica para o cliente
      client.emit('solicitacao:assumida:success', {
        solicitacaoId,
        portalUrl,
        message: 'Solicitação assumida com sucesso',
        analistaId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ ${atendenteNome} ${analistaId ? `(ID: ${analistaId})` : ''} assumiu ${solicitacaoId}`);

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

  // 🔧 MÉTODO AUXILIAR: Obter analistaId do socket
 private getAnalistaIdFromSocket(client: Socket): number | null {
  try {
    // 1. Tentar obter do client['user'] (sistema novo com login via API)
    if (client['user'] && client['user'].id) {
      return client['user'].id;
    }
    
    // 2. Tentar obter do client['analistaId'] (se setado manualmente)
    if (client['analistaId']) {
      return client['analistaId'];
    }
    
    // 3. Tentar obter do websocketManager (AGORA FUNCIONA!)
    const atendenteData = this.websocketManager.getAtendente(client.id);
    if (atendenteData && atendenteData.analistaId) {
      return atendenteData.analistaId;
    }
    
    // 4. Tentar usar o método direto do websocketManager
    const analistaIdFromManager = this.websocketManager.getAnalistaId(client);
    if (analistaIdFromManager) {
      return analistaIdFromManager;
    }
    
    // 5. Se tiver discordId, tentar mapear para analistaId
    const discordId = client['discordId'];
    if (discordId) {
      // Implementação futura: buscar analista pelo discordId
      // Por enquanto, retorna null
      return null;
    }
    
    return null;
  } catch (error) {
    this.logger.warn(`⚠️ Erro ao obter analistaId: ${error.message}`);
    return null;
  }
}

  // 🔧 MÉTODO PARA SETAR ANALISTAID NO SOCKET (útil para integração)
  setAnalistaIdOnSocket(client: Socket, analistaId: number): void {
    client['analistaId'] = analistaId;
    this.logger.log(`🔗 Analista ID ${analistaId} vinculado ao socket ${client.id}`);
  }
}