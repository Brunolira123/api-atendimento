import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface AtendenteSession {
  nome: string;
  discordId?: string;
  socketId: string;
  connectedAt: Date;
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
        timestamp: new Date().toISOString(),
      });
    }
  }

  loginAtendente(client: Socket, data: { nome: string; discordId?: string }): AtendenteSession {
    const { nome, discordId } = data;

    if (!nome || nome.trim().length < 2) {
      throw new Error('Nome do atendente é obrigatório (mínimo 2 caracteres)');
    }

    const atendenteData: AtendenteSession = {
      nome,
      discordId,
      socketId: client.id,
      connectedAt: new Date(),
    };

    this.atendentes.set(client.id, atendenteData);
    client['atendenteNome'] = nome;
    client['discordId'] = discordId;

    this.logger.log(`👤 Atendente logado: ${nome}`);
    return atendenteData;
  }

  getAtendente(socketId: string): AtendenteSession | undefined {
    return this.atendentes.get(socketId);
  }

  getAtendenteNome(client: Socket): string {
    return client['atendenteNome'] || 'Atendente';
  }

  saveWhatsAppStatus(data: any) {
    this.whatsappStatus = data;
    this.logger.log(`💾 Status WhatsApp salvo: ${data.user} (${data.phoneNumber})`);
  }

  getStats(server: Server) {
    return {
      connectedClients: server.engine.clientsCount,
      atendentesAtivos: this.atendentes.size,
      atendentes: Array.from(this.atendentes.values()).map(a => ({
        nome: a.nome,
        discordId: a.discordId,
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
}