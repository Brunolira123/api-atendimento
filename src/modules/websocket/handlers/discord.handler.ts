import { Injectable, Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { ConversationManagerService } from '../services/conversation-manager.service';
import { WhatsAppEventsService } from '../services/whatsapp-events.service';

@Injectable()
export class DiscordHandler {
  private readonly logger = new Logger(DiscordHandler.name);

  constructor(
    private readonly conversationManager: ConversationManagerService,
    private readonly whatsappEvents: WhatsAppEventsService,
  ) {}

  async handleDiscordAssumir(client: Socket, server: Server, data: { solicitacaoId: string; atendente: string; discordId: string }) {
    const { solicitacaoId, atendente, discordId } = data;
    
    try {
      const solicitacao = await this.conversationManager.assumirSolicitacao(
        solicitacaoId,
        atendente
      );

      // Notificar todos os clientes
      const result = {
        type: 'discord_assumido',
        solicitacaoId,
        atendente,
        discordId,
        whatsappId: solicitacao.whatsappId,
        timestamp: new Date().toISOString(),
      };

      server.emit('solicitacao:assumida', result);

      // Atualizar lista de conversas
      await this.conversationManager.enviarConversasAtualizadas(server);

      // Gerar URL do portal
      const portalUrl = `http://localhost:3000/atendimento/${solicitacaoId}?atendente=${encodeURIComponent(atendente)}&discordId=${discordId}&source=discord`;
      
      // Resposta para o cliente
      client.emit('discord:assumido', {
        success: true,
        solicitacaoId,
        portalUrl,
        solicitacao: this.conversationManager.mapearParaConversa(solicitacao),
        message: 'Atendimento assumido via Discord',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ ${atendente} (Discord) assumiu ${solicitacaoId}`);

      return {
        evento: 'solicitacao:assumida',
        data: result,
      };
    } catch (error) {
      this.logger.error(`❌ Erro no Discord: ${error.message}`);
      client.emit('error', {
        message: 'Erro ao assumir via Discord',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
  }
}