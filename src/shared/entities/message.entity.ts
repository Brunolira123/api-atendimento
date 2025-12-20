import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Conversation } from './conversation.entity';

// shared/entities/message.entity.ts (se você tiver)
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

  @Column({ 
    length: 20, 
    default: 'sent',
    enum: ['sent', 'delivered', 'read', 'failed']
  })
  status: 'sent' | 'delivered' | 'read' | 'failed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'delivered_at', nullable: true })
  deliveredAt: Date;

  @Column({ name: 'read_at', nullable: true })
  readAt: Date;
}