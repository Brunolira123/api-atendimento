// src/modules/whatsapp/controllers/whatsapp.controller.ts
import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp/services/whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getStatus() {
    return await this.whatsappService.getStatus();
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() data: { to: string; message: string }) {
    const result = await this.whatsappService.enviarMensagem(data.to, data.message);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        message: 'Falha ao enviar mensagem'
      };
    }
    
    return {
      success: true,
      message: 'Mensagem enviada com sucesso'
    };
  }

  @Post('restart')
  @HttpCode(HttpStatus.ACCEPTED)
  async restart() {
    // Inicia o restart em background
    this.whatsappService.restart().catch(error => {
      console.error('❌ Erro ao reiniciar WhatsApp:', error);
    });
    
    return { 
      success: true, 
      message: 'WhatsApp está reiniciando...',
      timestamp: new Date().toISOString()
    };
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  async getSessions() {
    return {
      sessions: this.whatsappService.getSessoesAtivas(),
      count: this.whatsappService.getSessoesAtivas().length,
      timestamp: new Date().toISOString()
    };
  }

  @Post('sessions/clear')
  @HttpCode(HttpStatus.OK)
  async clearSessions() {
    const result = await this.whatsappService.limparSessoes();
    return {
      success: result.success,
      message: `Sessões limpas: ${result.count} removidas`,
      count: result.count,
      timestamp: new Date().toISOString()
    };
  }

  @Post('send/atendente')
  @HttpCode(HttpStatus.OK)
  async sendMessageAtendente(
    @Body() data: { 
      to: string; 
      message: string; 
      atendenteNome: string 
    }
  ) {
    const result = await this.whatsappService.enviarMensagemAtendente(
      data.to, 
      data.message, 
      data.atendenteNome
    );
    
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        message: 'Falha ao enviar mensagem do atendente'
      };
    }
    
    return {
      success: true,
      message: 'Mensagem do atendente enviada com sucesso'
    };
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck() {
    const status = await this.whatsappService.getStatus();
    
    return {
      status: 'operational',
      whatsapp: {
        connected: status.isConnected,
        hasQr: status.hasQr,
        user: status.whatsappInfo?.pushname || null,
        phone: status.whatsappInfo?.wid?.user || null
      },
      sessions: {
        active: status.sessoesAtivas,
        total: this.whatsappService.getSessoesAtivas().length
      },
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}