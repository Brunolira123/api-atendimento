// src/modules/websocket/services/websocket-manager.service.ts (completo atualizado)
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface AtendenteSession {
  nome: string;
  discordId?: string;
  socketId: string;
  connectedAt: Date;
  analistaId?: number; // 🔥 NOVO: ID do analista do sistema
}

@Injectable()
export class WebSocketManagerService {
  private readonly logger = new Logger(WebSocketManagerService.name);
  private atendentes = new Map<string, AtendenteSession>();
  private whatsappStatus: any = null;

  async handleConnection(client: Socket, server: Server) {
    this.logger.log(`🔌 Cliente conectado: ${client.id} às ${new Date().toLocaleTimeString()}`);
    
    // Saudação normal
    client.emit('connected', {
      message: 'Conectado ao Sistema VR Software',
      socketId: client.id,
      timestamp: new Date().toISOString(),
    });
    
    // ✅ SE TEM STATUS SALVO DO WHATSAPP, ENVIA
    if (this.whatsappStatus) {
      this.logger.log(`📤 Enviando status WhatsApp SALVO para ${client.id}`);
      
      setTimeout(() => {
        client.emit('whatsapp:connected', {
          ...this.whatsappStatus,
          timestamp: new Date().toISOString(),
          message: 'Status salvo enviado na conexão',
          source: 'saved_status'
        });
      }, 300);
    }
  }

  async handleDisconnect(client: Socket, server: Server) {
    this.logger.log(`🔌 Cliente desconectado: ${client.id}`);

    const atendente = this.atendentes.get(client.id);
    if (atendente) {
      this.atendentes.delete(client.id);
      server.emit('atendente:desconectado', {
        nome: atendente.nome,
        socketId: client.id,
        analistaId: atendente.analistaId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 🔥 NOVO: Método para login com analistaId
  loginAtendenteComAnalista(
    client: Socket, 
    data: { 
      nome: string; 
      discordId?: string; 
      analistaId: number 
    }
  ): AtendenteSession {
    const { nome, discordId, analistaId } = data;

    if (!nome || nome.trim().length < 2) {
      throw new Error('Nome do atendente é obrigatório (mínimo 2 caracteres)');
    }

    const atendenteData: AtendenteSession = {
      nome,
      discordId,
      analistaId, // 🔥 Inclui o analistaId
      socketId: client.id,
      connectedAt: new Date(),
    };

    this.atendentes.set(client.id, atendenteData);
    client['atendenteNome'] = nome;
    client['discordId'] = discordId;
    client['analistaId'] = analistaId; // 🔥 Também no socket

    this.logger.log(`👤 Atendente logado: ${nome} (Analista ID: ${analistaId})`);
    return atendenteData;
  }

  // 🔥 MANTÉM compatibilidade: método antigo (sem analistaId)
  loginAtendente(client: Socket, data: { nome: string; discordId?: string }): AtendenteSession {
    return this.loginAtendenteComAnalista(client, {
      ...data,
      analistaId: undefined, // Discord não tem analistaId ainda
    });
  }

  getAtendente(socketId: string): AtendenteSession | undefined {
    return this.atendentes.get(socketId);
  }

  getAtendenteNome(client: Socket): string {
    return client['atendenteNome'] || 'Atendente';
  }

  // 🔥 NOVO: Obter analistaId do socket
  getAnalistaId(client: Socket): number | undefined {
    return client['analistaId'] || this.atendentes.get(client.id)?.analistaId;
  }

  // 🔥 NOVO: Atualizar analistaId de um atendente
  atualizarAnalistaId(socketId: string, analistaId: number): boolean {
    const atendente = this.atendentes.get(socketId);
    if (atendente) {
      atendente.analistaId = analistaId;
      this.atendentes.set(socketId, atendente);
      
      // Atualizar também no socket
      const socket = this.getSocketById(socketId); // Você precisaria ter acesso aos sockets
      if (socket) {
        socket['analistaId'] = analistaId;
      }
      
      this.logger.log(`🆔 Analista ID ${analistaId} vinculado ao socket ${socketId}`);
      return true;
    }
    return false;
  }

  // 🔥 NOVO: Buscar socket por analistaId
  getSocketPorAnalistaId(analistaId: number): string | undefined {
    for (const [socketId, atendente] of this.atendentes.entries()) {
      if (atendente.analistaId === analistaId) {
        return socketId;
      }
    }
    return undefined;
  }

  // 🔥 NOVO: Buscar todos os analistas logados
  getAnalistasLogados(): Array<{ nome: string; analistaId?: number; socketId: string }> {
    return Array.from(this.atendentes.values()).map(a => ({
      nome: a.nome,
      analistaId: a.analistaId,
      socketId: a.socketId,
    }));
  }

  saveWhatsAppStatus(data: any) {
    this.whatsappStatus = data;
    this.logger.log(`💾 Status WhatsApp salvo: ${data.user} (${data.phoneNumber})`);
  }

  getStats(server: Server) {
    const atendentesArray = Array.from(this.atendentes.values());
    
    return {
      connectedClients: server.engine.clientsCount,
      atendentesAtivos: this.atendentes.size,
      analistasLogados: atendentesArray.filter(a => a.analistaId).length,
      atendentes: atendentesArray.map(a => ({
        nome: a.nome,
        discordId: a.discordId,
        analistaId: a.analistaId,
        connectedAt: a.connectedAt,
        socketId: a.socketId,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  emitStats(server: Server) {
    server.emit('stats:update', {
      type: 'stats_update',
      stats: this.getStats(server),
      timestamp: new Date().toISOString(),
    });
  }


  private getSocketById(socketId: string): Socket | undefined {
    // Este método depende de como você tem acesso aos sockets
    // Normalmente você teria acesso ao server.sockets.sockets
    // Se não tiver, podemos criar uma solução alternativa
    return undefined;
  }
}