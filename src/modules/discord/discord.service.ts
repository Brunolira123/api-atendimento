import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  Client, 
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  TextChannel,
  ActivityType
} from 'discord.js';

@Injectable()
export class DiscordService implements OnModuleInit {
  private readonly logger = new Logger(DiscordService.name);
  private client: Client | null = null;
  private isReady = false;
  private canalSolicitacoesId: string = '';

  constructor(private configService: ConfigService) {
  // Carrega o canal do .env se existir
  const canalId = this.configService.get('DISCORD_CHANNEL_ID');
  if (canalId) {
    this.canalSolicitacoesId = canalId;
    this.logger.log(`📌 Canal pré-configurado no .env: ${canalId}`);
  }
}

FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';


  async onModuleInit() {
    const token = this.configService.get('DISCORD_TOKEN');
    
    if (!token) {
      this.logger.warn('⚠️  DISCORD_TOKEN não configurado');
      return;
    }

    await this.initialize();

     setTimeout(() => this.verificarConexao(), 5000);
  }

  async initialize(): Promise<void> {
  try {
    this.logger.log('🔄 Inicializando Discord Bot...');
    
    // Verificar se já temos canal do .env
    const canalEnv = this.configService.get('DISCORD_CHANNEL_ID');
    if (canalEnv) {
      this.canalSolicitacoesId = canalEnv;
      this.logger.log(`✅ Usando canal do .env: ${canalEnv}`);
    }
    
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.setupEventHandlers();
    await this.client.login(this.configService.get('DISCORD_TOKEN'));
    
  } catch (error: any) {
    this.logger.error(`❌ Erro Discord: ${error.message}`);
  }
}

  private setupEventHandlers(): void {
    if (!this.client) return;

    // Bot pronto
    this.client.on('ready', async () => {
      this.isReady = true;
      const botName = this.client?.user?.tag || 'Bot';
      this.logger.log(`✅ Discord Bot: ${botName}`);
      
      this.client?.user?.setActivity('solicitações VR', { type: ActivityType.Watching});
      
      // VERIFICAR SE O CANAL DO .env EXISTE
      if (this.canalSolicitacoesId && this.client) {
        try {
          const canal = await this.client.channels.fetch(this.canalSolicitacoesId);
          if (canal && canal.type === ChannelType.GuildText) {
            this.logger.log(`✅ Canal verificado: ${canal.name} (${this.canalSolicitacoesId})`);
            
            // Enviar mensagem de inicialização
            const textChannel = canal as TextChannel;
            await textChannel.send(`🤖 **BOT INICIADO!**\n\nCanal configurado via .env\nAguardando solicitações do WhatsApp...\n\n**Teste:** \`!teste\`\n**Status:** \`!status\``);
          } else {
            this.logger.warn(`⚠️  Canal do .env não encontrado: ${this.canalSolicitacoesId}`);
            this.canalSolicitacoesId = ''; // Reset para configuração manual
          }
        } catch (error: any) {
          this.logger.error(`❌ Erro ao verificar canal: ${error.message}`);
        }
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('🤖 DISCORD BOT CONECTADO!');
      console.log(`👤 Nome: ${botName}`);
      console.log(`🏰 Servidores: ${this.client?.guilds.cache.size}`);
      console.log(`📌 Canal: ${this.canalSolicitacoesId ? 'Configurado' : 'Aguardando !canal'}`);
      console.log('='.repeat(50) + '\n');
    });

    // HANDLER PARA INTERAÇÕES (BOTÕES)
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const customId = interaction.customId;
      
      // Botão "Assumir Atendimento"
      if (customId.startsWith('assumir_')) {
        await this.handleAssumirAtendimento(interaction);
      }
      
      // Botão "Resolver" 
      if (customId.startsWith('resolver_')) {
        await this.handleResolverAtendimento(interaction);
      }
      
      // Botão "Reabrir"
      if (customId.startsWith('reabrir_')) {
        await this.handleReabrirAtendimento(interaction);
      }
    });

