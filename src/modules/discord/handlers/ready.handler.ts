import { Injectable, Logger } from '@nestjs/common';
import { Client, ActivityType } from 'discord.js';
import { DiscordChannelService } from '../services/discord-channel.service';

@Injectable()
export class ReadyHandler {
  private readonly logger = new Logger(ReadyHandler.name);

  constructor(
    private readonly channelService: DiscordChannelService,
  ) {}

  /**
   * Handler para evento 'ready' do Discord
   */
  async handleReady(client: Client): Promise<void> {
    const botName = client.user?.tag || 'Bot';
    const guildCount = client.guilds.cache.size;
    
    this.logger.log(`✅ Discord Bot conectado: ${botName}`);
    this.logger.log(`🏰 Servidores: ${guildCount}`);

    // Configurar atividade
    client.user?.setPresence({
      activities: [{
        name: 'solicitações VR',
        type: ActivityType.Watching,
      }],
      status: 'online',
    });

    // Log detalhado
    await this.logServerDetails(client);
    
    console.log('\n' + '='.repeat(60));
    console.log('🤖 DISCORD BOT CONECTADO COM SUCESSO!');
    console.log('='.repeat(60));
    console.log(`👤 Nome: ${botName}`);
    console.log(`🏰 Servidores: ${guildCount}`);
    console.log(`📡 Status: Online e operacional`);
    console.log('='.repeat(60) + '\n');
  }

  /**
   * Log detalhado dos servidores e canais
   */
  private async logServerDetails(client: Client): Promise<void> {
    const guilds = client.guilds.cache;
    
    this.logger.log('=== DIAGNÓSTICO DISCORD ===');
    
    guilds.forEach(guild => {
      this.logger.log(`🏰 Servidor: ${guild.name} (${guild.id})`);
      
      const textChannels = guild.channels.cache.filter(ch => 
        ch.isTextBased()
      );
      
      textChannels.forEach(channel => {
        this.logger.log(`   📝 ${channel.name} (${channel.id})`);
      });
    });
    
    this.logger.log('===========================');
  }
}