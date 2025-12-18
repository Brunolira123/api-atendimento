import { Controller, Get, Post, Body } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('status')
  async getStatus() {
    return this.whatsappService.getStatus();
  }

  @Post('send')
  async sendMessage(@Body() data: { to: string; message: string }) {
    return this.whatsappService.enviarMensagem(data.to, data.message);
  }

  @Post('restart')
  async restart() {
    await this.whatsappService.restart();
    return { message: 'WhatsApp reiniciando...' };
  }

  @Get('qr')
  getQR() {
    return { message: 'QR Code será exibido no terminal e enviado via WebSocket' };
  }

  @Get('test-ws')
async testWebSocket() {
  console.log('🧪 Testando conexão WebSocket...');
  
  // Verificar se wsGateway está disponível
  const hasGateway = !!this.whatsappService['wsGateway'];
  const hasServer = hasGateway && !!this.whatsappService['wsGateway'].server;
  
  if (hasServer) {
    // Emitir evento de teste
    this.whatsappService['wsGateway'].server.emit('test:event', {
      message: 'Teste do WebSocket',
      timestamp: new Date().toISOString(),
    });
    
    return {
      success: true,
      message: 'Evento de teste emitido',
      hasGateway,
      hasServer,
      clientCount: this.whatsappService['wsGateway'].server.engine.clientsCount,
    };
  } else {
    return {
      success: false,
      message: 'WebSocket não disponível',
      hasGateway,
      hasServer,
    };
  }
}
}