    // COMANDOS DO BOT (MENSAGENS)
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      const conteudo = message.content.toLowerCase();
      
      // COMANDO: !canal - Configura este canal
      if (conteudo === '!canal' || conteudo === '!configurar') {
        this.canalSolicitacoesId = message.channel.id;
        
        await message.reply(`✅ **CANAL CONFIGURADO!**\n\nAgora todas as solicitações do WhatsApp aparecerão aqui!\n\n**ID do canal:** ${this.canalSolicitacoesId}\n**Teste:** Digite \`!teste\` para enviar uma solicitação de teste.`);
        
        this.logger.log(`📌 Canal configurado: ${this.canalSolicitacoesId}`);
      }
      
      // COMANDO: !status - Status do bot
      if (conteudo === '!status') {
        const status = this.isReady ? '✅ ONLINE' : '❌ OFFLINE';
        const canal = this.canalSolicitacoesId ? '✅ Configurado' : '❌ Não configurado';
        const origemCanal = this.configService.get('DISCORD_CHANNEL_ID') ? '⚙️ .env' : '💬 Manual (!canal)';
        
        await message.reply(`
**🤖 STATUS DO SISTEMA VR**

**Bot:** ${status}
**Canal:** ${canal}
${this.canalSolicitacoesId ? `**ID do Canal:** ${this.canalSolicitacoesId}` : ''}
**Origem:** ${origemCanal}
**WhatsApp:** ${this.isReady ? '✅ Conectado' : '❌ Offline'}

**Comandos:**
\`!canal\` - Configura este canal
\`!teste\` - Envia solicitação de teste
\`!ajuda\` - Mostra todos os comandos
\`!reabrir <id>\` - Reabre uma solicitação
        `);
      }
      
      // COMANDO: !teste - Envia solicitação teste
      if (conteudo === '!teste') {
        if (!this.canalSolicitacoesId) {
          await message.reply('❌ **Configure o canal primeiro!**\nDigite: `!canal`');
          return;
        }
        
        await this.enviarSolicitacaoTeste();
        await message.reply('✅ **Solicitação de teste enviada!**\nVerifique acima 👆');
      }
      
      // COMANDO: !reabrir <id> - Reabre solicitação
      if (conteudo.startsWith('!reabrir ')) {
        const solicitacaoId = conteudo.replace('!reabrir ', '').trim();
        await this.handleComandoReabrir(message, solicitacaoId);
      }
      
