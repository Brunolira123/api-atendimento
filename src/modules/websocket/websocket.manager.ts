import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AtendenteSession } from '../../shared/interfaces/websocket.interface';

@Injectable()
export class WebSocketManagerService {
  private readonly logger = new Logger(WebSocketManagerService.name);
  private atendentes = new Map<string, AtendenteSession>();
  private whatsappStatus: any = null;

  async handleConnection(client: Socket, server: Server) {
    const clientId = client.id;
    this.logger.log(`🔌 Cliente conectado: ${clientId} às ${new Date().toLocaleTimeString()}`);
    
    // Saudação normal
    client.emit('connected', {
      message: 'Conectado ao Sistema VR Software',
      socketId: clientId,
      timestamp: new Date().toISOString(),
    });
    
    // ✅ SE TEM STATUS SALVO DO WHATSAPP, ENVIA
    if (this.whatsappStatus) {
      this.logger.log(`📤 Enviando status WhatsApp SALVO para ${clientId}`);
      
      setTimeout(() => {
        client.emit('whatsapp:connected', {
          ...this.whatsappStatus,
          timestamp: new Date().toISOString(),
          message: 'Status salvo enviado na conexão',
          source: 'saved_status'
        });
      }, 300);
    }
    
    // Também verifica o WhatsAppService atual
    const whatsappService = this['whatsAppService'];
    if (whatsappService?.isConnected && !this.whatsappStatus) {
      this.logger.log(`📤 Enviando status WhatsApp ATUAL para ${clientId}`);
      
      setTimeout(() => {
        const data = {
          user: whatsappService.client?.info?.pushname || 'Usuário WhatsApp',
          phoneNumber: whatsappService.client?.info?.wid?.user || 'Desconhecido',
          status: 'connected',
          timestamp: new Date().toISOString(),
          message: 'Status atual enviado na conexão',
          source: 'current_status'
        };
        
        client.emit('whatsapp:connected', data);
        this.logger.log(`✅ Status enviado para ${clientId}`);
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

    client['atendenteNome'] = nome;
    client['discordId'] = discordId;

    const atendenteData: AtendenteSession = {
      nome,
      discordId,
      socketId: client.id,
      connectedAt: new Date(),
    };

    this.atendentes.set(client.id, atendenteData);
    return atendenteData;
  }

  getAtendenteNome(client: Socket): string {
    return client['atendenteNome'] || 'Atendente';
  }

  getAtendente(socketId: string): AtendenteSession | undefined {
    return this.atendentes.get(socketId);
  }

  getAtendentes(): Map<string, AtendenteSession> {
    return this.atendentes;
  }

  getAtendentesArray(): AtendenteSession[] {
    return Array.from(this.atendentes.values());
  }

  saveWhatsAppStatus(data: any) {
    this.whatsappStatus = data;
    this.logger.log(`💾 Status WhatsApp salvo: ${data.user} (${data.phoneNumber})`);
  }

  getWhatsAppStatus() {
    return this.whatsappStatus;
  }

  getStats(server: Server) {
    return {
      connectedClients: server.engine.clientsCount,
      atendentesAtivos: this.atendentes.size,
      atendentes: this.getAtendentesArray().map(a => ({
        nome: a.nome,
        discordId: a.discordId,
        connectedAt: a.connectedAt,
        socketId: a.socketId,
      })),
      whatsappStatus: this.whatsappStatus ? {
        user: this.whatsappStatus.user,
        phoneNumber: this.whatsappStatus.phoneNumber,
        status: this.whatsappStatus.status,
      } : null,
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

  // Método para remover atendente (útil para logout)
  logoutAtendente(socketId: string, server: Server): boolean {
    const atendente = this.atendentes.get(socketId);
    if (atendente) {
      this.atendentes.delete(socketId);
      server.emit('atendente:desconectado', {
        nome: atendente.nome,
        socketId,
        timestamp: new Date().toISOString(),
        reason: 'logout'
      });
      this.logger.log(`👤 Atendente deslogado: ${atendente.nome}`);
      return true;
    }
    return false;
  }

  // Método para buscar atendente por nome
  findAtendenteByNome(nome: string): AtendenteSession | undefined {
    return this.getAtendentesArray().find(a => a.nome === nome);
  }

  // Método para buscar atendente por Discord ID
  findAtendenteByDiscordId(discordId: string): AtendenteSession | undefined {
    return this.getAtendentesArray().find(a => a.discordId === discordId);
  }

  // Método para verificar se atendente já está logado
  isAtendenteLogged(nome: string): boolean {
    return this.getAtendentesArray().some(a => a.nome === nome);
  }

  // Método para limpar todos os atendentes (útil para testes)
  clearAtendentes(server: Server) {
    const atendentesCount = this.atendentes.size;
    this.atendentes.clear();
    this.logger.log(`🧹 ${atendentesCount} atendentes removidos`);
    
    server.emit('atendentes:cleared', {
      message: 'Todos os atendentes foram removidos',
      count: atendentesCount,
      timestamp: new Date().toISOString(),
    });
  }

  // Método para ping/pong
  async handlePing(client: Socket) {
    const atendente = this.getAtendente(client.id);
    if (atendente) {
      // Atualizar último ping
      atendente.lastPing = new Date();
    }
    
    client.emit('pong', {
      timestamp: new Date().toISOString(),
      atendente: atendente?.nome,
    });
  }
}