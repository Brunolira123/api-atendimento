import { 
  Channel, 
  Guild, 
  TextChannel, 
  PermissionsBitField,
  PermissionResolvable 
} from 'discord.js';

export class DiscordUtils {
  /**
   * Verifica permissões em um canal
   */
  static async checkChannelPermissions(
    channel: TextChannel, 
    permissions: PermissionResolvable[]
  ): Promise<boolean> {
    try {
      const botMember = channel.guild.members.me;
      if (!botMember) return false;

      const channelPermissions = channel.permissionsFor(botMember);
      if (!channelPermissions) return false;

      return permissions.every(permission => 
        channelPermissions.has(permission)
      );
    } catch {
      return false;
    }
  }

  /**
   * Verifica se tem permissão para enviar mensagens
   */
  static async canSendMessages(channel: TextChannel): Promise<boolean> {
    return this.checkChannelPermissions(channel, [
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ViewChannel
    ]);
  }

  /**
   * Verifica se tem permissão para gerenciar mensagens
   */
  static async canManageMessages(channel: TextChannel): Promise<boolean> {
    return this.checkChannelPermissions(channel, [
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.ViewChannel
    ]);
  }

  /**
   * Verifica permissões básicas de administração
   */
  static async hasBasicPermissions(channel: TextChannel): Promise<boolean> {
    return this.checkChannelPermissions(channel, [
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.ReadMessageHistory
    ]);
  }

  // ... resto do código permanece igual
}