      // COMANDO: !ajuda - Ajuda
      if (conteudo === '!ajuda' || conteudo === '!help') {
        const ajuda = `
**🤖 COMANDOS VR SOFTWARE:**

\`!canal\` - Configura este canal para receber solicitações
\`!teste\` - Envia uma solicitação de teste
\`!status\` - Mostra status do sistema
\`!reabrir <id>\` - Reabre uma solicitação resolvida
\`!ajuda\` - Mostra esta mensagem

**📱 FLUXO DO SISTEMA:**
1. Cliente envia mensagem no WhatsApp
2. Sistema faz triagem automática
3. Solicitação aparece AQUI com botões
4. Analista clica "✅ Assumir" para atender
5. Portal abre automaticamente

**🎯 BOTÕES DISPONÍVEIS:**
🟢 **Assumir** - Assumir atendimento
🔵 **Portal** - Abrir portal web
🟡 **Resolver** - Marcar como resolvido
🟣 **Reabrir** - Reabrir solicitação

**⚙️ CONFIGURAÇÃO:**
1. Digite \`!canal\` neste canal
2. Teste com \`!teste\`
3. Use o WhatsApp para criar solicitação real
        `;
        
        await message.reply(ajuda);
      }
    });
  }

  /**
   * Handler para botão "Assumir Atendimento"
   */
  private async handleAssumirAtendimento(interaction: any): Promise<void> {
    try {
      await interaction.deferUpdate();
      
      // Extrair ID da solicitação
      const solicitacaoId = interaction.customId.replace('assumir_', '');
      const analista = interaction.user.tag;
      const analistaId = interaction.user.id;
      
      this.logger.log(`👨‍💻 ${analista} assumindo: ${solicitacaoId}`);

      // Atualizar embed no Discord
      const embedOriginal = interaction.message.embeds[0];
      const embedAtualizado = EmbedBuilder.from(embedOriginal)
        .setColor(0xFFA500) // Laranja = Em atendimento
        .setFooter({ 
          text: `Em atendimento por ${analista} • ${new Date().toLocaleDateString('pt-BR')}` 
        });

      // Adicionar campo de atendente se não existir
      const camposExistentes = embedAtualizado.data.fields || [];
      const temCampoAtendente = camposExistentes.some(f => f.name.includes('Atendente'));
      
      if (!temCampoAtendente) {
        embedAtualizado.addFields(
          { name: '👨‍💻 Atendente', value: `<@${analistaId}>`, inline: true },
          { name: '⏱️ Início', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        );
      }

      // Criar novos botões (remover "Assumir", adicionar "Resolver")
      const rowAtualizado = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`resolver_${solicitacaoId}`)
            .setLabel('✅ Marcar como Resolvido')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅'),
          
          new ButtonBuilder()
            .setLabel('🚀 Abrir Portal')
            .setStyle(ButtonStyle.Link)
            .setURL(`${this.configService.get('SERVER_URL') || 'http://localhost:3000'}/atendimento/${solicitacaoId}`)
            .setEmoji('🌐'),
            
          new ButtonBuilder()
            .setLabel('💬 WhatsApp')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://wa.me/${this.extrairWhatsAppDoEmbed(embedOriginal)}`)
            .setEmoji('📱'),
            
          new ButtonBuilder()
            .setCustomId(`reabrir_${solicitacaoId}`)
            .setLabel('🔄 Reabrir')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
        );

      // Atualizar mensagem
      await interaction.editReply({
        embeds: [embedAtualizado],
        components: [rowAtualizado]
      });

      // Notificar no canal
      await interaction.followUp({
        content: `✅ **ATENDIMENTO ASSUMIDO!**\n\n<@${analistaId}> assumiu a solicitação \`${solicitacaoId}\``,
        ephemeral: false
      });

      // TODO: Integrar com serviços externos
      // 1. Atualizar banco de dados
      // 2. Enviar mensagem para o WhatsApp
      // 3. Notificar API do portal
      
      this.logger.log(`📋 ${analista} assumiu: ${solicitacaoId}`);

    } catch (error: any) {
      this.logger.error(`❌ Erro ao assumir: ${error.message}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Erro ao assumir atendimento',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ Erro ao assumir atendimento',
          ephemeral: true
        });
      }
    }
  }

  /**
   * Handler para botão "Resolver"
   */
  private async handleResolverAtendimento(interaction: any): Promise<void> {
    try {
      await interaction.deferUpdate();
      
      const solicitacaoId = interaction.customId.replace('resolver_', '');
      const analista = interaction.user.tag;
      
      this.logger.log(`✅ ${analista} resolvendo: ${solicitacaoId}`);

      // Atualizar embed
      const embedOriginal = interaction.message.embeds[0];
      const embedResolvido = EmbedBuilder.from(embedOriginal)
        .setColor(0x00FF00) // Verde = Resolvido
        .setFooter({ 
          text: `Resolvido por ${analista} • ${new Date().toLocaleDateString('pt-BR')}` 
        });

      // Adicionar campo de resolução
      const camposExistentes = embedResolvido.data.fields || [];
      const temCampoStatus = camposExistentes.some(f => f.name.includes('Status'));
      
      if (!temCampoStatus) {
        embedResolvido.addFields(
          { name: '✅ Status', value: '**RESOLVIDO**', inline: true },
          { name: '🕒 Resolução', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        );
      }

      // Botões finais (apenas histórico)
      const rowFinal = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('📁 Ver Histórico')
            .setStyle(ButtonStyle.Link)
            .setURL(`${this.configService.get('SERVER_URL') || 'http://localhost:3000'}/atendimento/${solicitacaoId}`)
            .setEmoji('📋'),
            
          new ButtonBuilder()
            .setCustomId(`reabrir_${solicitacaoId}`)
            .setLabel('🔄 Reabrir')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
        );

      await interaction.editReply({
        embeds: [embedResolvido],
        components: [rowFinal]
      });

      await interaction.followUp({
        content: `🎉 **SOLICITAÇÃO RESOLVIDA!**\n\n\`${solicitacaoId}\` foi marcada como resolvida por ${analista}`,
        ephemeral: false
      });

      // TODO: Integrar com serviços externos
      // 1. Marcar como resolvido no banco
      // 2. Encerrar no WhatsApp
      // 3. Gerar relatório
      
      this.logger.log(`✅ ${solicitacaoId} resolvida por ${analista}`);

    } catch (error: any) {
      this.logger.error(`❌ Erro ao resolver: ${error.message}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Erro ao marcar como resolvido',
          ephemeral: true
        });
      }
    }
  }

  /**
   * Handler para botão "Reabrir"
   */
  private async handleReabrirAtendimento(interaction: any): Promise<void> {
    try {
      await interaction.deferUpdate();
      
      const solicitacaoId = interaction.customId.replace('reabrir_', '');
      const analista = interaction.user.tag;
      
      this.logger.log(`🔄 ${analista} reabrindo: ${solicitacaoId}`);

      // Atualizar embed para "Pendente" (vermelho)
      const embedOriginal = interaction.message.embeds[0];
      const embedReaberto = EmbedBuilder.from(embedOriginal)
        .setColor(0xFF0000) // Vermelho = Pendente
        .setFooter({ 
          text: `Reaberto por ${analista} • ${new Date().toLocaleDateString('pt-BR')}` 
        });

      // Remover campo de resolução se existir
      let campos = embedReaberto.data.fields || [];
      campos = campos.filter(f => !f.name.includes('Status') && !f.name.includes('Resolução'));
      embedReaberto.data.fields = campos;

      // Botões iniciais (assumir novamente)
      const rowReaberto = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`assumir_${solicitacaoId}`)
            .setLabel('✅ Assumir Atendimento')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👨‍💻'),
          
          new ButtonBuilder()
            .setLabel('🚀 Abrir Portal')
            .setStyle(ButtonStyle.Link)
            .setURL(`${this.configService.get('SERVER_URL') || 'http://localhost:3000'}/atendimento/${solicitacaoId}`)
            .setEmoji('🌐')
        );

      await interaction.editReply({
        embeds: [embedReaberto],
        components: [rowReaberto]
      });

      await interaction.followUp({
        content: `🔄 **SOLICITAÇÃO REABERTA!**\n\n\`${solicitacaoId}\` foi reaberta por ${analista}\n\nClique em "✅ Assumir" para atender.`,
        ephemeral: false
      });

      // TODO: Notificar WhatsApp que foi reaberto
      
      this.logger.log(`🔄 ${solicitacaoId} reaberta por ${analista}`);

    } catch (error: any) {
      this.logger.error(`❌ Erro ao reabrir: ${error.message}`);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Erro ao reabrir solicitação',
          ephemeral: true
        });
      }
    }
  }

  /**
   * Handler para comando !reabrir <id>
   */
  private async handleComandoReabrir(message: any, solicitacaoId: string): Promise<void> {
    try {
      if (!solicitacaoId || solicitacaoId.length < 5) {
        await message.reply('❌ **ID inválido!**\nUse: `!reabrir SOL123456`');
        return;
      }

      // Aqui você buscaria a mensagem original pelo ID
      // Por enquanto, só responde que precisa implementar
      await message.reply(`🔄 **Comando reconhecido!**\n\nPara reabrir \`${solicitacaoId}\`, clique no botão "🔄 Reabrir" na mensagem original da solicitação.\n\n*Implementação completa requer busca no banco de dados.*`);
      
      this.logger.log(`🔄 Comando reabrir recebido: ${solicitacaoId}`);

    } catch (error: any) {
      this.logger.error(`❌ Erro no comando reabrir: ${error.message}`);
      await message.reply('❌ Erro ao processar comando.');
    }
  }

  /**
   * Extrai número do WhatsApp do embed
   */
  private extrairWhatsAppDoEmbed(embed: any): string {
    try {
      const campoWhatsApp = embed.fields?.find((f: any) => 
        f.name.includes('WhatsApp') || f.name.includes('📞')
      );
      
      if (campoWhatsApp && campoWhatsApp.value) {
        // Extrai apenas números do campo
        return campoWhatsApp.value.replace(/\D/g, '');
      }
      
      return '5511999999999'; // Fallback
    } catch {
      return '5511999999999'; // Fallback
    }
  }
  /**
   * Envia solicitação de teste
   */
  async enviarSolicitacaoTeste(): Promise<boolean> {
    try {
      if (!this.isReady || !this.client || !this.canalSolicitacoesId) {
        this.logger.error('Bot ou canal não configurado');
        return false;
      }

      const channel = await this.client.channels.fetch(this.canalSolicitacoesId);
      
      if (!channel || channel.type !== ChannelType.GuildText) {
        this.logger.error('Canal inválido');
        return false;
      }

      const textChannel = channel as TextChannel;
      const solicitacaoId = `TEST${Date.now().toString().slice(-6)}`;

      const embed = new EmbedBuilder()
        .setColor(0xFF0000) // Vermelho para PDV Parado
        .setTitle(`📋 SOLICITAÇÃO TESTE #${solicitacaoId}`)
        .setDescription('**PDV Parado** - 🚨 **TESTE DO SISTEMA**')
        .addFields(
          { name: '🏢 Loja', value: 'Supermercado Teste Ltda', inline: true },
          { name: '📋 CNPJ', value: '12.345.678/0001-99', inline: true },
          { name: '👤 Responsável', value: 'João da Silva', inline: true },
          { name: '📞 WhatsApp', value: '`5511999999999`', inline: true },
          { name: '🕒 Recebida', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          { name: '📝 Descrição', value: 'PDV não está ligando. Este é um teste do sistema VR Software.' },
        )
        .setFooter({ text: 'VR Software • TESTE • Clique em "Assumir"' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`assumir_${solicitacaoId}`)
            .setLabel('✅ Assumir Atendimento')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👨‍💻'),
          
          new ButtonBuilder()
            .setLabel('🚀 Abrir Portal')
            .setStyle(ButtonStyle.Link)
            .setURL(`http://localhost:3000/atendimento/${solicitacaoId}`)
            .setEmoji('🌐'),
        );

      await textChannel.send({
        content: `📢 **SOLICITAÇÃO DE TESTE**`,
        embeds: [embed],
        components: [row],
      });

      this.logger.log(`✅ Teste enviado: ${solicitacaoId}`);
      return true;

    } catch (error: any) {
      this.logger.error(`❌ Erro no teste: ${error.message}`);
      return false;
    }
  }

  /**
   * Envia solicitação real do WhatsApp
   */
  async enviarSolicitacaoReal(dados: any): Promise<boolean> {
    try {
      if (!this.isReady || !this.client || !this.canalSolicitacoesId) {
        this.logger.error('Bot ou canal não configurado para envio real');
        return false;
      }

      const channel = await this.client.channels.fetch(this.canalSolicitacoesId);
      
      if (!channel || channel.type !== ChannelType.GuildText) {
        this.logger.error('Canal inválido para envio real');
        return false;
      }

      const textChannel = channel as TextChannel;

      // Cores por tipo de problema
      const cores: Record<string, number> = {
        'PDV Parado': 0xFF0000,
        'Promoção / Oferta': 0x00FF00,
        'Estoque': 0xFFFF00,
        'Nota Fiscal': 0x0099FF,
        'Outros': 0x808080,
      };

      const embed = new EmbedBuilder()
        .setColor(cores[dados.tipoProblema] || 0x808080)
        .setTitle(`📋 SOLICITAÇÃO #${dados.id}`)
        .setDescription(`**${dados.tipoProblema}**`)
        .addFields(
          { name: '🏢 Loja', value: dados.razaoSocial, inline: true },
          { name: '📋 CNPJ', value: dados.cnpj, inline: true },
          { name: '👤 Responsável', value: dados.nomeResponsavel, inline: true },
          { name: '📞 WhatsApp', value: `\`${dados.whatsappId}\``, inline: true },
          { name: '🕒 Recebida', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
          { name: '📝 Descrição', value: dados.descricao.substring(0, 500) + (dados.descricao.length > 500 ? '...' : '') },
        )
        .setFooter({ text: 'VR Software • Clique em "Assumir" para atender' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`assumir_${dados.id}`)
            .setLabel('✅ Assumir Atendimento')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👨‍💻'),
          
          new ButtonBuilder()
            .setLabel('🚀 Abrir Portal')
            .setStyle(ButtonStyle.Link)
            .setURL(`${this.FRONTEND_URL}/atendimento/${dados.id}?source=discord`) 
            .setEmoji('🌐'),
        );

      await textChannel.send({
        content: `📢 **NOVA SOLICITAÇÃO**`,
        embeds: [embed],
        components: [row],
      });

      this.logger.log(`✅ Solicitação real enviada: ${dados.id}`);
      return true;

    } catch (error: any) {
      this.logger.error(`❌ Erro ao enviar real: ${error.message}`);
      return false;
    }
  }

  /**
   * Método para o WhatsApp Service chamar
   */
  async notificarNovaSolicitacao(dados: any): Promise<void> {
    const sucesso = await this.enviarSolicitacaoReal({
      id: dados.id,
      razaoSocial: dados.razaoSocial,
      cnpj: dados.cnpj,
      nomeResponsavel: dados.nomeResponsavel,
      tipoProblema: dados.tipoProblema,
      descricao: dados.descricao,
      whatsappId: dados.whatsappId,
    });

    if (!sucesso) {
      this.logger.warn('Falha ao enviar para Discord. Usando fallback...');
      // Aqui você pode chamar um método de fallback (webhook, email, etc.)
    }
  }

  /**
   * Status do bot
   */
  getStatus() {
    return {
      isConnected: this.isReady,
      username: this.client?.user?.tag || 'Desconectado',
      canalConfigurado: !!this.canalSolicitacoesId,
      canalId: this.canalSolicitacoesId || 'Não configurado',
      servidores: this.client?.guilds.cache.size || 0,
    };
  }

  async verificarConexao(): Promise<void> {
  if (!this.client || !this.isReady) {
    this.logger.error('❌ Bot não está pronto');
    return;
  }

  this.logger.log('=== DIAGNÓSTICO DISCORD ===');
  this.logger.log(`✅ Bot: ${this.client.user?.tag}`);
  this.logger.log(`🏰 Servidores: ${this.client.guilds.cache.size}`);
  
  // Listar todos os servidores
  this.client.guilds.cache.forEach(guild => {
    this.logger.log(`   - ${guild.name} (${guild.id})`);
    
    // Listar canais de texto
    const textChannels = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText);
    textChannels.forEach(channel => {
      this.logger.log(`      📝 ${channel.name} (${channel.id})`);
    });
  });
  
  this.logger.log(`📌 Canal configurado: ${this.canalSolicitacoesId || 'Nenhum'}`);
  this.logger.log('===========================');
}
}