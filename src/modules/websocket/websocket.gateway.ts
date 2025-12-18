import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Solicitacao } from '../../shared/entities/solicitacao.entity';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  namespace: 'atendimento',
})
export class WebSocketGatewayService
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGatewayService.name);
  private atendentes = new Map<string, any>();
  private whatsappStatus: any = null;

  constructor(
    @InjectRepository(Solicitacao)
    private solicitacaoRepository: Repository<Solicitacao>,
  ) {}

  // ========== CONEXÃO BÁSICA ==========

  handleConnection(client: Socket) {
  this.logger.log(`🔌 Cliente conectado: ${client.id} às ${new Date().toLocaleTimeString()}`);
  
  // Saudação normal
  client.emit('connected', {
    message: 'Conectado ao Sistema VR Software',
    socketId: client.id,
    timestamp: new Date().toISOString(),
  });
  
  // ✅ SE TEM STATUS SALVO DO WHATSAPP, ENVIA
  if (this.whatsappStatus) {
    this.logger.log(`📤 Enviando status WhatsApp SALVO para ${client.id}`);
    
    setTimeout(() => {
      client.emit('whatsapp:connected', {
        ...this.whatsappStatus,
        timestamp: new Date().toISOString(),
        message: 'Status salvo enviado na conexão',
        source: 'saved_status'
      });
    }, 300);
  }
  
  // Também verifica o WhatsAppService atual
  const whatsappService = this['whatsAppService'];
  if (whatsappService?.isConnected && !this.whatsappStatus) {
    this.logger.log(`📤 Enviando status WhatsApp ATUAL para ${client.id}`);
    
    setTimeout(() => {
      const data = {
        user: whatsappService.client?.info?.pushname || 'Usuário WhatsApp',
        phoneNumber: whatsappService.client?.info?.wid?.user || 'Desconhecido',
        status: 'connected',
        timestamp: new Date().toISOString(),
        message: 'Status atual enviado na conexão',
        source: 'current_status'
      };
      
      client.emit('whatsapp:connected', data);
      this.logger.log(`✅ Status enviado para ${client.id}`);
    }, 300);
  }
}

