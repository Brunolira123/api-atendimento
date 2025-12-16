import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'conversation_id' })
  conversationId: string;

  @Column('text')
  content: string;

  @Column({ length: 20 })
  direction: 'incoming' | 'outgoing';

  @Column({ name: 'atendente_discord', length: 100, nullable: true })
  atendenteDiscord: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}