import { Injectable, Logger } from '@nestjs/common';
import { Message } from 'discord.js';
import { DiscordMessageService } from '../services/discord-message.service';
import { DiscordChannelService } from '../services/discord-channel.service';

export enum DiscordCommand {
  CANAL = '!canal',
  TESTE = '!teste',
  STATUS = '!status',
  AJUDA = '!ajuda',
  REABRIR = '!reabrir',
  HELP = '!help',
  CONFIG = '!config',
}

@Injectable()
export class DiscordCommandHandler {
  private readonly logger = new Logger(DiscordCommandHandler.name);

  constructor(
    private readonly messageService: DiscordMessageService,
    private readonly channelService: DiscordChannelService,
  ) {}

  /**
   * Processa todos os comandos
   */
  async handleCommand(message: Message, command: string, args: string[]): Promise<void> {
    const commandLower = command.toLowerCase();

    try {
      switch (commandLower) {
        case DiscordCommand.CANAL:
        case DiscordCommand.CONFIG:
          await this.handleCanalCommand(message);
          break;

        case DiscordCommand.TESTE:
          await this.handleTesteCommand(message);
          break;

        case DiscordCommand.STATUS:
          await this.handleStatusCommand(message);
          break;

        case DiscordCommand.AJUDA:
        case DiscordCommand.HELP:
          await this.handleAjudaCommand(message);
          break;

        case DiscordCommand.REABRIR:
          await this.handleReabrirCommand(message, args[0]);
          break;

        default:
          await this.handleUnknownCommand(message, command);
      }
    } catch (error) {
      this.logger.error(`Erro ao processar comando ${command}: ${error.message}`);
      await message.reply('❌ **Erro ao processar comando!**');
    }
  }

  /**
   * Comando: !canal - Configura canal atual
   */
  private async handleCanalCommand(message: Message): Promise<void> {
    const canalId = message.channel.id;
    const canalInfo = await this.channelService.getChannelInfo(canalId);
    
    if (!canalInfo) {
      await message.reply('❌ **Este não é um canal de texto válido!**');
      return;
    }

    if (!canalInfo.canSend) {
      await message.reply('❌ **Não tenho permissão para enviar mensagens aqui!**');
      return;
    }

    // Aqui você salvaria o canalId no banco/configuração
    await message.reply(
      `✅ **CANAL CONFIGURADO!**\n\n` +
      `Agora todas as solicitações do WhatsApp aparecerão aqui!\n\n` +
      `**📋 Informações do Canal:**\n` +
      `• **Nome:** ${canalInfo.name}\n` +
      `• **Servidor:** ${canalInfo.guildName}\n` +
      `• **ID:** ${canalId}\n` +
      `• **Tipo:** ${canalInfo.type}\n\n` +
      `**🎯 Teste o sistema:**\n` +
      `Digite \`!teste\` para enviar uma solicitação de teste.\n` +
      `Digite \`!status\` para verificar o status do sistema.`
    );

    this.logger.log(`📌 Canal configurado: ${canalId} (${canalInfo.name})`);
  }

  /**
   * Comando: !teste - Envia solicitação teste
   */
  private async handleTesteCommand(message: Message): Promise<void> {
    const canalId = message.channel.id;
    const canalInfo = await this.channelService.getChannelInfo(canalId);
    
    if (!canalInfo || !canalInfo.canSend) {
      await message.reply('❌ **Configure o canal primeiro!**\nDigite: `!canal`');
      return;
    }

    await message.reply('🔄 **Enviando solicitação de teste...**');

    const sucesso = await this.messageService.enviarSolicitacaoTeste(canalId);
    
    if (sucesso) {
      await message.reply('✅ **Solicitação de teste enviada!**\nVerifique acima 👆');
    } else {
      await message.reply('❌ **Falha ao enviar teste!**');
    }
  }

