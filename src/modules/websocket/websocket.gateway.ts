import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  },
  namespace: 'atendimento',
})
export class WebSocketGatewayService
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGatewayService.name);
  private atendentes = new Map<string, any>();

  handleConnection(client: Socket) {
    this.logger.log(`🔌 Cliente conectado: ${client.id}`);

    client.emit('connected', {
      message: 'Conectado ao Sistema VR Software',
      socketId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Cliente desconectado: ${client.id}`);

    const atendente = this.atendentes.get(client.id);
    if (atendente) {
      this.atendentes.delete(client.id);
      this.server.emit('atendente:desconectado', {
        nome: atendente.nome,
        socketId: client.id,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('atendente:login')
  handleLogin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { nome: string; discordId?: string },
  ) {
    const { nome, discordId } = data;

    client['atendenteNome'] = nome;
    client['discordId'] = discordId;

    this.atendentes.set(client.id, {
      nome,
      discordId,
      socketId: client.id,
      connectedAt: new Date(),
    });

    client.emit('atendente:logged', {
      success: true,
      nome,
      socketId: client.id,
      message: 'Login realizado com sucesso',
    });

    this.server.emit('atendente:novo', {
      id: client.id,
      nome,
      discordId,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`👤 Atendente logado: ${nome}`);
  }

  @SubscribeMessage('solicitacao:assumir')
  handleAssumirSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { solicitacaoId: string },
  ) {
    const { solicitacaoId } = data;
    const atendenteNome = client['atendenteNome'] || 'Atendente';

    this.server.emit('solicitacao:assumida', {
      type: 'atendimento_assumido',
      solicitacaoId,
      atendente: atendenteNome,
      atendenteSocketId: client.id,
      timestamp: new Date().toISOString(),
    });

    client.emit('solicitacao:assumida:success', {
      solicitacaoId,
      message: 'Solicitação assumida com sucesso',
    });

    this.logger.log(`✅ ${atendenteNome} assumiu ${solicitacaoId}`);
  }

  @SubscribeMessage('mensagem:enviar')
  async handleEnviarMensagem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { whatsappId: string; mensagem: string },
  ) {
    const { whatsappId, mensagem } = data;
    const atendente = client['atendenteNome'] || 'Atendente';

    client.emit('message:sent', {
      success: true,
      message: 'Mensagem enviada para processamento',
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`📤 ${atendente} enviando para ${whatsappId}: ${mensagem.substring(0, 50)}...`);
  }

  // ========== MÉTODOS DE EMISSÃO ==========

  emitQRCode(qrCode: string) {
    this.server.emit('whatsapp:qr', qrCode);
  }

  emitWhatsAppReady(info: any) {
    this.server.emit('whatsapp:ready', info);
  }

  emitNovaSolicitacao(solicitacao: any) {
    this.server.emit('solicitacao:nova', {
      type: 'nova_solicitacao',
      timestamp: new Date().toISOString(),
      data: solicitacao,
    });
  }

  emitMessageSent(data: any) {
    this.server.emit('message:sent', data);
  }

  emitAtendimentoFinalizado(data: any) {
    this.server.emit('atendimento:finalizado', data);
  }

  // Método para obter estatísticas
  getStats() {
    return {
      connectedClients: this.server.engine.clientsCount,
      atendentesAtivos: this.atendentes.size,
      atendentes: Array.from(this.atendentes.values()).map(a => ({
        nome: a.nome,
        connectedAt: a.connectedAt,
        socketId: a.socketId,
      })),
    };
  }
}