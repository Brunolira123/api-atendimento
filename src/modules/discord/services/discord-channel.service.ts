import { Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  TextChannel,
  NewsChannel,
  ChannelType,
  Guild,
  GuildBasedChannel,
} from 'discord.js';
import { DiscordBotClient } from '../discord-bot.client';

export interface ChannelInfo {
  id: string;
  name: string;
  type: string;
  guildName: string;
  canSend: boolean;
}

@Injectable()
export class DiscordChannelService {
  private readonly logger = new Logger(DiscordChannelService.name);

  constructor(private readonly botClient: DiscordBotClient) {}

  /**
   * Obtém um canal de texto pelo ID
   */
  async getTextChannel(channelId: string): Promise<TextChannel | null> {
    try {
      const channel = await this.botClient.client.channels.fetch(channelId);
      
      if (!channel) {
        this.logger.warn(`Canal ${channelId} não encontrado`);
        return null;
      }

      if (this.isTextChannel(channel)) {
        return channel as TextChannel;
      }

      this.logger.warn(`Canal ${channelId} não é um canal de texto válido`);
      return null;
    } catch (error) {
      this.logger.error(`Erro ao buscar canal ${channelId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Verifica se o canal é um canal de texto válido
   */
  isTextChannel(channel: Channel): boolean {
    const validTypes = [
      ChannelType.GuildText,     // 0
      ChannelType.GuildNews,     // 5
      ChannelType.GuildForum,    // 15
      ChannelType.GuildMedia,    // 16
    ];

    return channel.isTextBased && 
           channel.isTextBased() && 
           validTypes.includes(channel.type);
  }

  /**
   * Verifica se o bot tem permissão para enviar mensagens
   */
  async canSendMessages(channelId: string): Promise<boolean> {
    try {
      const channel = await this.getTextChannel(channelId);
      
      if (!channel) {
        return false;
      }

      const botMember = channel.guild.members.me;
      if (!botMember) {
        return false;
      }

      return channel.permissionsFor(botMember)?.has('SendMessages') ?? false;
    } catch (error) {
      this.logger.error(`Erro ao verificar permissões: ${error.message}`);
      return false;
    }
  }

  /**
   * Envia mensagem para um canal
   */
  async sendMessage(channelId: string, content: string | any): Promise<boolean> {
    try {
      const channel = await this.getTextChannel(channelId);
      
      if (!channel) {
        return false;
      }

      await channel.send(content);
      return true;
    } catch (error) {
      this.logger.error(`Erro ao enviar mensagem: ${error.message}`);
      return false;
    }
  }

  /**
   * Lista todos os canais de texto disponíveis
   */
  async listTextChannels(): Promise<ChannelInfo[]> {
    const channels: ChannelInfo[] = [];

    try {
      const guilds = this.botClient.client.guilds.cache;

      for (const [guildId, guild] of guilds) {
        const textChannels = guild.channels.cache.filter(ch => 
          this.isTextChannel(ch as Channel)
        );

        textChannels.forEach(channel => {
          const guildChannel = channel as GuildBasedChannel;
          channels.push({
            id: guildChannel.id,
            name: guildChannel.name,
            type: ChannelType[guildChannel.type] || 'Unknown',
            guildName: guild.name,
            canSend: this.checkChannelPermissions(guildChannel as TextChannel),
          });
        });
      }

      return channels;
    } catch (error) {
      this.logger.error(`Erro ao listar canais: ${error.message}`);
      return [];
    }
  }

  /**
   * Busca canal pelo nome
   */
  async findChannelByName(name: string): Promise<ChannelInfo | null> {
    try {
      const channels = await this.listTextChannels();
      const searchName = name.toLowerCase();
      
      const found = channels.find(ch => 
        ch.name.toLowerCase().includes(searchName) ||
        ch.guildName.toLowerCase().includes(searchName)
      );

      return found || null;
    } catch (error) {
      this.logger.error(`Erro ao buscar canal: ${error.message}`);
      return null;
    }
  }

  /**
   * Verifica se um canal existe
   */
  async channelExists(channelId: string): Promise<boolean> {
    try {
      const channel = await this.botClient.client.channels.fetch(channelId);
      return !!channel && this.isTextChannel(channel);
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtém informações do canal
   */
  async getChannelInfo(channelId: string): Promise<ChannelInfo | null> {
    try {
      const channel = await this.getTextChannel(channelId);
      
      if (!channel) {
        return null;
      }

      return {
        id: channel.id,
        name: channel.name,
        type: ChannelType[channel.type] || 'Unknown',
        guildName: channel.guild.name,
        canSend: await this.canSendMessages(channelId),
      };
    } catch (error) {
      this.logger.error(`Erro ao obter informações do canal: ${error.message}`);
      return null;
    }
  }

  private checkChannelPermissions(channel: TextChannel): boolean {
    try {
      const botMember = channel.guild.members.me;
      if (!botMember) return false;

      const permissions = channel.permissionsFor(botMember);
      return permissions?.has('SendMessages') ?? false;
    } catch {
      return false;
    }
  }
}