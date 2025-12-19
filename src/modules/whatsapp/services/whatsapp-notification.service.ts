import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '@modules/discord/services/discord.service';
import { IWhatsAppNotificationService } from '../../../shared/interfaces/whatsapp.interface';

@Injectable()
export class WhatsAppNotificationService implements IWhatsAppNotificationService {
  private readonly logger = new Logger(WhatsAppNotificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly discordService: DiscordService,
  ) {}

  async notificarSolicitacao(whatsappId: string, dados: any): Promise<void> {
    try {
      if (this.discordService) {
        await this.discordService.notificarNovaSolicitacao({
          id: dados.solicitacaoId,
          razaoSocial: dados.razaoSocial,
          cnpj: this.formatarCNPJ(dados.cnpj),
          nomeResponsavel: dados.nomeResponsavel,
          tipoProblema: dados.tipoProblema,
          descricao: dados.descricaoProblema,
          whatsappId,
          status: 'pendente',
        });
        this.logger.log(`✅ Notificação enviada para Discord Bot`);
        return;
      }
    } catch (error: any) {
      this.logger.warn(`⚠️  Discord Bot falhou: ${error.message}`);
    }
    
    // Fallback: usar webhook antigo
    await this.enviarParaDiscordWebhook(whatsappId, dados);
  }

  async enviarParaDiscordWebhook(whatsappId: string, dados: any): Promise<void> {
    const webhookUrl = this.configService.get('DISCORD_WEBHOOK_URL');
    
    if (!webhookUrl) {
      this.logger.log('ℹ️  Webhook Discord não configurado, pulando notificação');
      return;
    }

    try {
      const embed = this.criarEmbedDiscord(whatsappId, dados);
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embed),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.log(`✅ Notificação enviada para Discord: ${dados.solicitacaoId}`);
    } catch (error: any) {
      this.logger.error(`❌ Erro ao enviar para Discord: ${error.message}`);
    }
  }

  private criarEmbedDiscord(whatsappId: string, dados: any) {
    const cores: Record<number, number> = { 
      1: 15158332, // Vermelho - PDV Parado
      2: 3066993,  // Verde - Promoção
      3: 15844367, // Amarelo - Estoque
      4: 3447003,  // Azul - Nota Fiscal
      5: 9807270   // Cinza - Outros
    };

    const emojis: Record<number, string> = { 
      1: "🚨", // PDV Parado
      2: "💰", // Promoção
      3: "📦", // Estoque
      4: "🧾", // Nota Fiscal
      5: "🔧"  // Outros
    };

    return {
      username: 'VR Software - Sistema de Atendimento',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/3067/3067256.png',
      content: `${emojis[dados.opcaoEscolhida] || "📋"} **NOVA SOLICITAÇÃO - ${dados.solicitacaoId}**`,
      embeds: [
        {
          title: `${dados.tipoProblema}`,
          color: cores[dados.opcaoEscolhida] || 9807270,
          fields: [
            { name: '🏢 Loja', value: dados.razaoSocial || 'Não informado', inline: true },
            { name: '📋 CNPJ', value: this.formatarCNPJ(dados.cnpj) || 'Não informado', inline: true },
            { name: '👤 Responsável', value: dados.nomeResponsavel || 'Não informado', inline: true },
            { name: '📞 WhatsApp', value: `\`${whatsappId}\``, inline: true },
            { name: '🆔 ID', value: `\`${dados.solicitacaoId}\``, inline: true },
            { name: '🕒 Hora', value: new Date().toLocaleTimeString('pt-BR'), inline: true },
            {
              name: '📝 Descrição',
              value: (dados.descricaoProblema?.substring(0, 1000) || 'Não informada') + 
                     (dados.descricaoProblema?.length > 1000 ? '...' : ''),
            },
          ],
          footer: { text: 'VR Software • Sistema de Atendimento Automático' },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private formatarCNPJ(cnpj: string): string {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
}