import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from './jwt.service';
import { AnalistasService } from '../analistas/analistas.service';

export interface LoginResponse {
  success: boolean;
  token?: string;
  analista?: {
    id: number;
    username: string;
    nome: string;
    email: string;
    role: string;
  };
  message?: string;
  expiresAt?: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly analistasService: AnalistasService,
  ) {}

  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      this.logger.log(`🔐 Tentativa de login: ${username}`);
      
      // 1. Validar credenciais
      const analista = await this.analistasService.validateCredentials(username, password);
      
      if (!analista) {
        this.logger.warn(`❌ Login falhou: credenciais inválidas para ${username}`);
        throw new UnauthorizedException('Credenciais inválidas');
      }

      // 2. Gerar token JWT
      const token = this.jwtService.generateAnalistaToken({
        id: analista.id,
        username: analista.username,
        nome: analista.nomeCompleto,
        role: analista.role,
      });

      // 3. Log de sucesso
      this.logger.log(`✅ Login bem-sucedido: ${analista.nomeCompleto} (${analista.username})`);

      // 4. Retornar resposta
      return {
        success: true,
        token,
        analista: {
          id: analista.id,
          username: analista.username,
          nome: analista.nomeCompleto,
          email: analista.email || '',
          role: analista.role,
        },
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 horas
        message: 'Login realizado com sucesso',
      };

    } catch (error) {
      this.logger.error(`❌ Erro no login: ${error.message}`);
      
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new UnauthorizedException('Erro ao processar login');
    }
  }

  async validateToken(token: string): Promise<LoginResponse> {
    try {
      // 1. Verificar token
      const payload = this.jwtService.verifyAnalistaToken(token);
      
      if (!payload) {
        throw new UnauthorizedException('Token inválido ou expirado');
      }

      // 2. Verificar se analista ainda existe e está ativo
      const analista = await this.analistasService.findById(payload.id);
      
      if (!analista || !analista.ativo) {
        throw new UnauthorizedException('Analista não encontrado ou inativo');
      }

      // 3. Retornar dados
      return {
        success: true,
        analista: {
          id: analista.id,
          username: analista.username,
          nome: analista.nomeCompleto,
          email: analista.email || '',
          role: analista.role,
        },
        message: 'Token válido',
      };

    } catch (error) {
      this.logger.error(`❌ Erro na validação do token: ${error.message}`);
      
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      return {
        success: false,
        message: 'Token inválido',
      };
    }
  }

  async logout(token: string): Promise<{ success: boolean; message: string }> {
    try {
      // Em produção, você pode adicionar o token a uma blacklist
      this.logger.log(`🔓 Logout realizado para token`);
      
      return {
        success: true,
        message: 'Logout realizado com sucesso',
      };
    } catch (error) {
      this.logger.error(`❌ Erro no logout: ${error.message}`);
      return {
        success: false,
        message: 'Erro ao processar logout',
      };
    }
  }

  async createFirstAdmin(): Promise<boolean> {
    try {
      // Verificar se já existe admin
      const admin = await this.analistasService.findByUsername('admin');
      
      if (admin) {
        this.logger.log('✅ Admin já existe no sistema');
        return true;
      }

      // Criar admin padrão
      const adminData = {
        username: 'admin',
        passwordHash: 'admin123', // Senha padrão - deve ser alterada
        nomeCompleto: 'Administrador do Sistema',
        email: 'admin@empresa.com',
        role: 'admin',
        ativo: true,
      };

      await this.analistasService.createAnalista(adminData);
      
      this.logger.log('✅ Admin padrão criado com sucesso');
      this.logger.warn('⚠️ ALTERE A SENHA DO ADMIN IMEDIATAMENTE!');
      this.logger.warn('⚠️ Usuário: admin | Senha: admin123');
      
      return true;
    } catch (error) {
      this.logger.error(`❌ Erro ao criar admin: ${error.message}`);
      return false;
    }
  }
}