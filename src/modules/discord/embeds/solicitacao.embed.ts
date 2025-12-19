import { EmbedBuilder } from 'discord.js';

export interface DadosSolicitacao {
  id: string;
  razaoSocial: string;
  cnpj: string;
  nomeResponsavel: string;
  tipoProblema: string;
  descricao: string;
  whatsappId: string;
  prioridade?: 'alta' | 'normal' | 'baixa';
}

export class SolicitacaoEmbed {
  private frontendUrl: string;

  constructor(frontendUrl: string = 'http://localhost:3000') {
    this.frontendUrl = frontendUrl;
  }

  /**
   * Cria embed para nova solicitação
   */
  criarNovaSolicitacao(dados: DadosSolicitacao): EmbedBuilder {
    const cor = this.getCorPorProblema(dados.tipoProblema, dados.prioridade);
    const emoji = this.getEmojiPorProblema(dados.tipoProblema);

    return new EmbedBuilder()
      .setColor(cor)
      .setTitle(`${emoji} SOLICITAÇÃO #${dados.id}`)
      .setDescription(`**${dados.tipoProblema}**`)
      .addFields(
        { 
          name: '🏢 Loja', 
          value: dados.razaoSocial || '*Não informado*', 
          inline: true 
        },
        { 
          name: '📋 CNPJ', 
          value: this.formatarCNPJ(dados.cnpj) || '*Não informado*', 
          inline: true 
        },
        { 
          name: '👤 Responsável', 
          value: dados.nomeResponsavel || '*Não informado*', 
          inline: true 
        },
        { 
          name: '📞 WhatsApp', 
          value: `\`${dados.whatsappId}\``, 
          inline: true 
        },
        { 
          name: '🎯 Prioridade', 
          value: this.getTextoPrioridade(dados.prioridade), 
          inline: true 
        },
        { 
          name: '🕒 Recebida', 
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
          inline: true 
        },
        { 
          name: '📝 Descrição', 
          value: this.truncarTexto(dados.descricao, 500)
        },
      )
      .setFooter({ 
        text: 'VR Software • Clique em "Assumir" para atender' 
      })
      .setTimestamp();
  }

  /**
   * Cria embed para solicitação em atendimento
   */
  criarSolicitacaoEmAtendimento(
    dados: DadosSolicitacao, 
    atendente: string,
    atendenteId: string
  ): EmbedBuilder {
    const embed = this.criarNovaSolicitacao(dados);
    
    return embed
      .setColor(0xFFA500) // Laranja
      .addFields(
        { 
          name: '👨‍💻 Atendente', 
          value: `<@${atendenteId}>`, 
          inline: true 
        },
        { 
          name: '⏱️ Início do Atendimento', 
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
          inline: true 
        },
      )
      .setFooter({ 
        text: `Em atendimento por ${atendente} • VR Software` 
      });
  }

  /**
   * Cria embed para solicitação resolvida
   */
  criarSolicitacaoResolvida(
    dados: DadosSolicitacao, 
    atendente: string
  ): EmbedBuilder {
    const embed = this.criarNovaSolicitacao(dados);
    
    return embed
      .setColor(0x00FF00) // Verde
      .addFields(
        { 
          name: '✅ Status', 
          value: '**RESOLVIDO**', 
          inline: true 
        },
        { 
          name: '👨‍💻 Atendente', 
          value: atendente, 
          inline: true 
        },
        { 
          name: '🕒 Resolução', 
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
          inline: true 
        },
      )
      .setFooter({ 
        text: `Resolvido por ${atendente} • VR Software` 
      });
  }

  /**
   * Obtém cor baseada no tipo de problema e prioridade
   */
  private getCorPorProblema(tipoProblema: string, prioridade?: string): number {
    const cores: Record<string, number> = {
      'PDV Parado': 0xFF0000,       // Vermelho
      'Promoção / Oferta': 0x00FF00, // Verde
      'Estoque': 0xFFFF00,          // Amarelo
      'Nota Fiscal': 0x0099FF,      // Azul
      'Outros': 0x808080,           // Cinza
    };

    let cor = cores[tipoProblema] || 0x808080;

    // Ajustar cor baseado na prioridade
    if (prioridade === 'alta') {
      cor = 0xFF0000; // Vermelho mais forte
    } else if (prioridade === 'baixa') {
      cor = 0x666666; // Cinza mais escuro
    }

    return cor;
  }

  /**
   * Obtém emoji baseado no tipo de problema
   */
  private getEmojiPorProblema(tipoProblema: string): string {
    const emojis: Record<string, string> = {
      'PDV Parado': '🚨',
      'Promoção / Oferta': '💰',
      'Estoque': '📦',
      'Nota Fiscal': '🧾',
      'Outros': '📋',
    };

    return emojis[tipoProblema] || '📋';
  }

  /**
   * Formata CNPJ
   */
  private formatarCNPJ(cnpj: string): string {
    if (!cnpj) return '';
    
    // Remove caracteres não numéricos
    const numeros = cnpj.replace(/\D/g, '');
    
    if (numeros.length === 14) {
      return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}/${numeros.slice(8, 12)}-${numeros.slice(12)}`;
    }
    
    return cnpj;
  }

  /**
   * Obtém texto de prioridade
   */
  private getTextoPrioridade(prioridade?: string): string {
    const textos: Record<string, string> = {
      'alta': '🔴 **ALTA**',
      'normal': '🟡 **NORMAL**',
      'baixa': '🟢 **BAIXA**',
    };

    return textos[prioridade || 'normal'] || '🟡 **NORMAL**';
  }

  /**
   * Trunca texto se muito longo
   */
  private truncarTexto(texto: string, maxLength: number): string {
    if (texto.length <= maxLength) return texto;
    return texto.substring(0, maxLength - 3) + '...';
  }
}