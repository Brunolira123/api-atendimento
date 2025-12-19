import { Injectable, Logger } from '@nestjs/common';
import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { WebSocketGatewayService } from '../../websocket/websocket.gateway';

export enum ButtonAction {
  ASSUMIR = 'assumir',
  RESOLVER = 'resolver',
  REABRIR = 'reabrir',
}

@Injectable()
export class DiscordButtonHandler {
  private readonly logger = new Logger(DiscordButtonHandler.name);
  private frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    private readonly webSocketGateway: WebSocketGatewayService,
  ) {}

  /**
   * Processa todas as interações de botões
   */
  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    try {
      // Extrair ação e ID da solicitação
      const match = customId.match(/^(assumir|resolver|reabrir)_(.+)$/);
      
      if (!match) {
        await this.handleUnknownButton(interaction);
        return;
      }

      const [, action, solicitacaoId] = match;
      
      switch (action as ButtonAction) {
        case ButtonAction.ASSUMIR:
          await this.handleAssumir(interaction, solicitacaoId);
          break;
        case ButtonAction.RESOLVER:
          await this.handleResolver(interaction, solicitacaoId);
          break;
        case ButtonAction.REABRIR:
          await this.handleReabrir(interaction, solicitacaoId);
          break;
      }
    } catch (error) {
      this.logger.error(`Erro ao processar botão: ${error.message}`);
      await this.handleError(interaction, 'Erro ao processar ação');
    }
  }

  /**
   * Handler para botão "Assumir"
   */
  private async handleAssumir(interaction: ButtonInteraction, solicitacaoId: string): Promise<void> {
    await interaction.deferUpdate();
    
    const analista = interaction.user.tag;
    const analistaId = interaction.user.id;
    
    this.logger.log(`👨‍💻 ${analista} assumindo: ${solicitacaoId}`);

    // Notificar WebSocket
    await this.webSocketGateway.emit('discord:assumido', {
      solicitacaoId,
      atendente: analista,
      discordId: analistaId,
      timestamp: new Date().toISOString(),
    });

    // Atualizar embed e botões
    await this.updateEmbedParaAtendimento(interaction, analista, analistaId);
    
    // Confirmar no canal
    await interaction.followUp({
      content: `✅ **ATENDIMENTO ASSUMIDO!**\n\n<@${analistaId}> assumiu a solicitação \`${solicitacaoId}\``,
      ephemeral: false,
    });
  }

  /**
   * Handler para botão "Resolver"
   */
  private async handleResolver(interaction: ButtonInteraction, solicitacaoId: string): Promise<void> {
    await interaction.deferUpdate();
    
    const analista = interaction.user.tag;
    
    this.logger.log(`✅ ${analista} resolvendo: ${solicitacaoId}`);

    // Notificar WebSocket
    await this.webSocketGateway.emit('solicitacao:finalizada', {
      solicitacaoId,
      atendente: analista,
      timestamp: new Date().toISOString(),
    });

    // Atualizar embed e botões
    await this.updateEmbedParaResolvido(interaction, analista);
    
    // Confirmar no canal
    await interaction.followUp({
      content: `🎉 **SOLICITAÇÃO RESOLVIDA!**\n\n\`${solicitacaoId}\` foi marcada como resolvida por ${analista}`,
      ephemeral: false,
    });
  }

  /**
   * Handler para botão "Reabrir"
   */
  private async handleReabrir(interaction: ButtonInteraction, solicitacaoId: string): Promise<void> {
    await interaction.deferUpdate();
    
    const analista = interaction.user.tag;
    
    this.logger.log(`🔄 ${analista} reabrindo: ${solicitacaoId}`);

    // Notificar WebSocket
    await this.webSocketGateway.emit('solicitacao:reaberta', {
      solicitacaoId,
      atendente: analista,
      timestamp: new Date().toISOString(),
    });

    // Atualizar embed e botões
    await this.updateEmbedParaPendente(interaction, analista);
    
    // Confirmar no canal
    await interaction.followUp({
      content: `🔄 **SOLICITAÇÃO REABERTA!**\n\n\`${solicitacaoId}\` foi reaberta por ${analista}`,
      ephemeral: false,
    });
  }

  /**
   * Handler para botão desconhecido
   */
  private async handleUnknownButton(interaction: ButtonInteraction): Promise<void> {
    this.logger.warn(`Botão desconhecido: ${interaction.customId}`);
    
    await interaction.reply({
      content: '❌ Este botão não está configurado corretamente.',
      ephemeral: true,
    });
  }

  /**
   * Atualiza embed para status "Em atendimento"
   */
  private async updateEmbedParaAtendimento(
    interaction: ButtonInteraction, 
    analista: string, 
    analistaId: string
  ): Promise<void> {
    const embedOriginal = interaction.message.embeds[0];
    const embedAtualizado = EmbedBuilder.from(embedOriginal)
      .setColor(0xFFA500) // Laranja
      .setFooter({ 
        text: `Em atendimento por ${analista} • ${new Date().toLocaleDateString('pt-BR')}` 
      });

    // Adicionar campo de atendente
    embedAtualizado.addFields(
      { name: '👨‍💻 Atendente', value: `<@${analistaId}>`, inline: true },
      { name: '⏱️ Início', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    );

    // Botões para atendimento em andamento
    const rowAtualizado = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`resolver_${this.extractSolicitacaoId(embedOriginal)}`)
          .setLabel('✅ Marcar como Resolvido')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✅'),
        
        new ButtonBuilder()
          .setLabel('🚀 Abrir Portal')
          .setStyle(ButtonStyle.Link)
          .setURL(`${this.frontendUrl}/atendimento/${this.extractSolicitacaoId(embedOriginal)}`)
          .setEmoji('🌐'),
      );

    await interaction.editReply({
      embeds: [embedAtualizado],
      components: [rowAtualizado],
    });
  }

  /**
   * Atualiza embed para status "Resolvido"
   */
  private async updateEmbedParaResolvido(
    interaction: ButtonInteraction, 
    analista: string
  ): Promise<void> {
    const embedOriginal = interaction.message.embeds[0];
    const embedResolvido = EmbedBuilder.from(embedOriginal)
      .setColor(0x00FF00) // Verde
      .setFooter({ 
        text: `Resolvido por ${analista} • ${new Date().toLocaleDateString('pt-BR')}` 
      });

    // Botões para solicitação resolvida
    const rowFinal = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('📁 Ver Histórico')
          .setStyle(ButtonStyle.Link)
          .setURL(`${this.frontendUrl}/atendimento/${this.extractSolicitacaoId(embedOriginal)}`)
          .setEmoji('📋'),
        
        new ButtonBuilder()
          .setCustomId(`reabrir_${this.extractSolicitacaoId(embedOriginal)}`)
          .setLabel('🔄 Reabrir')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
      );

    await interaction.editReply({
      embeds: [embedResolvido],
      components: [rowFinal],
    });
  }

  /**
   * Atualiza embed para status "Pendente"
   */
  private async updateEmbedParaPendente(
    interaction: ButtonInteraction, 
    analista: string
  ): Promise<void> {
    const embedOriginal = interaction.message.embeds[0];
    const embedReaberto = EmbedBuilder.from(embedOriginal)
      .setColor(0xFF0000) // Vermelho
      .setFooter({ 
        text: `Reaberto por ${analista} • ${new Date().toLocaleDateString('pt-BR')}` 
      });

    // Remover campos de resolução
    embedReaberto.data.fields = embedReaberto.data.fields?.filter(
      f => !f.name.includes('Status') && !f.name.includes('Resolução')
    );

    // Botões para solicitação pendente
    const rowReaberto = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`assumir_${this.extractSolicitacaoId(embedOriginal)}`)
          .setLabel('✅ Assumir Atendimento')
          .setStyle(ButtonStyle.Success)
          .setEmoji('👨‍💻'),
        
        new ButtonBuilder()
          .setLabel('🚀 Abrir Portal')
          .setStyle(ButtonStyle.Link)
          .setURL(`${this.frontendUrl}/atendimento/${this.extractSolicitacaoId(embedOriginal)}`)
          .setEmoji('🌐'),
      );

    await interaction.editReply({
      embeds: [embedReaberto],
      components: [rowReaberto],
    });
  }

  /**
   * Extrai ID da solicitação do embed
   */
  private extractSolicitacaoId(embed: any): string {
    try {
      const title = embed.data?.title || '';
      const match = title.match(/#(\w+)/);
      return match ? match[1] : 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  /**
   * Tratamento de erros
   */
  private async handleError(interaction: ButtonInteraction, message: string): Promise<void> {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ 
        content: `❌ ${message}`, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: `❌ ${message}`, 
        ephemeral: true 
      });
    }
  }
}