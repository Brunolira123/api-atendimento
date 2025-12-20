// src/modules/chat/chat.manager.ts
import { Injectable, Logger } from '@nestjs/common';

export interface AtendimentoPendente {
  solicitacaoId: string;
  atendenteNome: string;
  whatsappId?: string;
  portalUrl: string;
  timestamp: Date;
}

export interface AtendimentoAtivo {
  solicitacaoId: string;
  whatsappId: string;
  socketId: string;
  atendenteNome: string;
  vinculadoEm: Date;
}

@Injectable()
export class ChatManager {
  private readonly logger = new Logger(ChatManager.name);
  
  // Mapa de atendimentos pendentes (Discord → Aguardando Frontend)
  private atendimentosPendentes = new Map<string, AtendimentoPendente>();
  
  // Mapa de atendimentos ativos (whatsappId → socketId)
  private atendimentosAtivos = new Map<string, AtendimentoAtivo>();
  
  // Mapa inverso (socketId → whatsappId)
  private socketParaWhatsapp = new Map<string, string>();

  // ========== MÉTODOS DE ATENDIMENTOS PENDENTES ==========
  
  salvarAtendimentoPendente(dados: AtendimentoPendente): void {
    this.atendimentosPendentes.set(dados.solicitacaoId, dados);
    this.logger.log(`📝 Atendimento pendente salvo: ${dados.solicitacaoId} - ${dados.atendenteNome}`);
  }

  getAtendimentoPendente(solicitacaoId: string): AtendimentoPendente | undefined {
    return this.atendimentosPendentes.get(solicitacaoId);
  }

  removerAtendimentoPendente(solicitacaoId: string): boolean {
    const removido = this.atendimentosPendentes.delete(solicitacaoId);
    if (removido) {
      this.logger.log(`📝 Atendimento pendente removido: ${solicitacaoId}`);
    }
    return removido;
  }

  // ========== MÉTODOS DE ATENDIMENTOS ATIVOS ==========
  
  vincularAtendimento(
    solicitacaoId: string, 
    whatsappId: string, 
    socketId: string, 
    atendenteNome: string
  ): void {
    const atendimento: AtendimentoAtivo = {
      solicitacaoId,
      whatsappId,
      socketId,
      atendenteNome,
      vinculadoEm: new Date(),
    };
    
    this.atendimentosAtivos.set(whatsappId, atendimento);
    this.socketParaWhatsapp.set(socketId, whatsappId);
    
    // Remove dos pendentes se existir
    this.removerAtendimentoPendente(solicitacaoId);
    
    this.logger.log(`🔗 Atendimento vinculado: ${whatsappId} → socket ${socketId}`);
  }

  getSocketPorWhatsapp(whatsappId: string): string | undefined {
    return this.atendimentosAtivos.get(whatsappId)?.socketId;
  }

  getWhatsappPorSocket(socketId: string): string | undefined {
    return this.socketParaWhatsapp.get(socketId);
  }

  getAtendimentoPorWhatsapp(whatsappId: string): AtendimentoAtivo | undefined {
    return this.atendimentosAtivos.get(whatsappId);
  }

  getAtendimentoPorSocket(socketId: string): AtendimentoAtivo | undefined {
    const whatsappId = this.socketParaWhatsapp.get(socketId);
    return whatsappId ? this.atendimentosAtivos.get(whatsappId) : undefined;
  }

  desvincularAtendimentoPorSocket(socketId: string): boolean {
    const whatsappId = this.socketParaWhatsapp.get(socketId);
    
    if (whatsappId) {
      this.atendimentosAtivos.delete(whatsappId);
      this.socketParaWhatsapp.delete(socketId);
      this.logger.log(`🔗 Atendimento desvinculado: socket ${socketId}`);
      return true;
    }
    
    return false;
  }

  desvincularAtendimentoPorWhatsapp(whatsappId: string): boolean {
    const atendimento = this.atendimentosAtivos.get(whatsappId);
    
    if (atendimento) {
      this.atendimentosAtivos.delete(whatsappId);
      this.socketParaWhatsapp.delete(atendimento.socketId);
      this.logger.log(`🔗 Atendimento desvinculado: ${whatsappId}`);
      return true;
    }
    
    return false;
  }

  // ========== MÉTODOS DE BUSCA ==========
  
  buscarSocketPorSolicitacao(solicitacaoId: string): string | undefined {
    // Procura nos ativos
    for (const atendimento of this.atendimentosAtivos.values()) {
      if (atendimento.solicitacaoId === solicitacaoId) {
        return atendimento.socketId;
      }
    }
    
    // Procura nos pendentes
    const pendente = this.atendimentosPendentes.get(solicitacaoId);
    if (pendente) {
      this.logger.log(`⚠️ Solicitação ${solicitacaoId} está pendente (frontend não conectou)`);
    }
    
    return undefined;
  }

  // ========== MÉTODOS DE ESTATÍSTICAS ==========
  
  getEstatisticas() {
    return {
      pendentes: this.atendimentosPendentes.size,
      ativos: this.atendimentosAtivos.size,
      sockets: this.socketParaWhatsapp.size,
    };
  }

  // ========== MÉTODO PARA FRONTEND SE VINCULAR ==========
  
  vincularFrontend(
    socketId: string,
    solicitacaoId: string,
    atendenteNome: string,
    whatsappId: string
  ): { success: boolean; message: string } {
    try {
      // Verificar se já está vinculado
      const socketExistente = this.buscarSocketPorSolicitacao(solicitacaoId);
      
      if (socketExistente && socketExistente !== socketId) {
        return {
          success: false,
          message: `Solicitação já está sendo atendida por outro atendente`
        };
      }

      // Vincular
      this.vincularAtendimento(solicitacaoId, whatsappId, socketId, atendenteNome);
      
      return {
        success: true,
        message: 'Vinculado com sucesso'
      };
    } catch (error) {
      this.logger.error(`❌ Erro ao vincular frontend: ${error.message}`);
      return {
        success: false,
        message: `Erro: ${error.message}`
      };
    }
  }
}