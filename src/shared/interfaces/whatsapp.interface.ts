
export interface SessionData {
  estado: string;
  dados: {
    whatsappId: string;
    razaoSocial?: string;
    cnpj?: string;
    nomeResponsavel?: string;
    opcaoEscolhida?: number;
    tipoProblema?: string;
    descricaoProblema?: string;
    solicitacaoId?: string;
    inicio: Date;
    fim?: Date;
    status?: string;
  };
  historico: Array<{ etapa: string; valor: string }>;
}

export interface IWhatsAppSessionService {
  criarSessao(whatsappId: string): SessionData;
  getSessao(whatsappId: string): SessionData | undefined;
  atualizarSessao(whatsappId: string, sessao: SessionData): void;
  finalizarSessao(whatsappId: string): void;
  getSessoesAtivas(): Map<string, SessionData>;
  limparSessoes(): { success: boolean; count: number };
}

export interface IWhatsAppMessageService {
  enviarMensagem(whatsappId: string, mensagem: string): Promise<{ success: boolean; error?: string }>;
  enviarMensagemAtendente(whatsappId: string, mensagem: string, atendenteNome: string): Promise<{ success: boolean; error?: string }>;
  formatarCNPJ(cnpj: string): string;
}

export interface IWhatsAppNotificationService {
  notificarSolicitacao(whatsappId: string, dados: any): Promise<void>;
  enviarParaDiscordWebhook(whatsappId: string, dados: any): Promise<void>;
}