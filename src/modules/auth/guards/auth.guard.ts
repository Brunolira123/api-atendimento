import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../jwt.service';
import { AnalistasService } from '../../analistas/analistas.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly analistasService: AnalistasService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token não fornecido');
    }

    try {
      // Verificar token
      const payload = this.jwtService.verifyAnalistaToken(token);
      
      if (!payload) {
        throw new UnauthorizedException('Token inválido');
      }

      // Verificar se analista ainda existe e está ativo
      const analista = await this.analistasService.findById(payload.id);
      
      if (!analista || !analista.ativo) {
        throw new UnauthorizedException('Analista não encontrado ou inativo');
      }

      // Adicionar usuário à requisição
      request.user = {
        id: analista.id,
        username: analista.username,
        nome: analista.nomeCompleto,
        role: analista.role,
        departamentoId: analista.departamentoId,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException(error.message || 'Não autorizado');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}