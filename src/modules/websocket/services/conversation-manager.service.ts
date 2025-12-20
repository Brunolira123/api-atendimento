import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Solicitacao } from '@shared/entities/solicitacao.entity';
import { Server, Socket } from 'socket.io';

export interface Conversa {
  id: string;
  whatsapp_id: string;
  customer_name: string;
  status: 'pending' | 'active' | 'closed';
  last_message: string;
  last_message_at: Date;
  atendente_discord: string | null;
  created_at: Date;
  razao_social: string;
  cnpj: string;
  tipo_problema: string;
  descricao: string;
  finalizado_em: Date | null;
}

@Injectable()
export class ConversationManagerService {
  private readonly logger = new Logger(ConversationManagerService.name);

  constructor(
    @InjectRepository(Solicitacao)
    private solicitacaoRepository: Repository<Solicitacao>,
  ) {}

  async enviarConversasPendentes(client: Socket) {
    try {
      const solicitacoes = await this.solicitacaoRepository.find({
        where: { status: 'pendente' },
        order: { createdAt: 'DESC' },
      });

      client.emit('conversations:pending', {
        type: 'conversations_pending',
        data: solicitacoes.map(sol => this.mapearParaConversa(sol)),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar conversas: ${error.message}`);
    }
  }

  async enviarConversasAtualizadas(server: Server) {
    try {
      const solicitacoes = await this.solicitacaoRepository.find({
        order: { createdAt: 'DESC' },
      });

      server.emit('conversations:update', {
        type: 'conversations_update',
        data: solicitacoes.map(sol => this.mapearParaConversa(sol)),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao atualizar conversas: ${error.message}`);
    }
  }

  mapearParaConversa(solicitacao: Solicitacao): Conversa {
    const statusMap: Record<string, Conversa['status']> = {
      'pendente': 'pending',
      'em_atendimento': 'active',
      'resolvida': 'closed',
      'finalizada': 'closed',
      'nova': 'pending',
    };

    return {
      id: solicitacao.solicitacaoId,
      whatsapp_id: solicitacao.whatsappId,
      customer_name: solicitacao.nomeResponsavel,
      status: statusMap[solicitacao.status] || 'pending',
      last_message: solicitacao.descricao?.substring(0, 100) || '',
      last_message_at: solicitacao.createdAt,
      atendente_discord: solicitacao.atendenteDiscord || null,
      created_at: solicitacao.createdAt,
      razao_social: solicitacao.razaoSocial,
      cnpj: solicitacao.cnpj,
      tipo_problema: solicitacao.tipoProblema,
      descricao: solicitacao.descricao,
      finalizado_em: solicitacao.finalizadoEm,
    };
  }

  async criarSolicitacaoSimulada(data: {
    from: string;
    message: string;
  }): Promise<Solicitacao> {
    const solicitacao = this.solicitacaoRepository.create({
      solicitacaoId: `SIM${Date.now()}`,
      whatsappId: data.from,
      nomeResponsavel: `Cliente Simulado ${data.from.slice(-4)}`,
      razaoSocial: 'Empresa Teste Ltda',
      cnpj: '12.345.678/0001-99',
      tipoProblema: 'Teste do Sistema',
      descricao: data.message,
      status: 'pendente',
      atendenteDiscord: null,
      createdAt: new Date(),
      finalizadoEm: null,
    });

    return await this.solicitacaoRepository.save(solicitacao);
  }

  async assumirSolicitacao(solicitacaoId: string, atendenteNome: string): Promise<Solicitacao> {
    const solicitacao = await this.solicitacaoRepository.findOne({
      where: { solicitacaoId },
    });

    if (!solicitacao) {
      throw new Error(`Solicitação ${solicitacaoId} não encontrada`);
    }

    solicitacao.atendenteDiscord = atendenteNome;
    solicitacao.status = 'em_atendimento';
    
    return await this.solicitacaoRepository.save(solicitacao);
  }

  async finalizarSolicitacao(solicitacaoId: string, atendenteNome: string, resolucao?: string): Promise<Solicitacao> {
    const solicitacao = await this.solicitacaoRepository.findOne({
      where: { solicitacaoId },
    });

    if (!solicitacao) {
      throw new Error(`Solicitação ${solicitacaoId} não encontrada`);
    }

    solicitacao.status = 'resolvida';
    solicitacao.finalizadoEm = new Date();
    
    return await this.solicitacaoRepository.save(solicitacao);
  }

  async getSolicitacao(solicitacaoId: string): Promise<Solicitacao | null> {
  try {
    return await this.solicitacaoRepository.findOne({
      where: { solicitacaoId },
    });
  } catch (error) {
    this.logger.error(`Erro ao buscar solicitação: ${error.message}`);
    return null;
  }
  }

  async getChatHistory(solicitacaoId: string): Promise<any[]> {
  try {
    const solicitacao = await this.solicitacaoRepository.findOne({
      where: { solicitacaoId },
    });

    if (!solicitacao) {
      return [];
    }
    
    const historicoBasico = [
      {
        id: `sys_${solicitacaoId}`,
        solicitacaoId,
        content: `Solicitação criada: ${solicitacao.descricao}`,
        direction: 'incoming',
        atendente_discord: null,
        timestamp: solicitacao.createdAt,
        status: 'delivered',
        type: 'system',
      }
    ];

    return historicoBasico;
  } catch (error) {
    this.logger.error(`Erro ao buscar histórico: ${error.message}`);
    return [];
  }
  }
}