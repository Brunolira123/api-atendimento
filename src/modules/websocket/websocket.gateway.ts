import {
  WebSocketGateway,
  OnGatewayInit,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WebSocketManagerService } from './services/websocket-manager.service';
import { ConversationManagerService } from './services/conversation-manager.service';
import { WhatsAppEventsService } from './services/whatsapp-events.service';
import { AtendimentoHandler } from './handlers/atendimento.handler';
import { MensagemHandler } from './handlers/mensagem.handler';
import { DiscordHandler } from './handlers/discord.handler';
import { ConversationsService } from '@modules/conversations/conversations.service';
import { WsAuthGuard } from './guards/ws-auth.guard';
import { JwtService } from '../auth/jwt.service';

@WebSocketGateway({
  namespace: '/atendimento', 
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebSocketGatewayService implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

    afterInit() {
    console.log('🔥 WebSocketGateway inicializado');
    console.log(`📡 Namespace: /atendimento`);
    
    this.server.on('connection', (socket) => {
      console.log(`🎯 Cliente conectado no namespace /atendimento: ${socket.id}`);
    });
  }


  handleConnection(client: Socket) {
    console.log(`🔌 Nova conexão: ${client.id}`);
    this.websocketManager.handleConnection(client, this.server);
  }

  

  private readonly logger = new Logger(WebSocketGatewayService.name);

  constructor(
    private readonly websocketManager: WebSocketManagerService,
    private readonly atendimentoHandler: AtendimentoHandler,
    private readonly mensagemHandler: MensagemHandler,
    private readonly discordHandler: DiscordHandler,
    private readonly whatsappEvents: WhatsAppEventsService,
    private readonly conversationManager: ConversationManagerService,
    private readonly conversationsService: ConversationsService,
    private readonly jwtService: JwtService // ✅ Adicionado para auth
  ) {}

  // ========== CONEXÃO BÁSICA ==========

  /*
  async handleConnection(client: Socket) {
    await this.websocketManager.handleConnection(client, this.server);
  }
*/
  async handleDisconnect(client: Socket) {
    await this.websocketManager.handleDisconnect(client, this.server);
  }

  // ========== AUTH VALIDATION (PASSO 3) ==========
  @SubscribeMessage('auth:validate')
  async handleAuthValidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { token: string }
  ) {
    try {
      const payload = this.jwtService.verifyDiscordToken(data.token);
      
      if (!payload) {
        return {
          evento: 'auth:invalid',
          data: { valid: false, reason: 'Token inválido' }
        };
      }

      // Verificar se a solicitação ainda existe e está ativa
      const solicitacao = await this.conversationManager.getSolicitacao(
        payload.solicitacaoId
      );

      if (!solicitacao) {
        return {
          evento: 'auth:invalid',
          data: { valid: false, reason: 'Solicitação não encontrada' }
        };
      }

      // Tudo OK
      client['user'] = payload; // Salvar no client
      
      return {
        evento: 'auth:valid',
        data: {
          valid: true,
          solicitacaoId: payload.solicitacaoId,
          atendenteNome: payload.atendenteNome,
          discordId: payload.discordId,
          expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
        }
      };

    } catch (error) {
      this.logger.error(`❌ Erro na validação: ${error.message}`);
      return {
        evento: 'auth:error',
        data: { valid: false, error: error.message }
      };
    }
  }

  // ========== CHAT ROOMS (PASSO 1) ==========
  @SubscribeMessage('chat:subscribe')
  @UseGuards(WsAuthGuard)
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string }
  ) {
    try {
      // Agora temos client['user'] com os dados do token
      const user = client['user']; // { solicitacaoId, atendenteNome, discordId, discordTag }
      
      // Verificar se o token corresponde à sala que está tentando acessar
      if (user.solicitacaoId !== data.solicitacaoId) {
        throw new Error('Acesso não autorizado a esta conversa');
      }

      // Validar se o atendente tem acesso a esta solicitação
      const solicitacao = await this.conversationManager.getSolicitacao(data.solicitacaoId);
      
      if (!solicitacao) {
        throw new Error('Solicitação não encontrada');
      }
      
      if (solicitacao.atendenteDiscord && solicitacao.atendenteDiscord !== user.atendenteNome) {
        // Opcional: permitir mesmo se não for o atendente?
        // throw new Error('Você não tem acesso a esta conversa');
      }
      
      // Entrar na sala
      client.join(`solicitacao:${data.solicitacaoId}`);

      // 🔄 CARREGAR HISTÓRICO AUTOMATICAMENTE
      const messages = await this.conversationManager.getChatHistory(data.solicitacaoId);
      
      // Adicionar mensagens do ConversationsService se existir
      if (this.conversationsService) {
        const moreMessages = await this.conversationsService.getMessagesBySolicitacaoId(
          data.solicitacaoId,
          50
        );
        messages.push(...moreMessages);
      }

      // Ordenar por timestamp
      messages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Enviar histórico para o cliente
      client.emit('chat:history:loaded', {
        success: true,
        solicitacaoId: data.solicitacaoId,
        messages,
        count: messages.length,
        timestamp: new Date().toISOString(),
      });
      
      // Log
      this.logger.log(`👥 ${user.atendenteNome} entrou na sala: ${data.solicitacaoId}`);
      
      // Notificar outros na mesma sala (opcional)
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit('chat:user_joined', {
        atendente: user.atendenteNome,
        solicitacaoId: data.solicitacaoId,
        timestamp: new Date().toISOString(),
      });
      
      return {
        evento: 'chat:subscribed',
        data: {
          success: true,
          solicitacaoId: data.solicitacaoId,
          message: 'Conectado ao chat',
          atendente: user.atendenteNome
        }
      };
      
    } catch (error) {
      this.logger.error(`❌ Erro ao entrar na sala: ${error.message}`);
      client.emit('error', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  @SubscribeMessage('chat:unsubscribe')
  @UseGuards(WsAuthGuard)
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string }
  ) {
    const user = client['user'];
    
    client.leave(`solicitacao:${data.solicitacaoId}`);
    
    this.logger.log(`👥 ${user?.atendenteNome || 'Cliente'} saiu da sala: ${data.solicitacaoId}`);
    
    return {
      evento: 'chat:unsubscribed',
      data: { 
        success: true, 
        solicitacaoId: data.solicitacaoId,
        atendente: user?.atendenteNome 
      }
    };
  }

  // ========== CHAT HISTORY (PASSO 2) ==========
  @SubscribeMessage('chat:history')
  @UseGuards(WsAuthGuard)
  async handleChatHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string; limit?: number }
  ) {
    try {
      const user = client['user'];
      
      // Validar acesso
      const solicitacao = await this.conversationManager.getSolicitacao(data.solicitacaoId);
      
      if (!solicitacao) {
        throw new Error('Solicitação não encontrada');
      }

      // Buscar histórico
      const messages = await this.conversationManager.getChatHistory(data.solicitacaoId);

      // Adicionar do ConversationsService se existir
      if (this.conversationsService) {
        const moreMessages = await this.conversationsService.getMessagesBySolicitacaoId(
          data.solicitacaoId,
          data.limit || 50
        );
        messages.push(...moreMessages);
      }

      // Ordenar por timestamp
      messages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Enviar para o cliente
      client.emit('chat:history:loaded', {
        success: true,
        solicitacaoId: data.solicitacaoId,
        messages,
        count: messages.length,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`📜 Histórico enviado para ${user.atendenteNome}: ${data.solicitacaoId} (${messages.length} mensagens)`);

      return {
        evento: 'chat:history:loaded',
        data: {
          solicitacaoId: data.solicitacaoId,
          messages,
          count: messages.length,
        }
      };

    } catch (error) {
      this.logger.error(`❌ Erro ao carregar histórico: ${error.message}`);
      client.emit('chat:history:error', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  // ========== HANDLERS DE ATENDIMENTO ==========
  @SubscribeMessage('atendente:login')
  async handleLogin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.atendimentoHandler.handleLogin(client, this.server, data);
  }

  @SubscribeMessage('solicitacao:assumir')
  async handleAssumirSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.atendimentoHandler.handleAssumirSolicitacao(client, this.server, data);
  }

  @SubscribeMessage('solicitacao:finalizar')
  async handleFinalizarSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.atendimentoHandler.handleFinalizarSolicitacao(client, this.server, data);
  }

  // ========== HANDLERS DE MENSAGEM ==========
  @SubscribeMessage('mensagem:enviar')
  @UseGuards(WsAuthGuard)
  async handleEnviarMensagem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    // Adicionar atendente do token
    const user = client['user'];
    data.atendenteNome = user.atendenteNome;
    
    return this.mensagemHandler.handleEnviarMensagem(client, this.server, data);
  }

  @SubscribeMessage('whatsapp:simulate')
  async handleSimulateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.mensagemHandler.handleSimulateMessage(client, this.server, data);
  }

  // ========== HANDLERS DO DISCORD ==========
  @SubscribeMessage('discord:assumir')
  async handleDiscordAssumir(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.discordHandler.handleDiscordAssumir(client, this.server, data);
  }

  // ========== TESTE ==========
   @SubscribeMessage('whatsapp:test')
  handleWhatsAppTest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    this.logger.log(`🧪 Teste WhatsApp recebido de ${client.id}`);
    
    // 🔍 ADICIONE ESTE LOG:
    console.log('📤 Emitindo whatsapp:test_response...');
    console.log('Client ID:', client.id);
    console.log('Server exists?', !!this.server);
    
    // Verifique se o server está definido
    if (!this.server) {
      this.logger.error('❌ Server não está definido!');
      return {
        evento: 'error',
        data: { message: 'Server não disponível' }
      };
    }
    
    this.server.emit('whatsapp:test_response', {
      success: true,
      serverReady: !!this.server,
      timestamp: new Date().toISOString(),
      message: 'WebSocketGateway está funcionando!'
    });
    
    this.logger.log('✅ Teste emitido para todos os clientes');
    
    return {
      evento: 'whatsapp:test_response',
      data: {
        success: true,
        message: 'Teste recebido'
      }
    };
  }


  // ========== MÉTODOS PÚBLICOS PARA WHATSAPPSERVICE ==========
  
  // 1. Método para emitir QR Code (que estava faltando)
  emitQRCode(qrCode: string) {
    this.whatsappEvents.emitQRCode(this.server, qrCode);
  }

  // 2. Método para salvar status do WhatsApp
  saveWhatsAppStatus(data: any) {
    this.websocketManager.saveWhatsAppStatus(data);
  }

  // 3. Método para emitir nova solicitação
  emitNovaSolicitacao(solicitacao: any) {
    // Converte para o formato de conversa
    const conversa = this.conversationManager.mapearParaConversa(solicitacao);
    
    // Emite para TODOS (para lista geral)
    this.server.emit('solicitacao:nova', {
      type: 'nova_solicitacao',
      data: conversa,
      timestamp: new Date().toISOString(),
    });
    
    // 🔴 NÃO emitir para sala ainda - só quando alguém entrar
    // Apenas emite via serviço de eventos para logs
    this.whatsappEvents.emitNovaSolicitacao(this.server, conversa);
    
    // Atualiza também a lista de conversas
    this.conversationManager.enviarConversasAtualizadas(this.server);
  }

  // 4. Método para emitir mensagem enviada
  emitMessageSent(data: any) {
    // Usando sala específica agora
    if (data.solicitacaoId) {
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit('message:sent', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.whatsappEvents.emitMessageSent(this.server, data);
    }
  }

  // 5. Método para emitir nova mensagem do cliente
  emitNovaMensagemCliente(solicitacaoId: string, mensagem: any) {
    // Enviar apenas para a sala da solicitação
    this.server.to(`solicitacao:${solicitacaoId}`).emit('message:new', {
      type: 'nova_mensagem',
      data: {
        ...mensagem,
        direction: 'incoming',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // 6. Métodos adicionais que podem ser necessários
  emitWhatsAppReady(info: any) {
    this.whatsappEvents.emitWhatsAppReady(this.server, info);
  }

  emitWhatsAppConnected(user: any) {
    this.whatsappEvents.emitWhatsAppConnected(this.server, user);
  }

  emitAtendimentoFinalizado(data: any) {
    if (data.solicitacaoId) {
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit('atendimento:finalizado', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.server.emit('atendimento:finalizado', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  emitSolicitacaoAssumida(data: any) {
    if (data.solicitacaoId) {
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit('solicitacao:assumida', {
        type: 'discord_assumida',
        ...data,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.server.emit('solicitacao:assumida', {
        type: 'discord_assumida',
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  emitNovaMensagem(data: any) {
    if (data.solicitacaoId) {
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit('message:new', {
        type: 'nova_mensagem',
        data,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.whatsappEvents.emitNovaMensagem(this.server, data);
    }
  }

  emitStatusUpdate(data: any) {
    this.whatsappEvents.emitStatusUpdate(this.server, data);
  }

  // ========== MÉTODOS AUXILIARES ==========
  emit(event: string, data: any) {
    // Método genérico - usa sala se tiver solicitacaoId
    if (data.solicitacaoId) {
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.server.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  getStats() {
    return this.websocketManager.getStats(this.server);
  }

  // ========== MÉTODO PARA ENVIAR MENSAGEM PARA SALA ESPECÍFICA ==========
  sendToRoom(solicitacaoId: string, event: string, data: any) {
    this.server.to(`solicitacao:${solicitacaoId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}