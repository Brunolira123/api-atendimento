import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtService } from '../../auth/jwt.service';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    
    // Para handlers específicos, o token já deve estar validado
    // pelo evento 'auth:validate' anterior
    const user = client['user'];
    
    if (!user) {
      throw new WsException('Não autenticado. Faça auth:validate primeiro');
    }

    return true;
  }
}