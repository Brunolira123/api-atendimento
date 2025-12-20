// src/conversations/conversations.service.ts - VERSÃO CORRIGIDA
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, ILike } from 'typeorm';
import { Solicitacao } from '../../shared/entities/solicitacao.entity';
import { Message } from '../../shared/entities/message.entity';
import { Conversation } from '../../shared/entities/conversation.entity';

export interface ConversationFilters {
  status?: string;
  atendente?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(Solicitacao)
    private solicitacaoRepository: Repository<Solicitacao>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
  ) {}

    async getMessagesBySolicitacaoId(
    solicitacaoId: string, 
    limit: number = 50
  ): Promise<any[]> {
    try {
      // Buscar a solicitação
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });

      if (!solicitacao) {
        return [];
      }

      // Se você tem mensagens separadas, busque aqui
      // Por enquanto, retornar apenas a descrição inicial
      return [
        {
          id: `init_${solicitacaoId}`,
          solicitacaoId,
          content: solicitacao.descricao,
          direction: 'incoming',
          atendente_discord: null,
          timestamp: solicitacao.createdAt,
          status: 'delivered',
          type: 'initial',
        }
      ];
    } catch (error) {
      this.logger.error(`Erro ao buscar mensagens: ${error.message}`);
      return [];
    }
  }


  // ========== MÉTODOS DE BUSCA ==========

  async findAll(filters?: ConversationFilters): Promise<any[]> {
    try {
      const where: any = {};

      // Aplicar filtros
      if (filters?.status) {
        where.status = this.mapStatusToDb(filters.status);
      }

      if (filters?.atendente) {
        where.atendenteDiscord = ILike(`%${filters.atendente}%`);
      }

      if (filters?.search) {
        where.razaoSocial = ILike(`%${filters.search}%`);
      }

      if (filters?.startDate && filters?.endDate) {
        where.createdAt = Between(filters.startDate, filters.endDate);
      }

      const solicitacoes = await this.solicitacaoRepository.find({
        where,
        order: { createdAt: 'DESC' },
      });

      return solicitacoes.map(solicitacao => this.mapToConversation(solicitacao));
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar conversas: ${error.message}`);
      throw error;
    }
  }

  async findPending(): Promise<any[]> {
    try {
      const solicitacoes = await this.solicitacaoRepository.find({
        where: { status: 'pendente' },
        order: { createdAt: 'DESC' },
      });

      return solicitacoes.map(solicitacao => this.mapToConversation(solicitacao));
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar conversas pendentes: ${error.message}`);
      throw error;
    }
  }

  async findActive(): Promise<any[]> {
    try {
      const solicitacoes = await this.solicitacaoRepository.find({
        where: { status: 'em_atendimento' },
        order: { createdAt: 'DESC' },
      });

      return solicitacoes.map(solicitacao => this.mapToConversation(solicitacao));
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar conversas ativas: ${error.message}`);
      throw error;
    }
  }

  async findById(id: string): Promise<any | null> {
    try {
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId: id },
      });

      if (!solicitacao) {
        return null;
      }

      return this.mapToConversation(solicitacao);
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar conversa ${id}: ${error.message}`);
      throw error;
    }
  }

  async findByWhatsapp(whatsapp: string): Promise<any[]> {
    try {
      const solicitacoes = await this.solicitacaoRepository.find({
        where: { whatsappId: ILike(`%${whatsapp}%`) },
        order: { createdAt: 'DESC' },
      });

      return solicitacoes.map(solicitacao => this.mapToConversation(solicitacao));
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar por WhatsApp ${whatsapp}: ${error.message}`);
      throw error;
    }
  }

  // ========== MÉTODOS DE MENSAGENS ==========

  async findMessages(solicitacaoId: string): Promise<any[]> {
    try {
      // Primeiro, verificar se a solicitação existe
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });

      if (!solicitacao) {
        return [];
      }

      // Buscar a conversation relacionada pelo whatsappId (alternativa)
      const conversation = await this.conversationRepository
        .createQueryBuilder('conversation')
        .where('conversation.whatsapp_id = :whatsappId', { 
          whatsappId: solicitacao.whatsappId 
        })
        .orderBy('conversation.created_at', 'DESC')
        .getOne();

      let conversationId = null;
      if (conversation) {
        conversationId = conversation.id;
      } else {
        // Se não existir conversation, criar uma
        // ⚠️ NÃO use solicitacaoId, use outros campos
        const newConversation = this.conversationRepository.create({
          whatsappId: solicitacao.whatsappId,
          customerName: solicitacao.nomeResponsavel,
          status: solicitacao.status,
          atendenteDiscord: solicitacao.atendenteDiscord,
          razaoSocial: solicitacao.razaoSocial,
          cnpj: solicitacao.cnpj,
          // Adicione um campo personalizado se precisar
        });
        
        // Adicionar campo extra usando query builder
        newConversation['solicitacaoId'] = solicitacao.solicitacaoId; // ⬅️ Campo extra
        
        const savedConversation = await this.conversationRepository.save(newConversation);
        conversationId = savedConversation.id;
      }

      // Buscar mensagens do banco
      const messages = await this.messageRepository.find({
        where: { conversationId },
        relations: ['conversation'],
        order: { createdAt: 'ASC' },
      });

      // Se não houver mensagens, criar uma baseada na descrição
      if (messages.length === 0 && solicitacao.descricao) {
        return this.createDefaultMessages(conversationId, solicitacao);
      }

      return messages.map(message => this.mapToMessage(message, solicitacao.solicitacaoId));
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar mensagens de ${solicitacaoId}: ${error.message}`);
      throw error;
    }
  }

  async addMessage(solicitacaoId: string, messageData: Partial<Message>): Promise<any> {
    try {
      // Verificar se a solicitação existe
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });

      if (!solicitacao) {
        throw new Error(`Solicitação ${solicitacaoId} não encontrada`);
      }

      // Buscar ou criar conversation pelo whatsappId
      let conversation = await this.conversationRepository
        .createQueryBuilder('conversation')
        .where('conversation.whatsapp_id = :whatsappId', { 
          whatsappId: solicitacao.whatsappId 
        })
        .orderBy('conversation.created_at', 'DESC')
        .getOne();

      if (!conversation) {
        conversation = this.conversationRepository.create({
          whatsappId: solicitacao.whatsappId,
          customerName: solicitacao.nomeResponsavel,
          status: solicitacao.status,
          atendenteDiscord: solicitacao.atendenteDiscord,
          razaoSocial: solicitacao.razaoSocial,
          cnpj: solicitacao.cnpj,
        });
        
        // Adicionar campo extra
        conversation['solicitacaoId'] = solicitacaoId;
        
        conversation = await this.conversationRepository.save(conversation);
      }

      // Criar a mensagem
      const message = this.messageRepository.create({
        ...messageData,
        conversationId: conversation.id,
        conversation,
      });

      const savedMessage = await this.messageRepository.save(message);
      
      // Atualizar status se necessário
      if (messageData.direction === 'outgoing' && solicitacao.status === 'pendente') {
        await this.solicitacaoRepository.update(solicitacao.solicitacaoId, {
          status: 'em_atendimento',
          atendenteDiscord: messageData.atendenteDiscord,
        });

        // Atualizar também a conversation
        await this.conversationRepository.update(conversation.id, {
          status: 'em_atendimento',
          atendenteDiscord: messageData.atendenteDiscord,
        });
      }

      return this.mapToMessage(savedMessage, solicitacao.solicitacaoId);
    } catch (error) {
      this.logger.error(`❌ Erro ao adicionar mensagem: ${error.message}`);
      throw error;
    }
  }

  // ========== MÉTODOS AUXILIARES ==========

  private createDefaultMessages(conversationId: string, solicitacao: Solicitacao): any[] {
    const defaultMessages = [
      {
        id: 'initial-msg',
        conversationId,
        content: solicitacao.descricao,
        direction: 'incoming' as const,
        atendente_discord: null,
        timestamp: solicitacao.createdAt,
        delivered: true,
        read: true,
      },
      {
        id: 'welcome-msg',
        conversationId,
        content: '👋 Olá! Eu sou o atendente da VR Software. Como posso ajudá-lo hoje?',
        direction: 'outgoing' as const,
        atendente_discord: solicitacao.atendenteDiscord || 'Sistema',
        timestamp: new Date(solicitacao.createdAt.getTime() + 1000),
        delivered: true,
        read: false,
      },
    ];

    return defaultMessages;
  }

  private mapToConversation(solicitacao: Solicitacao): any {
    const statusMap: Record<string, string> = {
      'pendente': 'pending',
      'em_atendimento': 'active',
      'resolvida': 'closed',
      'finalizada': 'closed',
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
      assumido_em: solicitacao.createdAt,
    };
  }

  private mapToMessage(message: Message, solicitacaoId?: string): any {
    return {
      id: message.id,
      conversationId: message.conversationId,
      solicitacaoId: solicitacaoId || null, // Usar o solicitacaoId fornecido
      content: message.content,
      direction: message.direction,
      atendente_discord: message.atendenteDiscord,
      timestamp: message.createdAt,
      delivered: true,
      read: message.direction === 'outgoing' ? false : true,
    };
  }

  private mapStatusToDb(status: string): string {
    const map: Record<string, string> = {
      'pending': 'pendente',
      'active': 'em_atendimento',
      'closed': 'resolvida',
    };
    return map[status] || 'pendente';
  }

  // ========== MÉTODOS SIMPLIFICADOS (sem solicitacaoId) ==========

  async findConversationByWhatsapp(whatsappId: string): Promise<Conversation | null> {
    try {
      const conversation = await this.conversationRepository
        .createQueryBuilder('conversation')
        .where('conversation.whatsapp_id = :whatsappId', { whatsappId })
        .orderBy('conversation.created_at', 'DESC')
        .getOne();

      return conversation;
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar conversation: ${error.message}`);
      return null;
    }
  }

  async updateStatus(solicitacaoId: string, status: string, atendente?: string): Promise<boolean> {
    try {
      // Buscar a solicitação primeiro
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });

      if (!solicitacao) {
        return false;
      }

      const updateData: any = { status: this.mapStatusToDb(status) };
      
      if (atendente) {
        updateData.atendenteDiscord = atendente;
      }

      if (status === 'closed') {
        updateData.finalizadoEm = new Date();
      }

      // Atualizar a solicitação
      const result = await this.solicitacaoRepository.update(
        { solicitacaoId },
        updateData,
      );

      // Atualizar também a conversation relacionada (pelo whatsapp)
      const conversation = await this.findConversationByWhatsapp(solicitacao.whatsappId);
      if (conversation) {
        await this.conversationRepository.update(conversation.id, updateData);
      }

      return result.affected > 0;
    } catch (error) {
      this.logger.error(`❌ Erro ao atualizar status: ${error.message}`);
      throw error;
    }
  }

  async assignToAtendente(solicitacaoId: string, atendente: string): Promise<boolean> {
    try {
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId },
      });

      if (!solicitacao) {
        return false;
      }

      const result = await this.solicitacaoRepository.update(
        { solicitacaoId },
        {
          atendenteDiscord: atendente,
          status: 'em_atendimento',
        },
      );

      // Atualizar também a conversation
      const conversation = await this.findConversationByWhatsapp(solicitacao.whatsappId);
      if (conversation) {
        await this.conversationRepository.update(conversation.id, {
          atendenteDiscord: atendente,
          status: 'em_atendimento',
        });
      }

      return result.affected > 0;
    } catch (error) {
      this.logger.error(`❌ Erro ao atribuir atendente: ${error.message}`);
      throw error;
    }
  }

  async getStatsSummary(): Promise<any> {
    try {
      // Contar solicitações por status
      const [total, pending, active, resolved] = await Promise.all([
        this.solicitacaoRepository.count(),
        this.solicitacaoRepository.count({ where: { status: 'pendente' } }),
        this.solicitacaoRepository.count({ where: { status: 'em_atendimento' } }),
        this.solicitacaoRepository.count({ where: { status: 'resolvida' } }),
      ]);

      // Atendentes ativos (com conversas em andamento)
      const atendentesAtivos = await this.solicitacaoRepository
        .createQueryBuilder('s')
        .select('s.atendenteDiscord', 'atendente')
        .addSelect('COUNT(s.solicitacao_id)', 'count')
        .where('s.atendenteDiscord IS NOT NULL')
        .andWhere('s.status = :status', { status: 'em_atendimento' })
        .groupBy('s.atendenteDiscord')
        .orderBy('count', 'DESC')
        .getRawMany();

      // Últimas 24 horas
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent24h = await this.solicitacaoRepository.count({
        where: { createdAt: Between(last24Hours, new Date()) },
      });

      // Total de mensagens
      const totalMessages = await this.messageRepository.count();

      // Solicitações dos últimos 7 dias
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const solicitacoesPorDia = await this.solicitacaoRepository
        .createQueryBuilder('s')
        .select("DATE_TRUNC('day', s.created_at)", 'day')
        .addSelect('COUNT(s.solicitacao_id)', 'count')
        .where('s.created_at >= :last7Days', { last7Days })
        .groupBy("DATE_TRUNC('day', s.created_at)")
        .orderBy('day', 'ASC') // Ordenar do mais antigo para o mais recente
        .getRawMany();

      // Problemas mais comuns
      const problemasComuns = await this.solicitacaoRepository
        .createQueryBuilder('s')
        .select('s.tipoProblema', 'tipo')
        .addSelect('COUNT(s.solicitacao_id)', 'count')
        .where('s.tipoProblema IS NOT NULL')
        .groupBy('s.tipoProblema')
        .orderBy('count', 'DESC')
        .limit(5)
        .getRawMany();

      // Tempo médio de resolução (apenas para resolvidas)
      const tempoResolucao = await this.solicitacaoRepository
        .createQueryBuilder('s')
        .select('AVG(EXTRACT(EPOCH FROM (s.finalizado_em - s.created_at))/3600)', 'avg_hours')
        .where('s.finalizado_em IS NOT NULL')
        .andWhere('s.status = :status', { status: 'resolvida' })
        .getRawOne();

      return {
        // Resumo
        total,
        pending,
        active,
        resolved,
        
        // Atividade recente
        recent24h,
        totalMessages,
        
        // Atendentes
        atendentesAtivos: atendentesAtivos.map(a => ({
          atendente: a.atendente,
          count: parseInt(a.count) || 0,
        })),
        
        // Histórico
        solicitacoesPorDia: solicitacoesPorDia.map(item => ({
          day: item.day,
          count: parseInt(item.count) || 0,
        })),
        
        // Análise
        problemasComuns: problemasComuns.map(p => ({
          tipo: p.tipo,
          count: parseInt(p.count) || 0,
        })),
        
        // Métricas
        tempoMedioResolucaoHoras: parseFloat(tempoResolucao?.avg_hours || 0).toFixed(2),
        taxaResolucao: total > 0 ? ((resolved / total) * 100).toFixed(2) + '%' : '0%',
        
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar estatísticas: ${error.message}`);
      
      // Retornar estatísticas básicas mesmo com erro
      return {
        total: 0,
        pending: 0,
        active: 0,
        resolved: 0,
        recent24h: 0,
        totalMessages: 0,
        atendentesAtivos: [],
        solicitacoesPorDia: [],
        problemasComuns: [],
        tempoMedioResolucaoHoras: '0',
        taxaResolucao: '0%',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}