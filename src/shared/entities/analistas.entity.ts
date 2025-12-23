// src/shared/entities/analista.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Entity('analistas')
export class Analista {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'nome_completo', length: 100 })
  nomeCompleto: string;

  @Column({ length: 100, nullable: true })
  email: string;

  @Column({ length: 20, default: 'analista' })
  role: string; // analista, supervisor, admin

  @Column({ name: 'departamento_id', nullable: true })
  departamentoId: number;

  @Column({ default: true })
  ativo: boolean;

  @Column({ name: 'discord_id', length: 50, nullable: true })
  discordId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // 🔐 Métodos para senha
  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }

  @BeforeInsert()
  async hashPassword(): Promise<void> {
     if (this.passwordHash && this.passwordHash.length < 60) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
    }
  }

  // 🔒 Remover senha ao serializar
  toJSON() {
    const { passwordHash, ...rest } = this;
    return rest;
  }
}