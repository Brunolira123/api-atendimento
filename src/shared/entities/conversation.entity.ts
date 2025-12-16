import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'whatsapp_id', length: 50 })
  whatsappId: string;

  @Column({ name: 'customer_name', length: 100, nullable: true })
  customerName: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'atendente_discord', length: 100, nullable: true })
  atendenteDiscord: string;

  @Column({ name: 'razao_social', length: 200, nullable: true })
  razaoSocial: string;

  @Column({ length: 20, nullable: true })
  cnpj: string;

  @Column({ name: 'tipo_problema', length: 100, nullable: true })
  tipoProblema: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'last_message_at', nullable: true })
  lastMessageAt: Date;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];
}