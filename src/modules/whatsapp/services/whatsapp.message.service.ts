// src/modules/whatsapp/services/whatsapp-message.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'whatsapp-web.js';
import { IWhatsAppMessageService } from '../../../shared/interfaces/whatsapp.interface';

@Injectable()
export class WhatsAppMessageService implements IWhatsAppMessageService {
  private readonly logger = new Logger(WhatsAppMessageService.name);

  constructor(
    private readonly client: Client,
    private readonly isConnected: boolean
  ) {}

  async enviarMensagem(
    whatsappId: string,
    mensagem: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected || !this.client) {
      this.logger.warn(`⚠️  WhatsApp não conectado, mensagem pendente para ${whatsappId}`);
      return { success: false, error: 'WhatsApp não conectado' };
    }

    try {
      const formattedTo = whatsappId.includes('@c.us') ? whatsappId : whatsappId + '@c.us';
      
      this.logger.log(`📤 Enviando mensagem para ${whatsappId}: ${mensagem.substring(0, 50)}...`);
      
      await this.client.sendMessage(formattedTo, mensagem);
      
      this.logger.log(`✅ Mensagem enviada para ${whatsappId}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao enviar mensagem para ${whatsappId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async enviarMensagemAtendente(
    whatsappId: string, 
    mensagem: string, 
    atendenteNome: string
  ): Promise<{ success: boolean; error?: string }> {
    const mensagemFormatada = `👨‍💻 *${atendenteNome} (Atendente VR):*\n${mensagem}`;
    return this.enviarMensagem(whatsappId, mensagemFormatada);
  }

  formatarCNPJ(cnpj: string): string {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  gerarMensagemInicial(): string {
    return `
👋 *Olá! Seja bem-vindo ao atendimento VR Software!*

Vou precisar de algumas informações para registrar sua solicitação:

📋 *Informe a razão social da loja:*
_(Nome completo da empresa)_
    `;
  }

  gerarMensagemRazaoSocialRegistrada(): string {
    return `
✅ *Razão social registrada!*

📋 *Agora, informe o CNPJ:*
_(Apenas números, 14 dígitos)_
    `;
  }

  gerarMensagemCNPJRegistrado(): string {
    return `
✅ *CNPJ registrado!*

👤 *Agora, informe seu nome completo:*
_(Nome da pessoa responsável pelo atendimento)_
    `;
  }

  gerarMenuOpcoes(menuOpcoes: Record<number, string>): string {
    let menu = `
✅ *Nome registrado!*

📋 *Agora, escolha o tipo de atendimento:*

`;

    for (const [numero, descricao] of Object.entries(menuOpcoes)) {
      menu += `${numero} - ${descricao}\n`;
    }

    menu += '\n*Digite apenas o número (1 a 5):*';
    return menu;
  }

  gerarMensagemOpcaoRegistrada(): string {
    return `
✅ *Tipo de atendimento registrado!*

📝 *Agora, resuma seu problema:*
_(Descreva detalhadamente o que está acontecendo)_
    `;
  }

  gerarMensagemSolicitacaoRegistrada(solicitacaoId: string, dados: any): string {
    return `
✅ *SOLICITAÇÃO REGISTRADA COM SUCESSO!*

📋 *Resumo da sua solicitação:*
• *ID:* ${solicitacaoId}
• *Loja:* ${dados.razaoSocial}
• *CNPJ:* ${this.formatarCNPJ(dados.cnpj)}
• *Responsável:* ${dados.nomeResponsavel}
• *Tipo:* ${dados.tipoProblema}
• *Hora:* ${new Date().toLocaleTimeString('pt-BR')}

📞 *Sua solicitação foi encaminhada para nossa equipe técnica.*

⏱️ *Tempo médio de resposta:*
- *URGENTE (PDV Parado):* 10-15 minutos
- *DEMAIS CASOS:* 30-60 minutos

👨‍💻 *Um analista especializado entrará em contato em breve!*

📱 *Para acompanhar o status, mantenha este WhatsApp aberta.*
    `;
  }
}