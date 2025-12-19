import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityType, Events, TextChannel } from 'discord.js';
import { DiscordBotClient } from '../discord-bot.client';
import { DiscordMessageService } from './discord-message.service';
import { DiscordButtonHandler } from '../handlers/button.handler';
import { DiscordCommandHandler } from '../handlers/command.handler';

@Injectable()
export class DiscordService implements OnModuleInit {
  private readonly logger = new Logger(DiscordService.name);
  private isReady = false;
  private canalSolicitacoesId: string = '';

  constructor(
    private configService: ConfigService,
    private botClient: DiscordBotClient,
    private messageService: DiscordMessageService,
    private buttonHandler: DiscordButtonHandler,
    private commandHandler: DiscordCommandHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = this.configService.get('DISCORD_TOKEN');
    
    if (!token) {
      this.logger.warn('⚠️ DISCORD_TOKEN não configurado');
      return;
    }

    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      this.logger.log('🔄 Inicializando Discord Bot...');
      
      // Carregar canal do .env se existir
      this.canalSolicitacoesId = this.configService.get('DISCORD_CHANNEL_ID') || '';
      
      this.setupEventHandlers();
      await this.botClient.login(this.configService.get('DISCORD_TOKEN')!);
      
    } catch (error: any) {
      this.logger.error(`❌ Erro Discord: ${error.message}`);
    }
  }

  private setupEventHandlers(): void {
    // Ready event
    this.botClient.client.on(Events.ClientReady, async () => {
      await this.handleReady();
    });

    // Interaction event
    this.botClient.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isButton()) {
        await this.buttonHandler.handleButton(interaction);
      }
    });

    // Message event
    this.botClient.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });
  }

  private async handleReady(): Promise<void> {
    this.isReady = true;
    const botName = this.botClient.client.user?.tag || 'Bot';
    
    this.logger.log(`✅ Discord Bot: ${botName}`);
    
    // Configurar atividade
    this.botClient.client.user?.setActivity('solicitações VR', { 
      type: ActivityType.Watching 
    });

    // Verificar canal se existir
    await this.verificarCanalConfigurado();
    
    console.log('\n' + '='.repeat(50));
    console.log('🤖 DISCORD BOT CONECTADO!');
    console.log(`👤 Nome: ${botName}`);
    console.log(`🏰 Servidores: ${this.botClient.client.guilds.cache.size}`);
    console.log(`📌 Canal: ${this.canalSolicitacoesId ? 'Configurado' : 'Aguardando !canal'}`);
    console.log('='.repeat(50) + '\n');
  }

  private async handleMessage(message: any): Promise<void> {
    if (message.author.bot) return;
    
    const conteudo = message.content;
    
    // Verificar se é comando
    if (conteudo.startsWith('!')) {
      const [command, ...args] = conteudo.slice(1).split(' ');
      await this.commandHandler.handleCommand(message, `!${command}`, args);
    }
  }

  private async verificarCanalConfigurado(): Promise<void> {
  if (!this.canalSolicitacoesId || !this.botClient.client) return;

  try {
    const canal = await this.botClient.client.channels.fetch(this.canalSolicitacoesId);
    
    // Verificar se é um canal de texto que suporta envio de mensagens
    if (canal && this.isTextChannel(canal)) {
      this.logger.log(`✅ Canal verificado: ${canal.id}`);
      await canal.send(`🤖 **BOT INICIADO!**\n\nCanal configurado via .env\nAguardando solicitações...`);
    } else {
      this.logger.warn(`⚠️ Canal ${this.canalSolicitacoesId} não é um canal de texto válido`);
      this.canalSolicitacoesId = '';
    }
  } catch (error) {
    this.logger.error(`❌ Erro ao verificar canal: ${error.message}`);
    this.canalSolicitacoesId = '';
  }
}

// Método auxiliar para verificar se é canal de texto
private isTextChannel(channel: any): channel is TextChannel {
  return channel && 
         (channel.type === 0 || // ChannelType.GuildText (valor numérico)
          channel.type === 5 || // ChannelType.GuildNews
          channel.type === 15 || // ChannelType.GuildForum
          channel.isTextBased && channel.isTextBased()); // Método do Discord.js v14
}

  async notificarNovaSolicitacao(dados: any): Promise<boolean> {
    if (!this.canalSolicitacoesId) {
      this.logger.error('Canal não configurado para enviar solicitação');
      return false;
    }

    return await this.messageService.enviarSolicitacao(
      this.canalSolicitacoesId,
      {
        id: dados.id,
        razaoSocial: dados.razaoSocial,
        cnpj: dados.cnpj,
        nomeResponsavel: dados.nomeResponsavel,
        tipoProblema: dados.tipoProblema,
        descricao: dados.descricao,
        whatsappId: dados.whatsappId,
      },
      process.env.FRONTEND_URL || 'http://localhost:3000'
    );
  }

  getStatus() {
    return {
      isConnected: this.isReady,
      username: this.botClient.client?.user?.tag || 'Desconectado',
      canalConfigurado: !!this.canalSolicitacoesId,
      canalId: this.canalSolicitacoesId || 'Não configurado',
      servidores: this.botClient.client?.guilds.cache.size || 0,
    };
  }
}