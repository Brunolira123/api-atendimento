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

  async handleDisconnect(client: Socket) {
    await this.websocketManager.handleDisconnect(client, this.server);
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
    private readonly jwtService: JwtService
  ) {}

  // ========== AUTH VALIDATION (AGORA PARA ANALISTA LOGIN) ==========
  @SubscribeMessage('auth:validate')
  async handleAuthValidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { token: string }
  ) {
    try {
      // Agora valida token de SESSÃO do analista (não mais do Discord)
      const payload = this.jwtService.verifyAnalistaToken(data.token);
      
      if (!payload) {
        return {
          evento: 'auth:invalid',
          data: { valid: false, reason: 'Token inválido ou expirado' }
        };
      }

      // Verificar se o analista ainda está ativo
      const analista = await this.getAnalistaPorId(payload.id);
      
      if (!analista || !analista.ativo) {
        return {
          evento: 'auth:invalid',
          data: { valid: false, reason: 'Analista não encontrado ou inativo' }
        };
      }

      // Tudo OK - salvar dados do analista no client
      client['user'] = {
        id: analista.id,
        username: analista.username,
        nome: analista.nome_completo,
        email: analista.email,
        role: analista.role,
        departamento_id: analista.departamento_id,
      };
      
      // Enviar notificação de sucesso
      this.logger.log(`🔐 Analista autenticado: ${analista.nome_completo} (${analista.username})`);
      
      return {
        evento: 'auth:valid',
        data: {
          valid: true,
          analista: {
            id: analista.id,
            username: analista.username,
            nome: analista.nome_completo,
            role: analista.role,
          },
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

  // ========== SOLICITAÇÕES DISPONÍVEIS (DASHBOARD) ==========
  @SubscribeMessage('solicitacoes:disponiveis')
  @UseGuards(WsAuthGuard)
  async handleSolicitacoesDisponiveis(@ConnectedSocket() client: Socket) {
    try {
      const analista = client['user'];
      
      // Buscar solicitações pendentes sem analista
      const solicitacoes = await this.conversationManager.getSolicitacoesDisponiveis();
      
      // Formatar para o frontend
      const disponiveis = solicitacoes.map(sol => ({
        id: sol.solicitacaoId,
        razaoSocial: sol.razaoSocial,
        clienteNome: sol.nomeResponsavel,
        tipoProblema: sol.tipoProblema,
        descricao: sol.descricao?.substring(0, 100) + (sol.descricao?.length > 100 ? '...' : ''),
        whatsappId: sol.whatsappId,
        criadoEm: sol.createdAt,
        tempoEspera: this.calcularTempoEspera(sol.createdAt),
        prioridade: this.calcularPrioridade(sol.tipoProblema, sol.createdAt),
      }));
      
      client.emit('solicitacoes:disponiveis:lista', {
        success: true,
        solicitacoes: disponiveis,
        count: disponiveis.length,
        timestamp: new Date().toISOString(),
      });
      
      return {
        evento: 'solicitacoes:disponiveis:lista',
        data: { solicitacoes: disponiveis }
      };
      
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar solicitações: ${error.message}`);
      client.emit('solicitacoes:disponiveis:error', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  // ========== ASSUMIR SOLICITAÇÃO (DASHBOARD) ==========
  @SubscribeMessage('solicitacao:assumir')
  @UseGuards(WsAuthGuard)
  async handleAssumirSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string }
  ) {
    try {
      const analista = client['user'];
      
      // 1. Verificar se ainda está disponível
      const solicitacao = await this.conversationManager.getSolicitacao(data.solicitacaoId);
      
      if (!solicitacao) {
        throw new Error('Solicitação não encontrada');
      }
      
      if (solicitacao.atendente_id) {
        throw new Error('Esta solicitação já foi assumida por outro analista');
      }
      
      // 2. Assumir a solicitação
      await this.conversationManager.assumirSolicitacao(
        data.solicitacaoId,
        analista.nome,
        analista.id
      );
      
      // 3. Notificar todos os analistas para remover da lista
      this.server.emit('solicitacao:remover_disponivel', {
        solicitacaoId: data.solicitacaoId,
        analistaNome: analista.nome,
        timestamp: new Date().toISOString(),
      });
      
      // 4. Notificar analista específico com sucesso
      client.emit('solicitacao:assumida:success', {
        success: true,
        solicitacaoId: data.solicitacaoId,
        message: 'Solicitação assumida com sucesso!',
        redirectTo: `/chat/${data.solicitacaoId}`,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`✅ ${analista.nome} assumiu ${data.solicitacaoId}`);
      
      return {
        evento: 'solicitacao:assumida',
        data: {
          solicitacaoId: data.solicitacaoId,
          analista: analista.nome,
          redirectTo: `/chat/${data.solicitacaoId}`,
        }
      };
      
    } catch (error) {
      this.logger.error(`❌ Erro ao assumir: ${error.message}`);
      client.emit('solicitacao:assumir:error', {
        message: error.message,
        solicitacaoId: data.solicitacaoId,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }

  // ========== CHAT ROOMS ==========
  @SubscribeMessage('chat:subscribe')
  @UseGuards(WsAuthGuard)
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string }
  ) {
    try {
      const analista = client['user'];
      
      const solicitacao = await this.conversationManager.getSolicitacao(data.solicitacaoId);
      
      if (!solicitacao) {
        throw new Error('Solicitação não encontrada');
      }
      
      // 🔥 VERIFICAÇÃO: Analista precisa ser o responsável ou ter permissão
      if (solicitacao.atendente_id && solicitacao.atendente_id !== analista.id) {
        const podeAcessar = await this.verificarPermissaoAcesso(
          analista.id, 
          solicitacao.atendente_id, 
          solicitacao.solicitacaoId
        );
        
        if (!podeAcessar) {
          throw new Error('Esta solicitação já está sendo atendida por outro analista');
        }
      }
      
      // 🔄 ATUALIZAR SOLICITAÇÃO (se ainda não tem analista)
      if (!solicitacao.atendente_id) {
        await this.conversationManager.assumirSolicitacao(
          data.solicitacaoId,
          analista.nome,
          analista.id
        );
        
        this.server.emit('solicitacao:assumida', {
          type: 'analista_assumiu',
          solicitacaoId: data.solicitacaoId,
          analistaId: analista.id,
          analistaNome: analista.nome,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Entrar na sala
      client.join(`solicitacao:${data.solicitacaoId}`);
      
      // 🔄 CARREGAR HISTÓRICO
      const messages = await this.conversationManager.getChatHistory(data.solicitacaoId);
      
      if (this.conversationsService) {
        const moreMessages = await this.conversationsService.getMessagesBySolicitacaoId(
          data.solicitacaoId,
          50
        );
        messages.push(...moreMessages);
      }
      
      messages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // 🎯 Enviar histórico + informações
      client.emit('chat:history:loaded', {
        success: true,
        solicitacaoId: data.solicitacaoId,
        solicitacao: {
          id: solicitacao.solicitacaoId,
          razaoSocial: solicitacao.razaoSocial,
          cnpj: solicitacao.cnpj,
          clienteNome: solicitacao.nomeResponsavel,
          tipoProblema: solicitacao.tipoProblema,
          status: solicitacao.status,
          whatsappId: solicitacao.whatsappId,
          criadoEm: solicitacao.createdAt,
          atendenteAtual: solicitacao.atendenteDiscord || analista.nome,
        },
        messages,
        count: messages.length,
        timestamp: new Date().toISOString(),
      });
      
      this.logger.log(`👥 ${analista.nome} entrou na sala: ${data.solicitacaoId}`);
      
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit('chat:user_joined', {
        analistaId: analista.id,
        analistaNome: analista.nome,
        solicitacaoId: data.solicitacaoId,
        timestamp: new Date().toISOString(),
      });
      
      return {
        evento: 'chat:subscribed',
        data: {
          success: true,
          solicitacaoId: data.solicitacaoId,
          message: 'Conectado ao chat',
          analista: {
            id: analista.id,
            nome: analista.nome,
            username: analista.username,
          }
        }
      };
      
    } catch (error) {
      this.logger.error(`❌ Erro ao entrar na sala: ${error.message}`);
      client.emit('chat:subscribe:error', {
        message: error.message,
        solicitacaoId: data.solicitacaoId,
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
    const analista = client['user'];
    
    client.leave(`solicitacao:${data.solicitacaoId}`);
    
    this.logger.log(`👥 ${analista?.nome} saiu da sala: ${data.solicitacaoId}`);
    
    return {
      evento: 'chat:unsubscribed',
      data: { 
        success: true, 
        solicitacaoId: data.solicitacaoId,
        analista: analista?.nome 
      }
    };
  }

  // ========== CHAT HISTORY ==========
  @SubscribeMessage('chat:history')
  @UseGuards(WsAuthGuard)
  async handleChatHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string; limit?: number }
  ) {
    try {
      const analista = client['user'];
      
      const solicitacao = await this.conversationManager.getSolicitacao(data.solicitacaoId);
      
      if (!solicitacao) {
        throw new Error('Solicitação não encontrada');
      }

      const messages = await this.conversationManager.getChatHistory(data.solicitacaoId);

      if (this.conversationsService) {
        const moreMessages = await this.conversationsService.getMessagesBySolicitacaoId(
          data.solicitacaoId,
          data.limit || 50
        );
        messages.push(...moreMessages);
      }

      messages.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      client.emit('chat:history:loaded', {
        success: true,
        solicitacaoId: data.solicitacaoId,
        messages,
        count: messages.length,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`📜 Histórico enviado para ${analista.nome}: ${data.solicitacaoId} (${messages.length} mensagens)`);

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

  // ========== MÉTODOS DE MENSAGEM ==========
  @SubscribeMessage('mensagem:enviar')
  @UseGuards(WsAuthGuard)
  async handleEnviarMensagem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const analista = client['user'];
    data.atendenteNome = analista.nome;
    data.analistaId = analista.id;
    
    return this.mensagemHandler.handleEnviarMensagem(client, this.server, data);
  }

  // ========== EVENTOS EXISTENTES (mantidos para compatibilidade) ==========
  @SubscribeMessage('whatsapp:simulate')
  async handleSimulateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.mensagemHandler.handleSimulateMessage(client, this.server, data);
  }

  @SubscribeMessage('whatsapp:test')
  handleWhatsAppTest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    this.logger.log(`🧪 Teste WhatsApp recebido de ${client.id}`);
    
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
  
  emitQRCode(qrCode: string) {
    this.whatsappEvents.emitQRCode(this.server, qrCode);
  }

  saveWhatsAppStatus(data: any) {
    this.websocketManager.saveWhatsAppStatus(data);
  }

  emitNovaSolicitacao(solicitacao: any) {
    const conversa = this.conversationManager.mapearParaConversa(solicitacao);
    
    // 🔥 NOTIFICA TODOS OS ANALISTAS CONECTADOS
    this.server.emit('solicitacao:nova', {
      type: 'nova_solicitacao',
      data: conversa,
      timestamp: new Date().toISOString(),
    });
    
    this.whatsappEvents.emitNovaSolicitacao(this.server, conversa);
    this.conversationManager.enviarConversasAtualizadas(this.server);
  }

  emitMessageSent(data: any) {
    if (data.solicitacaoId) {
      this.server.to(`solicitacao:${data.solicitacaoId}`).emit('message:sent', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.whatsappEvents.emitMessageSent(this.server, data);
    }
  }

  emitNovaMensagemCliente(solicitacaoId: string, mensagem: any) {
    this.server.to(`solicitacao:${solicitacaoId}`).emit('message:new', {
      type: 'nova_mensagem',
      data: {
        ...mensagem,
        direction: 'incoming',
      },
      timestamp: new Date().toISOString(),
    });
  }

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

  sendToRoom(solicitacaoId: string, event: string, data: any) {
    this.server.to(`solicitacao:${solicitacaoId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // ========== MÉTODOS PRIVADOS AUXILIARES ==========
 private async verificarPermissaoAcesso(
  analistaId: number, 
  atendenteAtualId: number, 
  solicitacaoId: string
): Promise<boolean> {
  try {
    console.log(`🔍 Verificando permissão: Analista ${analistaId} → Atendente ${atendenteAtualId} → Solicitação ${solicitacaoId}`);
    
    // 1. Se for o mesmo analista, pode acessar
    if (analistaId === atendenteAtualId) {
      console.log(`✅ Permissão concedida: mesmo analista`);
      return true;
    }
    
    // 2. Se a solicitação ainda não tem analista, pode acessar
    const solicitacao = await this.conversationManager.getSolicitacao(solicitacaoId);
    if (!solicitacao?.atendente_id) {
      console.log(`✅ Permissão concedida: solicitação sem analista`);
      return true;
    }
    
    // 3. Simulação: se for analista ID 1 (admin), permite
    if (analistaId === 1) {
      console.log(`✅ Permissão concedida: analista admin (ID 1)`);
      return true;
    }
    
    // 4. Por enquanto, nega todos os outros casos
    console.log(`❌ Permissão negada: analista ${analistaId} não tem acesso`);
    return false;
    
  } catch (error) {
    console.error(`❌ Erro ao verificar permissão: ${error.message}`);
    return false; // Em caso de erro, nega por segurança
  }
}

  private async getAnalistaPorId(id: number): Promise<any> {
    // TODO: Implementar busca no banco de dados
    // Por enquanto, retorna mock
    return {
      id,
      username: `analista${id}`,
      nome_completo: `Analista ${id}`,
      email: `analista${id}@empresa.com`,
      role: 'analista',
      departamento_id: 1,
      ativo: true,
    };
  }

  private calcularTempoEspera(createdAt: Date): string {
    const diff = Date.now() - new Date(createdAt).getTime();
    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (horas > 0) return `${horas}h ${minutos}m`;
    return `${minutos}m`;
  }

  private calcularPrioridade(tipoProblema: string, createdAt: Date): 'alta' | 'normal' | 'baixa' {
    const tempoEspera = Date.now() - new Date(createdAt).getTime();
    const horasEspera = tempoEspera / (1000 * 60 * 60);
    
    if (tipoProblema === 'PDV Parado') return 'alta';
    if (horasEspera > 1) return 'alta';
    if (tipoProblema === 'Promoção / Oferta') return 'normal';
    
    return 'baixa';
  }

  @SubscribeMessage('analista:login')
@UseGuards(WsAuthGuard) // Com JWT do sistema de login
async handleAnalistaLogin(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { analistaId: number; nome: string }
) {
  try {
    const { analistaId, nome } = data;
    
    // Usar o novo método com analistaId
    this.websocketManager.loginAtendenteComAnalista(client, {
      nome,
      analistaId,
    });
    
    // Salvar também no socket para fácil acesso
    client['analistaId'] = analistaId;
    client['atendenteNome'] = nome;
    
    client.emit('analista:logged', {
      success: true,
      analistaId,
      nome,
      socketId: client.id,
      message: 'Login de analista realizado com sucesso',
      timestamp: new Date().toISOString(),
    });
    
    this.logger.log(`👤 Analista logado: ${nome} (ID: ${analistaId})`);
    
    return {
      evento: 'analista:logged',
      data: { analistaId, nome, socketId: client.id }
    };
    
  } catch (error) {
    this.logger.error(`❌ Erro no login de analista: ${error.message}`);
    client.emit('error', {
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

@SubscribeMessage('solicitacoes:nao_finalizadas')
@UseGuards(WsAuthGuard)
async handleSolicitacoesNaoFinalizadas(@ConnectedSocket() client: Socket) {
  try {
    const analista = client['user'];
    
    // Buscar TODAS as não finalizadas
    const solicitacoes = await this.conversationManager.getSolicitacoesNaoFinalizadas();
    
    // Formatar para o frontend
    const naoFinalizadas = solicitacoes.map(sol => ({
      id: sol.solicitacaoId,
      razaoSocial: sol.razaoSocial,
      clienteNome: sol.nomeResponsavel,
      tipoProblema: sol.tipoProblema,
      descricao: sol.descricao?.substring(0, 200) + (sol.descricao?.length > 200 ? '...' : ''),
      whatsappId: sol.whatsappId,
      criadoEm: sol.createdAt,
      tempoEspera: this.calcularTempoEspera(sol.createdAt),
      prioridade: this.calcularPrioridade(sol.tipoProblema, sol.createdAt),
      status: sol.status,
      atendenteId: sol.atendente_id,
      atendenteDiscord: sol.atendenteDiscord,
      finalizadoEm: sol.finalizadoEm,
    }));
    
    client.emit('solicitacoes:nao_finalizadas:lista', {
      success: true,
      solicitacoes: naoFinalizadas,
      count: naoFinalizadas.length,
      timestamp: new Date().toISOString(),
    });
    
    return {
      evento: 'solicitacoes:nao_finalizadas:lista',
      data: { solicitacoes: naoFinalizadas }
    };
    
  } catch (error) {
    this.logger.error(`❌ Erro ao buscar não finalizadas: ${error.message}`);
    client.emit('solicitacoes:nao_finalizadas:error', {
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}
}