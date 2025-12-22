import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, ILike } from 'typeorm';
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
  atendente_id: number | null; // 🔥 NOVO
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

  // 🔥 NOVO MÉTODO: Buscar solicitações disponíveis
  async getSolicitacoesDisponiveis(): Promise<Solicitacao[]> {
    try {
      return await this.solicitacaoRepository.find({
        where: { 
          status: 'pendente',
          atendente_id: null, // Só as que não têm analista
        },
        order: { createdAt: 'DESC' },
        take: 50, // Limitar para performance
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar disponíveis: ${error.message}`);
      return [];
    }
  }

  // 🔥 NOVO MÉTODO: Assumir com ID do analista
  async assumirSolicitacao(
    solicitacaoId: string, 
    atendenteNome: string, 
    analistaId: number
  ): Promise<Solicitacao> {
    try {
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });

      if (!solicitacao) {
        throw new Error(`Solicitação ${solicitacaoId} não encontrada`);
      }

      if (solicitacao.atendente_id) {
        throw new Error(`Solicitação já está sendo atendida por ID: ${solicitacao.atendente_id}`);
      }

      // Atualizar com dados do analista
      solicitacao.atendenteDiscord = atendenteNome;
      solicitacao.atendente_id = analistaId; // 🔥 Campo novo
      solicitacao.status = 'em_atendimento';
      
      const updated = await this.solicitacaoRepository.save(solicitacao);
      
      this.logger.log(`✅ ${atendenteNome} (ID: ${analistaId}) assumiu ${solicitacaoId}`);
      
      return updated;
    } catch (error) {
      this.logger.error(`❌ Erro ao assumir: ${error.message}`);
      throw error;
    }
  }

  // 🔥 NOVO MÉTODO: Buscar por ID do analista
  async getSolicitacoesPorAnalista(analistaId: number): Promise<Solicitacao[]> {
    try {
      return await this.solicitacaoRepository.find({
        where: { 
          atendente_id: analistaId,
          status: 'em_atendimento',
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar por analista ${analistaId}: ${error.message}`);
      return [];
    }
  }

  // 🔥 NOVO MÉTODO: Transferir para outro analista
  async transferirSolicitacao(
    solicitacaoId: string, 
    novoAnalistaId: number,
    novoAnalistaNome: string
  ): Promise<Solicitacao> {
    try {
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });

      if (!solicitacao) {
        throw new Error(`Solicitação ${solicitacaoId} não encontrada`);
      }

      solicitacao.atendente_id = novoAnalistaId;
      solicitacao.atendenteDiscord = novoAnalistaNome;
      
      const updated = await this.solicitacaoRepository.save(solicitacao);
      
      this.logger.log(`🔄 Solicitação ${solicitacaoId} transferida para ${novoAnalistaNome} (ID: ${novoAnalistaId})`);
      
      return updated;
    } catch (error) {
      this.logger.error(`❌ Erro ao transferir: ${error.message}`);
      throw error;
    }
  }

  // 🔥 NOVO MÉTODO: Verificar transferência (para permissões)
  async getTransferencia(solicitacaoId: string, analistaId: number): Promise<boolean> {
    try {
      // Aqui você pode implementar lógica para verificar
      // se houve transferência explícita para este analista
      // Por enquanto, retorna false
      return false;
    } catch {
      return false;
    }
  }

  // 🔥 ATUALIZAR o mapeamento para incluir atendente_id
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
      atendente_id: solicitacao.atendente_id || null, // 🔥 NOVO
      created_at: solicitacao.createdAt,
      razao_social: solicitacao.razaoSocial,
      cnpj: solicitacao.cnpj,
      tipo_problema: solicitacao.tipoProblema,
      descricao: solicitacao.descricao,
      finalizado_em: solicitacao.finalizadoEm,
    };
  }

  // 🔥 Métodos auxiliares para prioridade
  calcularTempoEspera(createdAt: Date): string {
    const diff = Date.now() - new Date(createdAt).getTime();
    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (horas > 0) return `${horas}h ${minutos}m`;
    return `${minutos}m`;
  }

  calcularPrioridade(tipoProblema: string, createdAt: Date): 'alta' | 'normal' | 'baixa' {
    const tempoEspera = Date.now() - new Date(createdAt).getTime();
    const horasEspera = tempoEspera / (1000 * 60 * 60);
    
    if (tipoProblema === 'PDV Parado') return 'alta';
    if (horasEspera > 1) return 'alta';
    if (tipoProblema === 'Promoção / Oferta') return 'normal';
    
    return 'baixa';
  }

  // 🔥 MÉTODO EXISTENTE: Atualizar para suportar ID do analista
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

  // 🔥 MÉTODO EXISTENTE: Manter compatibilidade
  async assumirSolicitacaoDiscord(solicitacaoId: string, atendenteNome: string): Promise<Solicitacao> {
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

  // 🔥 Métodos existentes (mantidos para compatibilidade)
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
      atendente_id: null, // 🔥 NOVO
      createdAt: new Date(),
      finalizadoEm: null,
    });

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