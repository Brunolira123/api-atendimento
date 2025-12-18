import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class WhatsAppEventsService {
  private readonly logger = new Logger(WhatsAppEventsService.name);

  emitQRCode(server: Server, qrCode: string) {
    server.emit('whatsapp:qr', {
      qrCode,
      timestamp: new Date().toISOString(),
    });
  }

  emitWhatsAppReady(server: Server, info: any) {
    server.emit('whatsapp:ready', {
      info,
      timestamp: new Date().toISOString(),
    });
  }

  emitWhatsAppConnected(server: Server, user: any) {
    server.emit('whatsapp:connected', {
      user,
      timestamp: new Date().toISOString(),
    });
  }

  emitNovaSolicitacao(server: Server, solicitacao: any) {
    server.emit('solicitacao:nova', {
      type: 'nova_solicitacao',
      data: solicitacao,
      timestamp: new Date().toISOString(),
    });
  }

  emitMessageSent(server: Server, data: any) {
    server.emit('message:sent', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  emitNovaMensagem(server: Server, data: any) {
    server.emit('message:new', {
      type: 'nova_mensagem',
      data,
      timestamp: new Date().toISOString(),
    });
  }

  emitStatusUpdate(server: Server, data: any) {
    server.emit('status:update', {
      type: 'status_update',
      data,
      timestamp: new Date().toISOString(),
    });
  }

  // Para compatibilidade com código existente
  saveWhatsAppStatusToManager(manager: any, data: any) {
    if (manager.saveWhatsAppStatus) {
      manager.saveWhatsAppStatus(data);
    }
  }
}