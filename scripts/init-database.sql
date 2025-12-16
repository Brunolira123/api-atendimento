-- Banco de dados para o sistema de atendimento
CREATE DATABASE IF NOT EXISTS atendimento_db;

-- Tabela de solicitações
CREATE TABLE IF NOT EXISTS solicitacoes (
    solicitacao_id VARCHAR(50) PRIMARY KEY,
    whatsapp_id VARCHAR(50) NOT NULL,
    razao_social VARCHAR(200) NOT NULL,
    cnpj VARCHAR(20) NOT NULL,
    nome_responsavel VARCHAR(200) NOT NULL,
    tipo_problema VARCHAR(100) NOT NULL,
    descricao TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente',
    atendente_discord VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalizado_em TIMESTAMP
);

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_id VARCHAR(50) NOT NULL,
    customer_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    atendente_discord VARCHAR(100),
    razao_social VARCHAR(200),
    cnpj VARCHAR(20),
    tipo_problema VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP
);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    direction VARCHAR(20) NOT NULL,
    atendente_discord VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_solicitacoes_status ON solicitacoes(status);
CREATE INDEX idx_solicitacoes_whatsapp ON solicitacoes(whatsapp_id);
CREATE INDEX idx_conversations_whatsapp ON conversations(whatsapp_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);