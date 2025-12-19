import { EmbedBuilder } from 'discord.js';

export interface StatusInfo {
  botName: string;
  botStatus: 'online' | 'idle' | 'dnd' | 'offline';
  guildCount: number;
  channelCount: number;
  uptime: number;
  memoryUsage: string;
  whatsappStatus: 'connected' | 'disconnected' | 'connecting';
  lastError?: string;
}

export class StatusEmbed {
  /**
   * Cria embed de status do sistema
   */
  criarStatusEmbed(info: StatusInfo): EmbedBuilder {
    const cor = this.getCorPorStatus(info.botStatus);
    const uptimeFormatado = this.formatarUptime(info.uptime);

    return new EmbedBuilder()
      .setColor(cor)
      .setTitle('🤖 STATUS DO SISTEMA VR')
      .setDescription('Informações sobre o status do bot e serviços integrados')
      .addFields(
        { 
          name: '📊 BOT DISCORD', 
          value: 
            `• **Status:** ${this.getEmojiStatus(info.botStatus)} ${info.botStatus.toUpperCase()}\n` +
            `• **Nome:** ${info.botName}\n` +
            `• **Servidores:** ${info.guildCount}\n` +
            `• **Canais:** ${info.channelCount}\n` +
            `• **Uptime:** ${uptimeFormatado}`,
          inline: false 
        },
        { 
          name: '📱 WHATSAPP', 
          value: 
            `• **Status:** ${this.getWhatsAppEmoji(info.whatsappStatus)} ${info.whatsappStatus.toUpperCase()}\n` +
            `• **Conexão:** ${info.whatsappStatus === 'connected' ? 'Estável' : 'Instável'}`,
          inline: false 
        },
        { 
          name: '💻 SISTEMA', 
          value: 
            `• **Memória:** ${info.memoryUsage}\n` +
            `• **Ambiente:** ${process.env.NODE_ENV || 'development'}\n` +
            `• **Versão:** ${process.env.npm_package_version || '1.0.0'}`,
          inline: false 
        },
      )
      .setFooter({ 
        text: `Última atualização • ${new Date().toLocaleDateString('pt-BR')}` 
      })
      .setTimestamp();
  }

  /**
   * Cria embed de status simplificado
   */
  criarStatusSimplificado(info: StatusInfo): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ SISTEMA OPERACIONAL')
      .setDescription('Todos os serviços estão funcionando normalmente')
      .addFields(
        { name: '🤖 Discord Bot', value: `✅ ${info.botName}`, inline: true },
        { name: '📱 WhatsApp', value: `✅ Conectado`, inline: true },
        { name: '🏰 Servidores', value: `${info.guildCount}`, inline: true },
      )
      .setTimestamp();
  }

  /**
   * Cria embed de erro
   */
  criarErroEmbed(titulo: string, mensagem: string, erro?: any): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`❌ ${titulo}`)
      .setDescription(mensagem)
      .addFields(
        { 
          name: '📋 Detalhes do Erro', 
          value: erro?.message || 'Detalhes não disponíveis',
          inline: false 
        },
        { 
          name: '🕒 Quando', 
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true 
        },
        { 
          name: '🔧 Ação Recomendada', 
          value: 'Verifique os logs e reinicie o serviço se necessário',
          inline: true 
        },
      )
      .setTimestamp();
  }

  /**
   * Obtém cor baseada no status
   */
  private getCorPorStatus(status: string): number {
    const cores: Record<string, number> = {
      'online': 0x00FF00,
      'idle': 0xFFFF00,
      'dnd': 0xFF0000,
      'offline': 0x808080,
    };

    return cores[status] || 0x808080;
  }

  /**
   * Obtém emoji baseado no status
   */
  private getEmojiStatus(status: string): string {
    const emojis: Record<string, string> = {
      'online': '🟢',
      'idle': '🟡',
      'dnd': '🔴',
      'offline': '⚫',
    };

    return emojis[status] || '⚫';
  }

  /**
   * Obtém emoji do WhatsApp
   */
  private getWhatsAppEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'connected': '✅',
      'disconnected': '❌',
      'connecting': '🔄',
    };

    return emojis[status] || '❓';
  }

  /**
   * Formata tempo de uptime
   */
  private formatarUptime(segundos: number): string {
    const dias = Math.floor(segundos / (3600 * 24));
    const horas = Math.floor((segundos % (3600 * 24)) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = Math.floor(segundos % 60);

    const partes = [];
    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0) partes.push(`${minutos}m`);
    if (segs > 0 || partes.length === 0) partes.push(`${segs}s`);

    return partes.join(' ');
  }
}