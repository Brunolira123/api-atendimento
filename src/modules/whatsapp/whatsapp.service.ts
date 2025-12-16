import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import { WebSocketGatewayService } from '../websocket/websocket.gateway';
import { Conversation } from '../../shared/entities/conversation.entity';
import { Solicitacao } from '../../shared/entities/solicitacao.entity';

// Interface para tipos do WhatsApp
interface WhatsAppMessage {
  from: string;
  body: string;
  type: string;
  id: {
    participant?: string;
  };
}

interface SessionData {
  estado: string;
  dados: {
    whatsappId: string;
    razaoSocial?: string;
    cnpj?: string;
    nomeResponsavel?: string;
    opcaoEscolhida?: number;
    tipoProblema?: string;
    descricaoProblema?: string;
    solicitacaoId?: string;
    inicio: Date;
    fim?: Date;
    status?: string;
  };
  historico: Array<{ etapa: string; valor: string }>;
}

@Injectable()
export class WhatsAppService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Client;
  private isConnected = false;
  private qrCode: string;

  private readonly menuOpcoes = {
    1: 'PDV Parado',
    2: 'Promoção / Oferta',
    3: 'Estoque',
    4: 'Nota Fiscal',
    5: 'Outros',
  };

  private sessoesAtivas = new Map<string, SessionData>();

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Solicitacao)
    private solicitacaoRepository: Repository<Solicitacao>,
    private configService: ConfigService,
    private webSocketGateway: WebSocketGatewayService,
  ) {}

  async initialize(): Promise<void> {
    this.logger.log('🔄 Inicializando WhatsApp Service...');

    // CORREÇÃO: Puppeteer options com tipos corretos
    const puppeteerOptions: any = {
      headless: true, // Changed from 'new' to boolean
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
      ],
      // timeout é opcional, mas se quiser pode adicionar:
      timeout: 30000,
    };

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
        puppeteer: puppeteerOptions,
      });

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
    });

    // Ready
    this.client.on('ready', () => {
      this.isConnected = true;
      const userNumber = this.client.info?.wid?.user || 'Desconhecido';

      this.logger.log(`✅ WhatsApp conectado: ${userNumber}`);

      console.log('\n' + '='.repeat(60));
      console.log('✅ SISTEMA PRONTO PARA ATENDIMENTO');
      console.log(`📱 WhatsApp: ${userNumber}`);
      console.log('🕒 Sistema: Online e operacional');
      console.log('='.repeat(60) + '\n');

      if (this.webSocketGateway) {
        this.webSocketGateway.emitWhatsAppReady({
          wid: this.client.info?.wid,
          me: this.client.info?.me,
          pushname: this.client.info?.pushname,
        });
      }
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

  // CORREÇÃO: Usar tipo any para evitar erros de tipo
  private async handleIncomingMessage(message: any): Promise<void> {
    try {
      // Verificar se é mensagem de grupo ou status de forma compatível
      const isGroup = message.from.includes('@g.us') || 
                     (message.id && message.id.participant) ||
                     message.type === 'gp2';
      
      const isStatus = message.type === 'notification' || 
                      message.type === 'e2e_notification' ||
                      !message.body;

      if (isGroup || isStatus) {
        return;
      }

      const whatsappId = message.from.replace('@c.us', '');
      const texto = message.body || '';

      this.logger.log(`📩 Mensagem de ${whatsappId}: ${texto.substring(0, 100)}`);

      // Verifica se já tem sessão ativa
      const sessao = this.sessoesAtivas.get(whatsappId);

      if (!sessao) {
        // Inicia novo atendimento
        await this.iniciarColeta(whatsappId);
      } else {
        // Continua coleta de dados
        await this.processarMensagem(whatsappId, texto, sessao);
      }
    } catch (error) {
      this.logger.error(`❌ Erro ao processar mensagem: ${error.message}`);
    }
  }

  private async iniciarColeta(whatsappId: string): Promise<void> {
    const sessao: SessionData = {
      estado: 'aguardando_razao_social',
      dados: {
        whatsappId,
        inicio: new Date(),
      },
      historico: [],
    };

    this.sessoesAtivas.set(whatsappId, sessao);

    const mensagem = `
👋 *Olá! Seja bem-vindo ao atendimento VR Software!*

Vou precisar de algumas informações para registrar sua solicitação:

📋 *Informe a razão social da loja:*
_(Nome completo da empresa)_
    `;

    await this.enviarMensagem(whatsappId, mensagem);
    this.logger.log(`📝 Iniciada coleta para ${whatsappId}`);
  }

  private async processarMensagem(
    whatsappId: string,
    texto: string,
    sessao: SessionData,
  ): Promise<void> {
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
          // Se já finalizou, apenas responde
          await this.enviarMensagem(
            whatsappId, 
            '✅ Sua solicitação já foi registrada! Um atendente entrará em contato em breve.'
          );
      }
    } catch (error) {
      this.logger.error(`Erro no processamento para ${whatsappId}: ${error.message}`);
      await this.enviarMensagem(whatsappId, `❌ Ocorreu um erro: ${error.message}`);
    }
  }

  private async processarRazaoSocial(
    whatsappId: string,
    texto: string,
    sessao: SessionData,
  ): Promise<void> {
    if (!texto.trim()) {
      await this.enviarMensagem(whatsappId, '❌ *Por favor, informe a razão social da loja:*');
      return;
    }

    sessao.dados.razaoSocial = texto.trim();
    sessao.estado = 'aguardando_cnpj';
    sessao.historico.push({ etapa: 'razao_social', valor: texto });

    const mensagem = `
✅ *Razão social registrada!*

📋 *Agora, informe o CNPJ:*
_(Apenas números, 14 dígitos)_
    `;

    await this.enviarMensagem(whatsappId, mensagem);
  }

  private async processarCNPJ(
    whatsappId: string,
    texto: string,
    sessao: SessionData,
  ): Promise<void> {
    const cnpj = texto.replace(/\D/g, '');

    if (cnpj.length !== 14) {
      await this.enviarMensagem(
        whatsappId,
        '❌ *CNPJ inválido!*\n\nPor favor, informe um CNPJ com 14 dígitos (apenas números):\n_Exemplo: 11222333000144_',
      );
      return;
    }

    sessao.dados.cnpj = cnpj;
    sessao.estado = 'aguardando_nome';
    sessao.historico.push({ etapa: 'cnpj', valor: cnpj });

    const mensagem = `
✅ *CNPJ registrado!*

👤 *Agora, informe seu nome completo:*
_(Nome da pessoa responsável pelo atendimento)_
    `;

    await this.enviarMensagem(whatsappId, mensagem);
  }

  private async processarNome(
    whatsappId: string,
    texto: string,
    sessao: SessionData,
  ): Promise<void> {
    if (!texto.trim()) {
      await this.enviarMensagem(whatsappId, '❌ *Por favor, informe seu nome completo:*');
      return;
    }

    sessao.dados.nomeResponsavel = texto.trim();
    sessao.estado = 'aguardando_opcao';
    sessao.historico.push({ etapa: 'nome_responsavel', valor: texto });

    let menu = `
✅ *Nome registrado!*

📋 *Agora, escolha o tipo de atendimento:*

`;

    for (const [numero, descricao] of Object.entries(this.menuOpcoes)) {
      menu += `${numero} - ${descricao}\n`;
    }

    menu += '\n*Digite apenas o número (1 a 5):*';

    await this.enviarMensagem(whatsappId, menu);
  }

  private async processarOpcao(
    whatsappId: string,
    texto: string,
    sessao: SessionData,
  ): Promise<void> {
    const opcao = parseInt(texto.trim());

    if (isNaN(opcao) || opcao < 1 || opcao > 5) {
      await this.enviarMensagem(
        whatsappId,
        '❌ *Opção inválida!*\n\nPor favor, digite apenas um número de 1 a 5:',
      );
      return;
    }

    sessao.dados.opcaoEscolhida = opcao;
    sessao.dados.tipoProblema = this.menuOpcoes[opcao];
    sessao.estado = 'aguardando_descricao';
    sessao.historico.push({ etapa: 'opcao_escolhida', valor: this.menuOpcoes[opcao] });

    const mensagem = `
✅ *Tipo de atendimento registrado!*

📝 *Agora, resuma seu problema:*
_(Descreva detalhadamente o que está acontecendo)_
    `;

    await this.enviarMensagem(whatsappId, mensagem);
  }

  private async processarDescricao(
    whatsappId: string,
    texto: string,
    sessao: SessionData,
  ): Promise<void> {
    if (!texto.trim()) {
      await this.enviarMensagem(whatsappId, '❌ *Por favor, descreva o problema:*');
      return;
    }

    sessao.dados.descricaoProblema = texto.trim();
    sessao.historico.push({ etapa: 'descricao_problema', valor: texto });

    await this.finalizarColeta(whatsappId, sessao);
  }

  private async finalizarColeta(whatsappId: string, sessao: SessionData): Promise<void> {
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
      const mensagemCliente = `
✅ *SOLICITAÇÃO REGISTRADA COM SUCESSO!*

📋 *Resumo da sua solicitação:*
• *ID:* ${solicitacaoId}
• *Loja:* ${sessao.dados.razaoSocial}
• *CNPJ:* ${this.formatarCNPJ(sessao.dados.cnpj)}
• *Responsável:* ${sessao.dados.nomeResponsavel}
• *Tipo:* ${sessao.dados.tipoProblema}
• *Hora:* ${new Date().toLocaleTimeString('pt-BR')}

📞 *Sua solicitação foi encaminhada para nossa equipe técnica.*

⏱️ *Tempo médio de resposta:*
- *URGENTE (PDV Parado):* 10-15 minutos
- *DEMAIS CASOS:* 30-60 minutos

👨‍💻 *Um analista especializado entrará em contato em breve!*

📱 *Para acompanhar o status, mantenha este WhatsApp aberto.*
      `;

      await this.enviarMensagem(whatsappId, mensagemCliente);

      // Envia para Discord via Webhook (se configurado)
      await this.enviarParaDiscordWebhook(whatsappId, sessao.dados);

      // Notifica via WebSocket
      if (this.webSocketGateway) {
        this.webSocketGateway.emitNovaSolicitacao({
          id: solicitacaoId,
          razaoSocial: sessao.dados.razaoSocial,
          cnpj: this.formatarCNPJ(sessao.dados.cnpj),
          nomeResponsavel: sessao.dados.nomeResponsavel,
          tipoProblema: sessao.dados.tipoProblema,
          descricao: sessao.dados.descricaoProblema?.substring(0, 200) + '...',
          whatsappId,
          status: 'pendente',
          prioridade: sessao.dados.opcaoEscolhida === 1 ? 'alta' : 'normal',
        });
      }

      // Marca como finalizada
      sessao.estado = 'finalizada';
      this.sessoesAtivas.set(whatsappId, sessao);

      this.logger.log(`✅ Solicitação ${solicitacaoId} registrada com sucesso`);
    } catch (error) {
      this.logger.error(`❌ Erro ao finalizar coleta: ${error.message}`);
      await this.enviarMensagem(
        whatsappId,
        '❌ Ocorreu um erro ao registrar sua solicitação. Por favor, tente novamente.',
      );
    }
  }

  async enviarMensagem(
    whatsappId: string,
    mensagem: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected || !this.client) {
      this.logger.warn(`⚠️  WhatsApp não conectado, mensagem pendente para ${whatsappId}`);
      return { success: false, error: 'WhatsApp não conectado' };
    }

    try {
      const formattedTo = whatsappId.includes('@c.us') ? whatsappId : whatsappId + '@c.us';
      
      this.logger.log(`📤 Enviando mensagem para ${whatsappId}: ${mensagem.substring(0, 50)}...`);
      
      await this.client.sendMessage(formattedTo, mensagem);
      
      this.logger.log(`✅ Mensagem enviada para ${whatsappId}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao enviar mensagem para ${whatsappId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private formatarCNPJ(cnpj: string): string {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  private async enviarParaDiscordWebhook(whatsappId: string, dados: any): Promise<void> {
    const webhookUrl = this.configService.get('DISCORD_WEBHOOK_URL');
    
    if (!webhookUrl) {
      this.logger.log('ℹ️  Webhook Discord não configurado, pulando notificação');
      return;
    }

    try {
      // Cores para diferentes tipos de problema
      const cores: Record<number, number> = { 
        1: 15158332, // Vermelho - PDV Parado
        2: 3066993,  // Verde - Promoção
        3: 15844367, // Amarelo - Estoque
        4: 3447003,  // Azul - Nota Fiscal
        5: 9807270   // Cinza - Outros
      };

      // Emojis para cada tipo
      const emojis: Record<number, string> = { 
        1: "🚨", // PDV Parado
        2: "💰", // Promoção
        3: "📦", // Estoque
        4: "🧾", // Nota Fiscal
        5: "🔧"  // Outros
      };

      const embed = {
        username: 'VR Software - Sistema de Atendimento',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/3067/3067256.png',
        content: `${emojis[dados.opcaoEscolhida] || "📋"} **NOVA SOLICITAÇÃO - ${dados.solicitacaoId}**`,
        embeds: [
          {
            title: `${dados.tipoProblema}`,
            color: cores[dados.opcaoEscolhida] || 9807270,
            fields: [
              { name: '🏢 Loja', value: dados.razaoSocial || 'Não informado', inline: true },
              { name: '📋 CNPJ', value: this.formatarCNPJ(dados.cnpj) || 'Não informado', inline: true },
              { name: '👤 Responsável', value: dados.nomeResponsavel || 'Não informado', inline: true },
              { name: '📞 WhatsApp', value: `\`${whatsappId}\``, inline: true },
              { name: '🆔 ID', value: `\`${dados.solicitacaoId}\``, inline: true },
              { name: '🕒 Hora', value: new Date().toLocaleTimeString('pt-BR'), inline: true },
              {
                name: '📝 Descrição',
                value: (dados.descricaoProblema?.substring(0, 1000) || 'Não informada') + 
                       (dados.descricaoProblema?.length > 1000 ? '...' : ''),
              },
            ],
            footer: { text: 'VR Software • Sistema de Atendimento Automático' },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log(`✅ Notificação enviada para Discord: ${dados.solicitacaoId}`);
    } catch (error: any) {
      this.logger.error(`❌ Erro ao enviar para Discord: ${error.message}`);
    }
  }

  async getStatus() {
    const sessoesAtivas = Array.from(this.sessoesAtivas.values()).filter(
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
      this.sessoesAtivas.clear();
      
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

  // Método para obter sessões ativas (para debug)
  getSessoesAtivas() {
    return Array.from(this.sessoesAtivas.entries()).map(([whatsappId, sessao]) => ({
      whatsappId,
      estado: sessao.estado,
      dados: sessao.dados,
    }));
  }

  // Método para limpar sessões (para debug/limpeza)
  async limparSessoes() {
    const count = this.sessoesAtivas.size;
    this.sessoesAtivas.clear();
    this.logger.log(`🧹 Limpas ${count} sessões ativas`);
    return { success: true, count };
  }

  // Método para enviar mensagem como atendente (para uso pelo portal)
  async enviarMensagemAtendente(
    whatsappId: string, 
    mensagem: string, 
    atendenteNome: string
  ): Promise<{ success: boolean; error?: string }> {
    const mensagemFormatada = `👨‍💻 *${atendenteNome} (Atendente VR):*\n${mensagem}`;
    
    const result = await this.enviarMensagem(whatsappId, mensagemFormatada);
    
    if (result.success && this.webSocketGateway) {
      // Notifica via WebSocket que uma mensagem foi enviada
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
}