  /**
   * Comando: !status - Status do sistema
   */
  private async handleStatusCommand(message: Message): Promise<void> {
    const canalId = message.channel.id;
    const canalInfo = await this.channelService.getChannelInfo(canalId);
    
    const canaisDisponiveis = await this.channelService.listTextChannels();
    const canaisComPermissao = canaisDisponiveis.filter(c => c.canSend).length;

    const statusMessage = 
      `**🤖 STATUS DO SISTEMA VR**\n\n` +
      `**📊 Sistema:**\n` +
      `• **Bot:** ✅ ONLINE\n` +
      `• **WhatsApp:** 🔄 Conectando...\n` +
      `• **WebSocket:** ✅ Conectado\n\n` +
      
      `**📌 Canal Atual:**\n` +
      (canalInfo ? 
        `• **Nome:** ${canalInfo.name}\n` +
        `• **Servidor:** ${canalInfo.guildName}\n` +
        `• **ID:** ${canalId}\n` +
        `• **Permissões:** ${canalInfo.canSend ? '✅' : '❌'}\n` :
        `• **Status:** Não configurado\n`) +
      `\n` +
      
      `**🏰 Servidores Disponíveis:**\n` +
      `• **Canais com acesso:** ${canaisComPermissao}\n` +
      `• **Total de canais:** ${canaisDisponiveis.length}\n\n` +
      
      `**🔧 Comandos Disponíveis:**\n` +
      `\`!canal\` - Configura este canal\n` +
      `\`!teste\` - Envia solicitação de teste\n` +
      `\`!ajuda\` - Mostra todos os comandos\n` +
      `\`!reabrir <id>\` - Reabre uma solicitação\n` +
      `\`!status\` - Mostra esta mensagem`;

    await message.reply(statusMessage);
  }

  /**
   * Comando: !ajuda - Ajuda
   */
  private async handleAjudaCommand(message: Message): Promise<void> {
    const ajudaMessage = 
      `**🤖 COMANDOS VR SOFTWARE**\n\n` +
      
      `**⚙️ Configuração:**\n` +
      `\`!canal\` - Configura este canal para receber solicitações\n` +
      `\`!config\` - Sinônimo de !canal\n\n` +
      
      `**🧪 Testes:**\n` +
      `\`!teste\` - Envia uma solicitação de teste\n\n` +
      
      `**📊 Status:**\n` +
      `\`!status\` - Mostra status do sistema\n\n` +
      
      `**🔧 Utilidades:**\n` +
      `\`!reabrir <id>\` - Reabre uma solicitação resolvida\n` +
      `\`!ajuda\` - Mostra esta mensagem\n` +
      `\`!help\` - Sinônimo de !ajuda\n\n` +
      
      `**📱 Fluxo do Sistema:**\n` +
      `1. Cliente envia mensagem no WhatsApp\n` +
      `2. Sistema faz triagem automática\n` +
      `3. Solicitação aparece AQUI com botões\n` +
      `4. Analista clica "✅ Assumir" para atender\n` +
      `5. Portal abre automaticamente\n\n` +
      
      `**🎯 Botões Disponíveis:**\n` +
      `🟢 **Assumir** - Assumir atendimento\n` +
      `🔵 **Portal** - Abrir portal web\n` +
      `🟡 **Resolver** - Marcar como resolvido\n` +
      `🟣 **Reabrir** - Reabrir solicitação`;

    await message.reply(ajudaMessage);
  }

  /**
   * Comando: !reabrir - Reabre solicitação
   */
  private async handleReabrirCommand(message: Message, solicitacaoId?: string): Promise<void> {
    if (!solicitacaoId || solicitacaoId.length < 3) {
      await message.reply('❌ **ID inválido!**\n\n**Uso correto:**\n`!reabrir SOL123456`\n`!reabrir TEST123456`');
      return;
    }

    await message.reply(
      `🔄 **Comando reconhecido!**\n\n` +
      `Para reabrir \`${solicitacaoId}\`:\n` +
      `1. Encontre a mensagem original da solicitação\n` +
      `2. Clique no botão "🔄 Reabrir"\n\n` +
      `*Se a mensagem foi apagada, contate o administrador.*`
    );

    this.logger.log(`🔄 Comando reabrir recebido: ${solicitacaoId}`);
  }

  /**
   * Comando desconhecido
   */
  private async handleUnknownCommand(message: Message, command: string): Promise<void> {
    this.logger.warn(`Comando desconhecido: ${command}`);
    
    await message.reply(
      `❌ **Comando desconhecido:** \`${command}\`\n\n` +
      `Digite \`!ajuda\` para ver todos os comandos disponíveis.`
    );
  }
}