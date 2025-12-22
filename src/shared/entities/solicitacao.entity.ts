import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('solicitacoes')
export class Solicitacao {
  @PrimaryColumn({ name: 'solicitacao_id', length: 50 })
  solicitacaoId: string;

  @Column({ name: 'whatsapp_id', length: 50 })
  whatsappId: string;

  @Column({ name: 'razao_social', length: 200 })
  razaoSocial: string;

  @Column({ length: 20 })
  cnpj: string;

  @Column({ name: 'nome_responsavel', length: 200 })
  nomeResponsavel: string;

  @Column({ name: 'tipo_problema', length: 100 })
  tipoProblema: string;

  @Column('text')
  descricao: string;

  @Column({ length: 20, default: 'pendente' })
  status: string;

  @Column({ name: 'atendente_discord', length: 100, nullable: true })
  atendenteDiscord: string;

  // 🔥 NOVO CAMPO: ID do analista do sistema (não do Discord)
  @Column({ name: 'atendente_id', type: 'integer', nullable: true })
  atendente_id: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'finalizado_em', nullable: true })
  finalizadoEm: Date;
}