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

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private readonly secret: string;
  private readonly expiresIn = '1h';

  constructor(private configService: ConfigService) {
    this.secret = this.configService.get('JWT_SECRET') || 'vr-software-secret-key-change-in-production';
  }

  generateDiscordToken(payload: DiscordAuthPayload): string {
    const tokenPayload: DiscordAuthPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hora
    };

    const token = jwt.sign(tokenPayload, this.secret);
    
    this.logger.log(`🔐 Token gerado para ${payload.atendenteNome}: ${payload.solicitacaoId}`);
    return token;
  }

  verifyDiscordToken(token: string): DiscordAuthPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as DiscordAuthPayload;
      return decoded;
    } catch (error) {
      this.logger.error(`❌ Token inválido: ${error.message}`);
      return null;
    }
  }

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
}