public saveWhatsAppStatus(data: any) {
  this.whatsappStatus = data;
  this.logger.log(`💾 Status WhatsApp salvo: ${data.user} (${data.phoneNumber})`);
}

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Cliente desconectado: ${client.id}`);

    const atendente = this.atendentes.get(client.id);
    if (atendente) {
      this.atendentes.delete(client.id);
      this.server.emit('atendente:desconectado', {
        nome: atendente.nome,
        socketId: client.id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ========== LOGIN SIMPLES ==========

  @SubscribeMessage('atendente:login')
  handleLogin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { nome: string; discordId?: string },
  ) {
    const { nome, discordId } = data;

    if (!nome || nome.trim().length < 2) {
      client.emit('error', {
        message: 'Nome do atendente é obrigatório (mínimo 2 caracteres)',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    client['atendenteNome'] = nome;
    client['discordId'] = discordId;

    this.atendentes.set(client.id, {
      nome,
      discordId,
      socketId: client.id,
      connectedAt: new Date(),
    });

    client.emit('atendente:logged', {
      success: true,
      nome,
      socketId: client.id,
      message: 'Login realizado com sucesso',
      timestamp: new Date().toISOString(),
    });

    this.server.emit('atendente:novo', {
      id: client.id,
      nome,
      discordId,
      timestamp: new Date().toISOString(),
    });

    // Enviar conversas pendentes após login
    this.enviarConversasPendentes(client);

    this.logger.log(`👤 Atendente logado: ${nome}`);
  }

  // ========== ASSUMIR SOLICITAÇÃO ==========

  @SubscribeMessage('solicitacao:assumir')
  async handleAssumirSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string },
  ) {
    const { solicitacaoId } = data;
    const atendenteNome = client['atendenteNome'] || 'Atendente';

    try {
      // Buscar a solicitação - USANDO O NOME CORRETO DA COLUNA
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId: solicitacaoId },
      });

      if (!solicitacao) {
        client.emit('error', {
          message: `Solicitação ${solicitacaoId} não encontrada`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Atualizar no banco - USANDO OS NOMES CORRETOS
      solicitacao.atendenteDiscord = atendenteNome;
      solicitacao.status = 'em_atendimento';
      // Não temos assumidoEm, então usaremos finalizadoEm como campo temporário
      // Ou você pode adicionar assumidoEm na entity se precisar
      
      await this.solicitacaoRepository.save(solicitacao);

      // Notificar todos os clientes
      this.server.emit('solicitacao:assumida', {
        type: 'atendimento_assumido',
        solicitacaoId,
        atendente: atendenteNome,
        whatsappId: solicitacao.whatsappId,
        atendenteSocketId: client.id,
        timestamp: new Date().toISOString(),
      });

      // Atualizar lista de conversas
      await this.enviarConversasAtualizadas();

      // Resposta específica
      client.emit('solicitacao:assumida:success', {
        solicitacaoId,
        portalUrl: `http://localhost:3000/atendimento/${solicitacaoId}?atendente=${encodeURIComponent(atendenteNome)}`,
        message: 'Solicitação assumida com sucesso',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ ${atendenteNome} assumiu ${solicitacaoId}`);

    } catch (error) {
      this.logger.error(`❌ Erro ao assumir: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao assumir solicitação',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ========== ENVIAR MENSAGEM ==========

  @SubscribeMessage('mensagem:enviar')
  async handleEnviarMensagem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string; mensagem: string; whatsappId?: string },
  ) {
    const { solicitacaoId, mensagem, whatsappId } = data;
    const atendente = client['atendenteNome'] || 'Atendente';

    if (!mensagem || mensagem.trim().length === 0) {
      client.emit('error', {
        message: 'A mensagem não pode estar vazia',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Criar objeto de mensagem
    const novaMensagem = {
      id: `msg_${Date.now()}`,
      solicitacaoId,
      content: mensagem,
      direction: 'outgoing',
      atendente_discord: atendente,
      timestamp: new Date(),
      delivered: true,
      read: false,
    };

    // Emitir para todos
    this.server.emit('message:new', {
      type: 'nova_mensagem',
      data: novaMensagem,
      timestamp: new Date().toISOString(),
    });

    // Se tiver whatsappId, logar (você implementaria envio real aqui)
    if (whatsappId) {
      this.logger.log(`📤 ${atendente} → WhatsApp ${whatsappId}: ${mensagem.substring(0, 50)}...`);
    }

    client.emit('message:sent', {
      success: true,
      messageId: novaMensagem.id,
      message: 'Mensagem enviada com sucesso',
      timestamp: new Date().toISOString(),
    });
  }

  // ========== DISCORD INTEGRATION ==========

  @SubscribeMessage('discord:assumir')
  async handleDiscordAssumir(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string; atendente: string; discordId: string },
  ) {
    const { solicitacaoId, atendente, discordId } = data;
    
    try {
      // Buscar a solicitação - USANDO NOME CORRETO
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId: solicitacaoId },
      });

      if (!solicitacao) {
        client.emit('error', {
          message: `Solicitação ${solicitacaoId} não encontrada`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Atualizar no banco - USANDO NOMES CORRETOS
      solicitacao.atendenteDiscord = atendente;
      solicitacao.status = 'em_atendimento';
      await this.solicitacaoRepository.save(solicitacao);

      // Notificar todos os clientes
      this.server.emit('solicitacao:assumida', {
        type: 'discord_assumido',
        solicitacaoId,
        atendente,
        discordId,
        whatsappId: solicitacao.whatsappId,
        timestamp: new Date().toISOString(),
      });

      // Atualizar lista de conversas
      await this.enviarConversasAtualizadas();

      // Gerar URL do portal
      const portalUrl = `http://localhost:3000/atendimento/${solicitacaoId}?atendente=${encodeURIComponent(atendente)}&discordId=${discordId}&source=discord`;
      
      client.emit('discord:assumido', {
        success: true,
        solicitacaoId,
        portalUrl,
        solicitacao: this.mapearParaConversa(solicitacao),
        message: 'Atendimento assumido via Discord',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ ${atendente} (Discord) assumiu ${solicitacaoId}`);

    } catch (error) {
      this.logger.error(`❌ Erro no Discord: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao assumir via Discord',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ========== FINALIZAR SOLICITAÇÃO ==========

  @SubscribeMessage('solicitacao:finalizar')
  async handleFinalizarSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string; resolucao?: string },
  ) {
    const { solicitacaoId, resolucao } = data;
    const atendente = client['atendenteNome'] || 'Atendente';

    try {
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId: solicitacaoId },
      });

      if (!solicitacao) {
        client.emit('error', {
          message: `Solicitação ${solicitacaoId} não encontrada`,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Atualizar status e data de finalização
      solicitacao.status = 'resolvida';
      solicitacao.finalizadoEm = new Date();
      await this.solicitacaoRepository.save(solicitacao);

      // Notificar todos
      this.server.emit('solicitacao:finalizada', {
        type: 'solicitacao_finalizada',
        solicitacaoId,
        atendente,
        resolucao,
        timestamp: new Date().toISOString(),
      });

      // Atualizar conversas
      await this.enviarConversasAtualizadas();

      client.emit('solicitacao:finalizada:success', {
        success: true,
        solicitacaoId,
        message: 'Atendimento finalizado com sucesso',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ ${atendente} finalizou ${solicitacaoId}`);

    } catch (error) {
      this.logger.error(`❌ Erro ao finalizar: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao finalizar solicitação',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ========== SIMULAÇÃO ==========

  @SubscribeMessage('whatsapp:simulate')
  async handleSimulateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { from: string; message: string },
  ) {
    const { from, message } = data;

    // Criar solicitação simulada - USANDO OS NOMES CORRETOS
    const solicitacao = this.solicitacaoRepository.create({
      solicitacaoId: `SIM${Date.now()}`,
      whatsappId: from,
      nomeResponsavel: `Cliente Simulado ${from.slice(-4)}`,
      razaoSocial: 'Empresa Teste Ltda',
      cnpj: '12.345.678/0001-99',
      tipoProblema: 'Teste do Sistema',
      descricao: message,
      status: 'pendente', // Note: seu entity usa 'pendente' como default, não 'nova'
      atendenteDiscord: null,
      createdAt: new Date(),
      finalizadoEm: null,
    });

    await this.solicitacaoRepository.save(solicitacao);

    // Notificar nova solicitação
    this.emitNovaSolicitacao(this.mapearParaConversa(solicitacao));

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

    this.server.emit('message:new', {
      type: 'nova_mensagem',
      data: mensagemSimulada,
      timestamp: new Date().toISOString(),
    });

    client.emit('whatsapp:simulated', {
      success: true,
      solicitacaoId: solicitacao.solicitacaoId,
      message: 'Mensagem simulada criada com sucesso',
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`🧪 Simulação: ${solicitacao.solicitacaoId} de ${from}`);
  }

  // ========== MÉTODOS AUXILIARES ==========

  private async enviarConversasPendentes(client: Socket) {
    try {
      // Busca por status 'pendente' (como está na sua entity)
      const solicitacoes = await this.solicitacaoRepository.find({
        where: { status: 'pendente' },
        order: { createdAt: 'DESC' },
      });

      client.emit('conversations:pending', {
        type: 'conversations_pending',
        data: solicitacoes.map(sol => this.mapearParaConversa(sol)),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar conversas: ${error.message}`);
    }
  }

  private async enviarConversasAtualizadas() {
    try {
      const solicitacoes = await this.solicitacaoRepository.find({
        order: { createdAt: 'DESC' },
      });

      this.server.emit('conversations:update', {
        type: 'conversations_update',
        data: solicitacoes.map(sol => this.mapearParaConversa(sol)),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao atualizar conversas: ${error.message}`);
    }
  }

  private mapearParaConversa(solicitacao: Solicitacao): any {
    // Mapeia o status do banco para o status do frontend
    const statusMap: Record<string, string> = {
      'pendente': 'pending',
      'em_atendimento': 'active',
      'resolvida': 'closed',
      'finalizada': 'closed',
      'nova': 'pending', // se você usar 'nova' em algum lugar
    };

    return {
      id: solicitacao.solicitacaoId,
      whatsapp_id: solicitacao.whatsappId,
      customer_name: solicitacao.nomeResponsavel,
      status: statusMap[solicitacao.status] || 'pending',
      last_message: solicitacao.descricao?.substring(0, 100) || '',
      last_message_at: solicitacao.createdAt,
      atendente_discord: solicitacao.atendenteDiscord || null,
      created_at: solicitacao.createdAt,
      razao_social: solicitacao.razaoSocial,
      cnpj: solicitacao.cnpj,
      tipo_problema: solicitacao.tipoProblema,
      descricao: solicitacao.descricao,
      finalizado_em: solicitacao.finalizadoEm,
    };
  }

  // ========== MÉTODOS DE EMISSÃO ==========

  emitQRCode(qrCode: string) {
    this.server.emit('whatsapp:qr', {
      qrCode,
      timestamp: new Date().toISOString(),
    });
  }

  emitWhatsAppReady(info: any) {
    this.server.emit('whatsapp:ready', {
      info,
      timestamp: new Date().toISOString(),
    });
  }

  emitWhatsAppConnected(user: any) {
    this.server.emit('whatsapp:connected', {
      user,
      timestamp: new Date().toISOString(),
    });
  }

  emitNovaSolicitacao(solicitacao: any) {
    this.server.emit('solicitacao:nova', {
      type: 'nova_solicitacao',
      data: solicitacao,
      timestamp: new Date().toISOString(),
    });

    // Atualizar também a lista de conversas
    this.enviarConversasAtualizadas();
  }

  emitMessageSent(data: any) {
    this.server.emit('message:sent', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  emitAtendimentoFinalizado(data: any) {
    this.server.emit('atendimento:finalizado', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  emitSolicitacaoAssumida(data: any) {
    this.server.emit('solicitacao:assumida', {
      type: 'discord_assumida',
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  emitNovaMensagem(data: any) {
    this.server.emit('message:new', {
      type: 'nova_mensagem',
      data,
      timestamp: new Date().toISOString(),
    });
  }

  emitStatusUpdate(data: any) {
    this.server.emit('status:update', {
      type: 'status_update',
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // Método para obter estatísticas
  getStats() {
    return {
      connectedClients: this.server.engine.clientsCount,
      atendentesAtivos: this.atendentes.size,
      atendentes: Array.from(this.atendentes.values()).map(a => ({
        nome: a.nome,
        discordId: a.discordId,
        connectedAt: a.connectedAt,
        socketId: a.socketId,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  // Método para emitir estatísticas
  emitStats() {
    this.server.emit('stats:update', {
      type: 'stats_update',
      stats: this.getStats(),
      timestamp: new Date().toISOString(),
    });
  }


  @SubscribeMessage('whatsapp:test')
handleWhatsAppTest(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: any,
) {
  this.logger.log(`🧪 Teste WhatsApp recebido de ${client.id}`);
  
  // Verifica se consegue emitir
  this.server.emit('whatsapp:test_response', {
    success: true,
    serverReady: !!this.server,
    timestamp: new Date().toISOString(),
    message: 'WebSocketGateway está funcionando!'
  });
  
  // Verifica se tem instância do WhatsAppService
  if (this['whatsAppService']) {
    this.logger.log('✅ WhatsAppService encontrado no gateway');
  } else {
    this.logger.warn('⚠️ WhatsAppService NÃO encontrado no gateway');
  }
}
}