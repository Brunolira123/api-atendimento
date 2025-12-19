import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGatewayService } from '../../websocket/websocket.gateway';
import { DiscordMessageService } from './discord-message.service';
import { DiscordChannelService } from './discord-channel.service';

export interface NotificationData {
  tipo: 'nova_solicitacao' | 'atendimento_assumido' | 'solicitacao_resolvida' | 'erro';
  solicitacaoId?: string;
  mensagem: string;
  dados?: any;
  prioridade?: 'alta' | 'normal' | 'baixa';
}

@Injectable()
export class DiscordNotificationService {
  private readonly logger = new Logger(DiscordNotificationService.name);
  private canalNotificacoesId: string | null = null;

  constructor(
    private readonly messageService: DiscordMessageService,
    private readonly webSocketGateway: WebSocketGatewayService,
    private readonly channelService: DiscordChannelService
  ) {}

  /**
   * Configura canal de notificações
   */
  setCanalNotificacoes(canalId: string): void {
    this.canalNotificacoesId = canalId;
    this.logger.log(`📢 Canal de notificações configurado: ${canalId}`);
  }

  /**
   * Envia notificação
   */
    async enviarNotificacao(data: NotificationData): Promise<boolean> {
    if (!this.canalNotificacoesId) {
      this.logger.warn('Canal de notificações não configurado');
      return false;
    }

    try {
      const mensagem = this.formatarMensagemNotificacao(data);
      
      // Usa diretamente o channelService
      const sucesso = await this.channelService.sendMessage(
        this.canalNotificacoesId,
        mensagem
      );

      if (sucesso) {
        this.logger.log(`📢 Notificação enviada: ${data.tipo}`);
        
        // Se for uma nova solicitação, também notifica via WebSocket
        if (data.tipo === 'nova_solicitacao' && data.dados) {
          await this.webSocketGateway.emit('solicitacao:nova', {
            ...data.dados,
            timestamp: new Date().toISOString(),
          });
        }
      }

      return sucesso;
    } catch (error) {
      this.logger.error(`Erro ao enviar notificação: ${error.message}`);
      return false;
    }
  }

  /**
   * Notifica nova solicitação do WhatsApp
   */
  async notificarNovaSolicitacao(dados: any): Promise<boolean> {
    const notificationData: NotificationData = {
      tipo: 'nova_solicitacao',
      solicitacaoId: dados.id,
      mensagem: `📢 **NOVA SOLICITAÇÃO RECEBIDA!**`,
      dados: dados,
      prioridade: dados.prioridade || 'normal',
    };

    return this.enviarNotificacao(notificationData);
  }

  /**
   * Notifica atendimento assumido
   */
  async notificarAtendimentoAssumido(solicitacaoId: string, atendente: string): Promise<boolean> {
    const notificationData: NotificationData = {
      tipo: 'atendimento_assumido',
      solicitacaoId,
      mensagem: `✅ **ATENDIMENTO ASSUMIDO!**\n\nSolicitação \`${solicitacaoId}\` foi assumida por **${atendente}**`,
      prioridade: 'normal',
    };

    return this.enviarNotificacao(notificationData);
  }

  /**
   * Notifica solicitação resolvida
   */
  async notificarSolicitacaoResolvida(solicitacaoId: string, atendente: string): Promise<boolean> {
    const notificationData: NotificationData = {
      tipo: 'solicitacao_resolvida',
      solicitacaoId,
      mensagem: `🎉 **SOLICITAÇÃO RESOLVIDA!**\n\n\`${solicitacaoId}\` foi marcada como resolvida por **${atendente}**`,
      prioridade: 'normal',
    };

    return this.enviarNotificacao(notificationData);
  }

  /**
   * Notifica erro no sistema
   */
  async notificarErro(erro: string, contexto?: string): Promise<boolean> {
    const notificationData: NotificationData = {
      tipo: 'erro',
      mensagem: `❌ **ERRO NO SISTEMA!**\n\n${erro}\n${contexto ? `\n**Contexto:** ${contexto}` : ''}`,
      prioridade: 'alta',
    };

    return this.enviarNotificacao(notificationData);
  }

  /**
   * Envia ping de saúde do sistema
   */
  async enviarHealthCheck(): Promise<boolean> {
    const notificationData: NotificationData = {
      tipo: 'solicitacao_resolvida', // Reutiliza tipo existente
      mensagem: `🏥 **HEALTH CHECK**\n\nSistema operando normalmente\n🕒 ${new Date().toLocaleString('pt-BR')}`,
      prioridade: 'baixa',
    };

    return this.enviarNotificacao(notificationData);
  }

  /**
   * Formata mensagem de notificação
   */
  private formatarMensagemNotificacao(data: NotificationData): string {
    const emoji = this.getEmojiPorTipo(data.tipo);
    const prioridadeEmoji = this.getPrioridadeEmoji(data.prioridade);
    
    let mensagem = `${prioridadeEmoji} ${emoji} ${data.mensagem}\n\n`;
    
    if (data.solicitacaoId) {
      mensagem += `**ID:** \`${data.solicitacaoId}\`\n`;
    }
    
    mensagem += `**🕒 Horário:** ${new Date().toLocaleString('pt-BR')}\n`;
    
    if (data.dados) {
      mensagem += `\n**📋 Detalhes:**\n`;
      
      if (data.dados.razaoSocial) {
        mensagem += `• **Loja:** ${data.dados.razaoSocial}\n`;
      }
      
      if (data.dados.tipoProblema) {
        mensagem += `• **Problema:** ${data.dados.tipoProblema}\n`;
      }
      
      if (data.dados.whatsappId) {
        mensagem += `• **WhatsApp:** \`${data.dados.whatsappId}\`\n`;
      }
    }
    
    return mensagem;
  }

  /**
   * Obtém emoji baseado no tipo de notificação
   */
  private getEmojiPorTipo(tipo: string): string {
    const emojis: Record<string, string> = {
      'nova_solicitacao': '📢',
      'atendimento_assumido': '✅',
      'solicitacao_resolvida': '🎉',
      'erro': '❌',
    };

    return emojis[tipo] || '📋';
  }

  /**
   * Obtém emoji baseado na prioridade
   */
  private getPrioridadeEmoji(prioridade?: string): string {
    const emojis: Record<string, string> = {
      'alta': '🔴',
      'normal': '🟡',
      'baixa': '🟢',
    };

    return emojis[prioridade || 'normal'] || '🟡';
  }

  /**
   * Verifica se o canal de notificações está configurado
   */
  isConfigured(): boolean {
    return !!this.canalNotificacoesId;
  }

  /**
   * Obtém informações do canal de notificações
   */
  getConfig(): { canalId: string | null } {
    return {
      canalId: this.canalNotificacoesId,
    };
  }
}