import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { WebSocketManagerService } from './services/websocket-manager.service';
import { ConversationManagerService } from './services/conversation-manager.service';
import { WhatsAppEventsService } from './services/whatsapp-events.service';
import { AtendimentoHandler } from './handlers/atendimento.handler';
import { MensagemHandler } from './handlers/mensagem.handler';
import { DiscordHandler } from './handlers/discord.handler';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  namespace: 'atendimento',
})
export class WebSocketGatewayService implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGatewayService.name);

  constructor(
    private readonly websocketManager: WebSocketManagerService,
    private readonly atendimentoHandler: AtendimentoHandler,
    private readonly mensagemHandler: MensagemHandler,
    private readonly discordHandler: DiscordHandler,
    private readonly whatsappEvents: WhatsAppEventsService,
    private readonly conversationManager: ConversationManagerService,
  ) {}

  // ========== CONEXÃO BÁSICA ==========
  async handleConnection(client: Socket) {
    await this.websocketManager.handleConnection(client, this.server);
  }

  async handleDisconnect(client: Socket) {
    await this.websocketManager.handleDisconnect(client, this.server);
  }

  // ========== HANDLERS DE ATENDIMENTO ==========
  @SubscribeMessage('atendente:login')
  async handleLogin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.atendimentoHandler.handleLogin(client, this.server, data);
  }

  @SubscribeMessage('solicitacao:assumir')
  async handleAssumirSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.atendimentoHandler.handleAssumirSolicitacao(client, this.server, data);
  }

  @SubscribeMessage('solicitacao:finalizar')
  async handleFinalizarSolicitacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.atendimentoHandler.handleFinalizarSolicitacao(client, this.server, data);
  }

  // ========== HANDLERS DE MENSAGEM ==========
  @SubscribeMessage('mensagem:enviar')
  async handleEnviarMensagem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.mensagemHandler.handleEnviarMensagem(client, this.server, data);
  }

  @SubscribeMessage('whatsapp:simulate')
  async handleSimulateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.mensagemHandler.handleSimulateMessage(client, this.server, data);
  }

  // ========== HANDLERS DO DISCORD ==========
  @SubscribeMessage('discord:assumir')
  async handleDiscordAssumir(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    return this.discordHandler.handleDiscordAssumir(client, this.server, data);
  }

  // ========== TESTE ==========
  @SubscribeMessage('whatsapp:test')
  handleWhatsAppTest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    this.logger.log(`🧪 Teste WhatsApp recebido de ${client.id}`);
    
    this.server.emit('whatsapp:test_response', {
      success: true,
      serverReady: !!this.server,
      timestamp: new Date().toISOString(),
      message: 'WebSocketGateway está funcionando!'
    });
    
    return {
      evento: 'whatsapp:test_response',
      data: {
        success: true,
        message: 'Teste recebido'
      }
    };
  }

  // ========== MÉTODOS PÚBLICOS PARA WHATSAPPSERVICE ==========
  
  // 1. Método para emitir QR Code (que estava faltando)
  emitQRCode(qrCode: string) {
    this.whatsappEvents.emitQRCode(this.server, qrCode);
  }

  // 2. Método para salvar status do WhatsApp
  saveWhatsAppStatus(data: any) {
    this.websocketManager.saveWhatsAppStatus(data);
  }

  // 3. Método para emitir nova solicitação
  emitNovaSolicitacao(solicitacao: any) {
    // Converte para o formato de conversa
    const conversa = this.conversationManager.mapearParaConversa(solicitacao);
    
    // Emite via serviço de eventos
    this.whatsappEvents.emitNovaSolicitacao(this.server, conversa);
    
    // Atualiza também a lista de conversas
    this.conversationManager.enviarConversasAtualizadas(this.server);
  }

  // 4. Método para emitir mensagem enviada
  emitMessageSent(data: any) {
    this.whatsappEvents.emitMessageSent(this.server, data);
  }

  // 5. Métodos adicionais que podem ser necessários
  emitWhatsAppReady(info: any) {
    this.whatsappEvents.emitWhatsAppReady(this.server, info);
  }

  emitWhatsAppConnected(user: any) {
    this.whatsappEvents.emitWhatsAppConnected(this.server, user);
  }

  emitAtendimentoFinalizado(data: any) {
    this.server.emit('atendimento:finalizado', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  emitSolicitacaoAssumida(data: any) {
    this.server.emit('solicitacao:assumida', {
      type: 'discord_assumida',
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  emitNovaMensagem(data: any) {
    this.whatsappEvents.emitNovaMensagem(this.server, data);
  }

  emitStatusUpdate(data: any) {
    this.whatsappEvents.emitStatusUpdate(this.server, data);
  }

  // ========== MÉTODOS AUXILIARES ==========
  emit(event: string, data: any) {
    this.server.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  getStats() {
    return this.websocketManager.getStats(this.server);
  }
}