// src/modules/whatsapp/services/whatsapp-session.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { SessionData, IWhatsAppSessionService } from '../../../shared/interfaces/whatsapp.interface';

@Injectable()
export class WhatsAppSessionService implements IWhatsAppSessionService {
  private readonly logger = new Logger(WhatsAppSessionService.name);
  private readonly sessoesAtivas = new Map<string, SessionData>();
  private readonly menuOpcoes = {
    1: 'PDV Parado',
    2: 'Promoção / Oferta',
    3: 'Estoque',
    4: 'Nota Fiscal',
    5: 'Outros',
  };

  criarSessao(whatsappId: string): SessionData {
    const sessao: SessionData = {
      estado: 'aguardando_razao_social',
      dados: {
        whatsappId,
        inicio: new Date(),
      },
      historico: [],
    };

    this.sessoesAtivas.set(whatsappId, sessao);
    this.logger.log(`📝 Sessão criada para ${whatsappId}`);
    
    return sessao;
  }

  getSessao(whatsappId: string): SessionData | undefined {
    return this.sessoesAtivas.get(whatsappId);
  }

  atualizarSessao(whatsappId: string, sessao: SessionData): void {
    this.sessoesAtivas.set(whatsappId, sessao);
  }

  finalizarSessao(whatsappId: string): void {
    const sessao = this.getSessao(whatsappId);
    if (sessao) {
      sessao.estado = 'finalizada';
      sessao.dados.fim = new Date();
      this.atualizarSessao(whatsappId, sessao);
    }
  }

  getSessoesAtivas(): Map<string, SessionData> {
    return this.sessoesAtivas;
  }

  getMenuOpcoes() {
    return this.menuOpcoes;
  }

  processarRazaoSocial(whatsappId: string, texto: string, sessao: SessionData): SessionData {
    sessao.dados.razaoSocial = texto.trim();
    sessao.estado = 'aguardando_cnpj';
    sessao.historico.push({ etapa: 'razao_social', valor: texto });
    
    return sessao;
  }

  processarCNPJ(whatsappId: string, texto: string, sessao: SessionData): SessionData {
    const cnpj = texto.replace(/\D/g, '');
    sessao.dados.cnpj = cnpj;
    sessao.estado = 'aguardando_nome';
    sessao.historico.push({ etapa: 'cnpj', valor: cnpj });
    
    return sessao;
  }

  processarNome(whatsappId: string, texto: string, sessao: SessionData): SessionData {
    sessao.dados.nomeResponsavel = texto.trim();
    sessao.estado = 'aguardando_opcao';
    sessao.historico.push({ etapa: 'nome_responsavel', valor: texto });
    
    return sessao;
  }

  processarOpcao(whatsappId: string, texto: string, sessao: SessionData): SessionData {
    const opcao = parseInt(texto.trim());
    sessao.dados.opcaoEscolhida = opcao;
    sessao.dados.tipoProblema = this.menuOpcoes[opcao];
    sessao.estado = 'aguardando_descricao';
    sessao.historico.push({ etapa: 'opcao_escolhida', valor: this.menuOpcoes[opcao] });
    
    return sessao;
  }

  processarDescricao(whatsappId: string, texto: string, sessao: SessionData): SessionData {
    sessao.dados.descricaoProblema = texto.trim();
    sessao.historico.push({ etapa: 'descricao_problema', valor: texto });
    
    return sessao;
  }

  validarCNPJ(cnpj: string): boolean {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    return cnpjLimpo.length === 14;
  }

  validarOpcao(opcao: number): boolean {
    return !isNaN(opcao) && opcao >= 1 && opcao <= 5;
  }

   limparSessoes(): { success: boolean; count: number } {
  const count = this.sessoesAtivas.size;
  this.sessoesAtivas.clear();
  this.logger.log(`🧹 Limpas ${count} sessões ativas`);
  
  return { success: true, count };
}

  getSessoesParaDebug() {
    return Array.from(this.sessoesAtivas.entries()).map(([whatsappId, sessao]) => ({
      whatsappId,
      estado: sessao.estado,
      dados: sessao.dados,
    }));
  }
}