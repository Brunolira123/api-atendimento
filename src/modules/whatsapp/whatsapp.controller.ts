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
}