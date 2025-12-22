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
      // 🔥 SOLUÇÃO: Usar método de compatibilidade para Discord
      // Discord não tem analistaId, então usamos o método especial
      const solicitacao = await this.conversationManager.assumirSolicitacaoDiscord(
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
        source: 'discord',
      };

      server.emit('solicitacao:assumida', result);

      // Atualizar lista de conversas
      await this.conversationManager.enviarConversasAtualizadas(server);

      // 🔥 URL do portal com token Discord
      // Para Discord, precisamos gerar um token especial
      const portalUrl = await this.generateDiscordPortalUrl(
        solicitacaoId,
        atendente,
        discordId
      );
      
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

  // 🔧 GERAR URL DO PORTAL COM TOKEN DISCORD
  private async generateDiscordPortalUrl(
    solicitacaoId: string,
    atendente: string,
    discordId: string
  ): Promise<string> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Para Discord, podemos usar um token simples ou implementar
    // um sistema de tokens temporários
    const params = new URLSearchParams({
      solicitacaoId,
      atendente: encodeURIComponent(atendente),
      discordId,
      source: 'discord',
      timestamp: Date.now().toString(),
    });
    
    // Podemos adicionar uma assinatura simples para segurança
    const signature = this.generateSimpleSignature(solicitacaoId, discordId);
    params.append('sig', signature);
    
    return `${frontendUrl}/atendimento/${solicitacaoId}?${params.toString()}`;
  }

  // 🔧 GERAR ASSINATURA SIMPLES (para evitar URLS forjadas)
  private generateSimpleSignature(solicitacaoId: string, discordId: string): string {
    const secret = process.env.DISCORD_SECRET || 'discord-secret-key';
    const data = `${solicitacaoId}:${discordId}:${Date.now()}:${secret}`;
    
    // Hash simples (em produção, use algo mais seguro)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  // 🔧 VALIDAR ASSINATURA (no backend do frontend)
  private validateSignature(
    solicitacaoId: string,
    discordId: string,
    timestamp: string,
    signature: string
  ): boolean {
    const secret = process.env.DISCORD_SECRET || 'discord-secret-key';
    const data = `${solicitacaoId}:${discordId}:${timestamp}:${secret}`;
    
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash = hash & hash;
    }
    
    const expected = Math.abs(hash).toString(16).substring(0, 8);
    return expected === signature;
  }

  // 🔧 MÉTODO PARA CONVERTER DISCORD PARA ANALISTA (futuro)
  async convertDiscordToAnalista(discordId: string, discordTag: string): Promise<number | null> {
    // Implementação futura: buscar ou criar analista a partir do Discord
    // Por enquanto, retorna null para usar o método de compatibilidade
    return null;
  }
}