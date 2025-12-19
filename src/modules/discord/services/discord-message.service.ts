import { Injectable, Logger } from '@nestjs/common';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  ChannelType,
} from 'discord.js';
import { DiscordBotClient } from '../discord-bot.client';

export interface SolicitaçãoDiscord {
  id: string;
  razaoSocial: string;
  cnpj: string;
  nomeResponsavel: string;
  tipoProblema: string;
  descricao: string;
  whatsappId: string;
}

@Injectable()
export class DiscordMessageService {
  private readonly logger = new Logger(DiscordMessageService.name);

  constructor(private readonly botClient: DiscordBotClient) {}

  async enviarSolicitacao(
  canalId: string,
  dados: SolicitaçãoDiscord,
  frontendUrl: string = 'http://localhost:3000'
): Promise<boolean> {
  try {
    const channel = await this.botClient.client.channels.fetch(canalId);
    
    // Verificar se é um canal de texto válido
    if (!channel || !this.isValidTextChannel(channel)) {
      this.logger.error(`Canal ${canalId} não encontrado ou não é um canal de texto válido`);
      return false;
    }

    const textChannel = channel as TextChannel;
    
    // Cores por tipo de problema
    const cores = this.getCorPorProblema(dados.tipoProblema);
    const embed = this.criarEmbedSolicitacao(dados, cores);
    const buttons = this.criarBotoesSolicitacao(dados.id, frontendUrl, dados.whatsappId);

    await textChannel.send({
      content: `📢 **NOVA SOLICITAÇÃO**`,
      embeds: [embed],
      components: [buttons],
    });

    this.logger.log(`✅ Solicitação enviada: ${dados.id}`);
    return true;
  } catch (error) {
    this.logger.error(`❌ Erro ao enviar solicitação: ${error.message}`);
    return false;
  }
}

// Método auxiliar para verificar canal válido
private isValidTextChannel(channel: any): channel is TextChannel {
  const validTypes = [
    0,  // GuildText
    5,  // GuildNews
    15, // GuildForum
  ];
  
  return channel && 
         channel.isTextBased && 
         channel.isTextBased() && 
         validTypes.includes(channel.type);
}

  async enviarSolicitacaoTeste(
    canalId: string,
    frontendUrl: string = 'http://localhost:3000'
  ): Promise<boolean> {
    const dadosTeste: SolicitaçãoDiscord = {
      id: `TEST${Date.now().toString().slice(-6)}`,
      razaoSocial: 'Supermercado Teste Ltda',
      cnpj: '12.345.678/0001-99',
      nomeResponsavel: 'João da Silva',
      tipoProblema: 'PDV Parado',
      descricao: 'PDV não está ligando. Este é um teste do sistema VR Software.',
      whatsappId: '5511999999999',
    };

    return this.enviarSolicitacao(canalId, dadosTeste, frontendUrl);
  }

  private getCorPorProblema(tipoProblema: string): number {
    const cores: Record<string, number> = {
      'PDV Parado': 0xFF0000,       // Vermelho
      'Promoção / Oferta': 0x00FF00, // Verde
      'Estoque': 0xFFFF00,          // Amarelo
      'Nota Fiscal': 0x0099FF,      // Azul
      'Outros': 0x808080,           // Cinza
    };

    return cores[tipoProblema] || 0x808080;
  }

  private criarEmbedSolicitacao(dados: SolicitaçãoDiscord, cor: number): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(cor)
      .setTitle(`📋 SOLICITAÇÃO #${dados.id}`)
      .setDescription(`**${dados.tipoProblema}**`)
      .addFields(
        { name: '🏢 Loja', value: dados.razaoSocial, inline: true },
        { name: '📋 CNPJ', value: dados.cnpj, inline: true },
        { name: '👤 Responsável', value: dados.nomeResponsavel, inline: true },
        { name: '📞 WhatsApp', value: `\`${dados.whatsappId}\``, inline: true },
        { name: '🕒 Recebida', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        { 
          name: '📝 Descrição', 
          value: dados.descricao.substring(0, 500) + 
                 (dados.descricao.length > 500 ? '...' : '') 
        },
      )
      .setFooter({ text: 'VR Software • Clique em "Assumir" para atender' })
      .setTimestamp();
  }

  private criarBotoesSolicitacao(
    solicitacaoId: string, 
    frontendUrl: string,
    whatsappId: string
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`assumir_${solicitacaoId}`)
          .setLabel('✅ Assumir Atendimento')
          .setStyle(ButtonStyle.Success)
          .setEmoji('👨‍💻'),
        
        new ButtonBuilder()
          .setLabel('🚀 Abrir Portal')
          .setStyle(ButtonStyle.Link)
          .setURL(`${frontendUrl}/atendimento/${solicitacaoId}?source=discord`)
          .setEmoji('🌐'),
        
        new ButtonBuilder()
          .setLabel('💬 WhatsApp')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://wa.me/${whatsappId}`)
          .setEmoji('📱'),
      );
  }
}