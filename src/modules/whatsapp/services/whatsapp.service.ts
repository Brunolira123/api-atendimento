// src/modules/whatsapp/whatsapp.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import { Solicitacao } from '../../../shared/entities/solicitacao.entity';
import { WebSocketGatewayService } from '../../websocket/websocket.gateway';
import { WhatsAppSessionService } from '../services/whatsapp.session.service';
import { WhatsAppMessageService } from '../services/whatsapp.message.service';
import { WhatsAppNotificationService } from '../services/whatsapp-notification.service';

@Injectable()
export class WhatsAppService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Client;
  private isConnected = false;
  private qrCode: string;
  private messageService: WhatsAppMessageService;

  constructor(
    @InjectRepository(Solicitacao)
    private readonly solicitacaoRepository: Repository<Solicitacao>,
    private readonly configService: ConfigService,
    private readonly webSocketGateway: WebSocketGatewayService,
    private readonly sessionService: WhatsAppSessionService,
    private readonly notificationService: WhatsAppNotificationService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.logger.log('🔄 Inicializando WhatsApp Service...');

    const sessionPath = this.configService.get('WHATSAPP_SESSION_PATH', './whatsapp-sessions');
    
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
      this.logger.log(`📁 Criado diretório de sessões: ${sessionPath}`);
    }

    try {
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: sessionPath,
          clientId: this.configService.get('WHATSAPP_CLIENT_ID', 'vr-atendimento-bot'),
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--single-process',
            '--no-zygote',
          ],
          timeout: 30000,
        },
      });

      // Inicializa o message service
      this.messageService = new WhatsAppMessageService(this.client, this.isConnected);

      this.setupEventHandlers();
      await this.client.initialize();
      
      this.logger.log('✅ WhatsApp inicializado, aguardando QR Code...');
    } catch (error) {
      this.logger.error(`❌ Erro ao inicializar WhatsApp: ${error.message}`);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // QR Code
    this.client.on('qr', (qr) => {
      this.handleQRCode(qr);
    });

    // Ready
    this.client.on('ready', () => {
      this.handleReady();
    });

    // Mensagem recebida
    this.client.on('message', async (message: any) => {
      await this.handleIncomingMessage(message);
    });

    // Autenticação falhou
    this.client.on('auth_failure', (msg) => {
      this.logger.error(`❌ Falha na autenticação: ${msg}`);
      this.isConnected = false;
    });

    // Desconectado
    this.client.on('disconnected', (reason) => {
      this.logger.warn(`❌ WhatsApp desconectado: ${reason}`);
      this.isConnected = false;

      setTimeout(() => {
        if (!this.isConnected) {
          this.logger.log('🔄 Tentando reconectar WhatsApp...');
          this.restart();
        }
      }, 30000);
    });
  }

  private handleQRCode(qr: string): void {
    this.qrCode = qr;
    this.logger.log('📱 QR Code recebido!');

    console.log('\n' + '='.repeat(60));
    console.log('🚀 VR SOFTWARE - ESCANEIE O QR CODE');
    console.log('='.repeat(60));
    qrcode.generate(qr, { small: true });
    console.log('='.repeat(60));
    console.log('⏳ Aguardando autenticação...');
    console.log('='.repeat(60) + '\n');

    if (this.webSocketGateway) {
      this.webSocketGateway.emitQRCode(qr);
    }
  }

  private handleReady(): void {
    this.isConnected = true;
    const userNumber = this.client.info?.wid?.user || 'Desconhecido';
    const userName = this.client.info?.pushname || 'Usuário WhatsApp';

    this.logger.log(`✅ WhatsApp conectado: ${userNumber}`);
    
    // Atualiza o message service com a nova conexão
    this.messageService = new WhatsAppMessageService(this.client, this.isConnected);

    const eventData = {
      user: userName,
      phoneNumber: userNumber,
      wid: this.client.info?.wid,
      pushname: this.client.info?.pushname,
      status: 'connected',
      timestamp: new Date().toISOString(),
      source: 'whatsapp_service'
    };
    
    // SALVA O STATUS NO GATEWAY
    if (this.webSocketGateway.saveWhatsAppStatus) {
      this.webSocketGateway.saveWhatsAppStatus(eventData);
    }
    
    // Emite para TODOS os clientes (se houver)
    if (this.webSocketGateway?.server) {
      this.webSocketGateway.server.emit('whatsapp:connected', eventData);
      this.logger.log(`✅ Eventos emitidos para ${this.webSocketGateway.server.engine.clientsCount} clientes`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SISTEMA PRONTO PARA ATENDIMENTO');
    console.log(`📱 WhatsApp: ${userNumber}`);
    console.log(`👤 Nome: ${userName}`);
    console.log('🕒 Sistema: Online e operacional');
    console.log('='.repeat(60) + '\n');
  }

  private async handleIncomingMessage(message: any): Promise<void> {
    try {
      // Filtro para ignorar grupos, newsletters, status, etc.
      const whatsappId = message.from;
      const texto = message.body || '';
      
      if (this.shouldIgnoreMessage(message, whatsappId)) {
        return;
      }
      
      // Extrair apenas o número
      const numero = whatsappId.replace('@c.us', '');
      
      if (!/^\d+$/.test(numero)) {
        this.logger.warn(`📭 Número inválido: ${whatsappId}`);
        return;
      }

      this.logger.log(`📩 Mensagem de ${numero}: ${texto.substring(0, 100)}`);

      // Verifica se já tem sessão ativa
      let sessao = this.sessionService.getSessao(numero);

      if (!sessao) {
        await this.iniciarColeta(numero);
      } else {
        await this.processarMensagem(numero, texto, sessao);
      }
    } catch (error: any) {
      this.logger.error(`❌ Erro ao processar mensagem: ${error.message}`);
    }
  }

  private shouldIgnoreMessage(message: any, whatsappId: string): boolean {
    // Ignorar newsletters
    if (whatsappId.includes('@newsletter')) {
      this.logger.log(`📭 Ignorando newsletter: ${whatsappId}`);
      return true;
    }
    
    // Verificar se é grupo
    const isGroup = whatsappId.endsWith('@g.us') || 
                   whatsappId.includes('@g.us') ||
                   (message.id && message.id.participant) ||
                   message.type === 'gp2' ||
                   message.type === 'group';
    
    // Verificar se é status/notificação
    const isStatus = message.type === 'notification' || 
                    message.type === 'e2e_notification' ||
                    message.type === 'call_log' ||
                    !message.body?.trim() ||
                    message.body?.startsWith('‎');
    
    // Verificar se é broadcast
    const isBroadcast = message.type === 'broadcast' || 
                       message.type === 'template';
    
    if (isGroup || isStatus || isBroadcast) {
      this.logger.log(`📭 Ignorando mensagem (tipo: ${message.type}, grupo: ${isGroup}): ${whatsappId}`);
      return true;
    }
    
    return false;
  }

  private async iniciarColeta(whatsappId: string): Promise<void> {
    const sessao = this.sessionService.criarSessao(whatsappId);
    const mensagemInicial = this.messageService.gerarMensagemInicial();
    
    await this.messageService.enviarMensagem(whatsappId, mensagemInicial);
    this.logger.log(`📝 Iniciada coleta para ${whatsappId}`);
  }

  private async processarMensagem(whatsappId: string, texto: string, sessao: any): Promise<void> {
    try {
      switch (sessao.estado) {
        case 'aguardando_razao_social':
          await this.processarRazaoSocial(whatsappId, texto, sessao);
          break;
        case 'aguardando_cnpj':
          await this.processarCNPJ(whatsappId, texto, sessao);
          break;
        case 'aguardando_nome':
          await this.processarNome(whatsappId, texto, sessao);
          break;
        case 'aguardando_opcao':
          await this.processarOpcao(whatsappId, texto, sessao);
          break;
        case 'aguardando_descricao':
          await this.processarDescricao(whatsappId, texto, sessao);
          break;
        default:
          this.logger.warn(`Estado desconhecido para ${whatsappId}: ${sessao.estado}`);
          await this.messageService.enviarMensagem(
            whatsappId, 
            '✅ Sua solicitação já foi registrada! Um atendente entrará em contato em breve.'
          );
      }
    } catch (error) {
      this.logger.error(`Erro no processamento para ${whatsappId}: ${error.message}`);
      await this.messageService.enviarMensagem(whatsappId, `❌ Ocorreu um erro: ${error.message}`);
    }
  }

  private async processarRazaoSocial(whatsappId: string, texto: string, sessao: any): Promise<void> {
    if (!texto.trim()) {
      await this.messageService.enviarMensagem(whatsappId, '❌ *Por favor, informe a razão social da loja:*');
      return;
    }

    sessao = this.sessionService.processarRazaoSocial(whatsappId, texto, sessao);
    this.sessionService.atualizarSessao(whatsappId, sessao);
    
    const mensagem = this.messageService.gerarMensagemRazaoSocialRegistrada();
    await this.messageService.enviarMensagem(whatsappId, mensagem);
  }

  private async processarCNPJ(whatsappId: string, texto: string, sessao: any): Promise<void> {
    if (!this.sessionService.validarCNPJ(texto)) {
      await this.messageService.enviarMensagem(
        whatsappId,
        '❌ *CNPJ inválido!*\n\nPor favor, informe um CNPJ com 14 dígitos (apenas números):\n_Exemplo: 11222333000144_',
      );
      return;
    }

    sessao = this.sessionService.processarCNPJ(whatsappId, texto, sessao);
    this.sessionService.atualizarSessao(whatsappId, sessao);
    
    const mensagem = this.messageService.gerarMensagemCNPJRegistrado();
    await this.messageService.enviarMensagem(whatsappId, mensagem);
  }

  private async processarNome(whatsappId: string, texto: string, sessao: any): Promise<void> {
    if (!texto.trim()) {
      await this.messageService.enviarMensagem(whatsappId, '❌ *Por favor, informe seu nome completo:*');
      return;
    }

    sessao = this.sessionService.processarNome(whatsappId, texto, sessao);
    this.sessionService.atualizarSessao(whatsappId, sessao);
    
    const menu = this.messageService.gerarMenuOpcoes(this.sessionService.getMenuOpcoes());
    await this.messageService.enviarMensagem(whatsappId, menu);
  }

  private async processarOpcao(whatsappId: string, texto: string, sessao: any): Promise<void> {
    const opcao = parseInt(texto.trim());
    
    if (!this.sessionService.validarOpcao(opcao)) {
      await this.messageService.enviarMensagem(
        whatsappId,
        '❌ *Opção inválida!*\n\nPor favor, digite apenas um número de 1 a 5:',
      );
      return;
    }

    sessao = this.sessionService.processarOpcao(whatsappId, texto, sessao);
    this.sessionService.atualizarSessao(whatsappId, sessao);
    
    const mensagem = this.messageService.gerarMensagemOpcaoRegistrada();
    await this.messageService.enviarMensagem(whatsappId, mensagem);
  }

  private async processarDescricao(whatsappId: string, texto: string, sessao: any): Promise<void> {
    if (!texto.trim()) {
      await this.messageService.enviarMensagem(whatsappId, '❌ *Por favor, descreva o problema:*');
      return;
    }

    sessao = this.sessionService.processarDescricao(whatsappId, texto, sessao);
    this.sessionService.atualizarSessao(whatsappId, sessao);

    await this.finalizarColeta(whatsappId, sessao);
  }

  private async finalizarColeta(whatsappId: string, sessao: any): Promise<void> {
    try {
      const solicitacaoId = `SOL${Date.now()}${Math.random()
        .toString(36)
        .substr(2, 4)
        .toUpperCase()}`;

      sessao.dados.solicitacaoId = solicitacaoId;
      sessao.dados.fim = new Date();
      sessao.dados.status = 'pendente';

      // Salva no banco
      const solicitacao = this.solicitacaoRepository.create({
        solicitacaoId,
        whatsappId,
        razaoSocial: sessao.dados.razaoSocial,
        cnpj: sessao.dados.cnpj,
        nomeResponsavel: sessao.dados.nomeResponsavel,
        tipoProblema: sessao.dados.tipoProblema,
        descricao: sessao.dados.descricaoProblema,
        status: 'pendente',
        createdAt: new Date(),
      });

      await this.solicitacaoRepository.save(solicitacao);

      // Mensagem para o cliente
      const mensagemCliente = this.messageService.gerarMensagemSolicitacaoRegistrada(solicitacaoId, sessao.dados);
      await this.messageService.enviarMensagem(whatsappId, mensagemCliente);

      // Envia notificação
      await this.notificationService.notificarSolicitacao(whatsappId, {
        solicitacaoId,
        razaoSocial: sessao.dados.razaoSocial,
        cnpj: sessao.dados.cnpj,
        nomeResponsavel: sessao.dados.nomeResponsavel,
        tipoProblema: sessao.dados.tipoProblema,
        descricaoProblema: sessao.dados.descricaoProblema,
        opcaoEscolhida: sessao.dados.opcaoEscolhida,
      });

      // Notifica via WebSocket
      if (this.webSocketGateway) {
        this.webSocketGateway.emitNovaSolicitacao({
          id: solicitacaoId,
          razaoSocial: sessao.dados.razaoSocial,
          cnpj: this.messageService.formatarCNPJ(sessao.dados.cnpj),
          nomeResponsavel: sessao.dados.nomeResponsavel,
          tipoProblema: sessao.dados.tipoProblema,
          descricao: sessao.dados.descricaoProblema?.substring(0, 200) + '...',
          whatsappId,
          status: 'pendente',
          prioridade: sessao.dados.opcaoEscolhida === 1 ? 'alta' : 'normal',
        });
      }

      // Marca como finalizada
      this.sessionService.finalizarSessao(whatsappId);

      this.logger.log(`✅ Solicitação ${solicitacaoId} registrada com sucesso`);
    } catch (error: any) {
      this.logger.error(`❌ Erro ao finalizar coleta: ${error.message}`);
      await this.messageService.enviarMensagem(
        whatsappId,
        '❌ Ocorreu um erro ao registrar sua solicitação. Por favor, tente novamente.',
      );
    }
  }

  // Métodos públicos mantidos para compatibilidade
  async enviarMensagem(
    whatsappId: string,
    mensagem: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.messageService.enviarMensagem(whatsappId, mensagem);
  }

  async enviarMensagemAtendente(
    whatsappId: string, 
    mensagem: string, 
    atendenteNome: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.messageService.enviarMensagemAtendente(whatsappId, mensagem, atendenteNome);
    
    if (result.success && this.webSocketGateway) {
      this.webSocketGateway.emitMessageSent({
        type: 'message_sent',
        data: {
          whatsappId,
          content: mensagem,
          direction: 'outgoing',
          atendente: atendenteNome,
          timestamp: new Date().toISOString(),
        },
      });
    }
    
    return result;
  }

  async getStatus() {
    const sessoesAtivas = Array.from(this.sessionService.getSessoesAtivas().values()).filter(
      (s) => s.estado !== 'finalizada',
    ).length;

    return {
      isConnected: this.isConnected,
      hasQr: !!this.qrCode,
      sessoesAtivas,
      timestamp: new Date().toISOString(),
      whatsappInfo: this.client?.info ? {
        wid: this.client.info.wid,
        pushname: this.client.info.pushname,
      } : null,
    };
  }

  async restart(): Promise<void> {
    this.logger.log('🔄 Reiniciando WhatsApp...');
    
    try {
      if (this.client) {
        await this.client.destroy();
        this.client = null;
        this.isConnected = false;
      }
      
      // Limpar sessões ativas
      await this.sessionService.limparSessoes();
      
      // Aguardar um pouco
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Reinicializar
      await this.initialize();
      
      this.logger.log('✅ WhatsApp reiniciado com sucesso');
    } catch (error: any) {
      this.logger.error(`❌ Erro ao reiniciar WhatsApp: ${error.message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    this.logger.log('🔴 Destruindo WhatsApp Service...');
    
    if (this.client) {
      try {
        await this.client.destroy();
        this.logger.log('✅ WhatsApp desconectado');
      } catch (error: any) {
        this.logger.error(`❌ Erro ao desconectar WhatsApp: ${error.message}`);
      }
    }
  }

  getSessoesAtivas() {
    return this.sessionService.getSessoesParaDebug();
  }

  async limparSessoes() {
    return this.sessionService.limparSessoes();
  }
}