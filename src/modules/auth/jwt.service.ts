// src/modules/auth/jwt.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

export interface DiscordAuthPayload {
  solicitacaoId: string;
  atendenteNome: string;
  discordId: string;
  discordTag: string;
  exp?: number;
}

export interface AnalistaAuthPayload {
  id: number;
  username: string;
  nome: string;
  role: string;
  exp?: number;
}

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private readonly secret: string;
  private readonly expiresIn = '8h'; // 8 horas para analistas
  private readonly discordExpiresIn = '1h'; // 1 hora para Discord

  constructor(private configService: ConfigService) {
    this.secret = this.configService.get('JWT_SECRET') || 'vr-software-secret-key-change-in-production';
    
    if (this.secret === 'vr-software-secret-key-change-in-production') {
      this.logger.warn('⚠️  JWT_SECRET está usando valor padrão. Altere em produção!');
    }
  }

  // 🔐 Token para analistas (sistema interno)
  generateAnalistaToken(payload: AnalistaAuthPayload): string {
    const tokenPayload: AnalistaAuthPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60), // 8 horas
    };

    const token = jwt.sign(tokenPayload, this.secret);
    
    this.logger.log(`🔐 Token de sessão gerado para ${payload.nome} (${payload.username})`);
    return token;
  }

  verifyAnalistaToken(token: string): AnalistaAuthPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as AnalistaAuthPayload;
      
      // Verificar se não expirou
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        this.logger.warn(`❌ Token expirado para ${decoded.username}`);
        return null;
      }
      
      return decoded;
    } catch (error) {
      this.logger.error(`❌ Token de analista inválido: ${error.message}`);
      return null;
    }
  }

  // 🤖 Token para Discord (compatibilidade)
  generateDiscordToken(payload: DiscordAuthPayload): string {
    const tokenPayload: DiscordAuthPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hora
    };

    const token = jwt.sign(tokenPayload, this.secret);
    
    this.logger.log(`🔐 Token Discord gerado para ${payload.atendenteNome}: ${payload.solicitacaoId}`);
    return token;
  }

  verifyDiscordToken(token: string): DiscordAuthPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as DiscordAuthPayload;
      
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        this.logger.warn(`❌ Token Discord expirado para ${decoded.solicitacaoId}`);
        return null;
      }
      
      return decoded;
    } catch (error) {
      this.logger.error(`❌ Token Discord inválido: ${error.message}`);
      return null;
    }
  }

  // 🔗 Gerar URL para frontend (compatibilidade)
  generateFrontendUrl(solicitacaoId: string, atendenteData: any): string {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    
    const token = this.generateDiscordToken({
      solicitacaoId,
      atendenteNome: atendenteData.nome,
      discordId: atendenteData.discordId,
      discordTag: atendenteData.discordTag || atendenteData.nome,
    });

    return `${frontendUrl}/atendimento/${solicitacaoId}?token=${token}`;
  }
  decodeToken(token: string): any {
    try {
      return jwt.decode(token);
    } catch {
      return null;
    }
  }
}