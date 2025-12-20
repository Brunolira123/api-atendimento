// src/websocket.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export class WebSocketAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
        credentials: true,
      },
      // Permite que os namespaces sejam criados automaticamente
      connectTimeout: 45000,
      // Path para WebSocket (opcional - mantenha se estiver usando)
      // path: '/atendimento/socket.io'
    });
    
    console.log('🔧 WebSocketAdapter configurado');
    return server;
  }
}