export interface AtendenteSession {
  nome: string;
  discordId?: string;
  socketId: string;
  connectedAt: Date;
  lastPing?: Date;
}

export interface Conversa {
  id: string;
  whatsapp_id: string;
  customer_name: string;
  status: 'pending' | 'active' | 'closed';
  last_message: string;
  last_message_at: Date;
  atendente_discord: string | null;
  created_at: Date;
  razao_social: string;
  cnpj: string;
  tipo_problema: string;
  descricao: string;
  finalizado_em: Date | null;
}

export interface Mensagem {
  id: string;
  solicitacaoId: string;
  content: string;
  direction: 'incoming' | 'outgoing';
  atendente_discord: string | null;
  timestamp: Date;
  delivered: boolean;
  read: boolean;
}

export interface WhatsAppStatus {
  user: string;
  phoneNumber: string;
  status: 'connected' | 'disconnected' | 'connecting';
  timestamp: Date;
  message?: string;
  source?: 'saved_status' | 'current_status';
}

export interface SocketEvent {
  evento: string;
  data: any;
}

export interface ErrorResponse {
  message: string;
  error?: string;
  timestamp: string;
}

export interface LoginData {
  nome: string;
  discordId?: string;
}

export interface AssumirSolicitacaoData {
  solicitacaoId: string;
}

export interface EnviarMensagemData {
  solicitacaoId: string;
  mensagem: string;
  whatsappId?: string;
}

export interface FinalizarSolicitacaoData {
  solicitacaoId: string;
  resolucao?: string;
}

export interface DiscordAssumirData {
  solicitacaoId: string;
  atendente: string;
  discordId: string;
}

export interface SimulateMessageData {
  from: string;
  message: string;
}

export interface StatsData {
  connectedClients: number;
  atendentesAtivos: number;
  atendentes: Array<{
    nome: string;
    discordId?: string;
    connectedAt: Date;
    socketId: string;
  }>;
  whatsappStatus: WhatsAppStatus | null;
  timestamp: string;
}