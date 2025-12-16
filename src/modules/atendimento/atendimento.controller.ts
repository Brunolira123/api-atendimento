import { Controller, Get, Param, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AtendimentoController {
  @Get('atendimento/:id')
  servirPortal(
    @Param('id') id: string,
    @Query('atendente') atendente: string,
    @Res() res: Response,
  ) {
    // Tenta encontrar o arquivo HTML
    const filePath = join(__dirname, '..', '..', '..', 'frontend', 'atendimento.html');
    
    // Verifica se o arquivo existe
    const fs = require('fs');
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      // Se não encontrar, serve página básica
      res.send(this.getFallbackHtml(id, atendente));
    }
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'VR Software - Sistema Completo',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('api/status')
  getStatus() {
    return {
      success: true,
      message: 'API funcionando',
      timestamp: new Date().toISOString(),
    };
  }

  private getFallbackHtml(id: string, atendente: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Portal de Atendimento - ${id}</title>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .chat-container { height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 20px; margin-bottom: 20px; }
        .message-input { display: flex; gap: 10px; }
        .message-input input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        .message-input button { background: #2c3e50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .incoming { background: #f0f0f0; }
        .outgoing { background: #3498db; color: white; margin-left: auto; max-width: 80%; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Portal de Atendimento VR Software</h1>
            <p>Solicitação: ${id} | Atendente: ${atendente || 'Não informado'}</p>
        </div>
        
        <div id="chat-container" class="chat-container"></div>
        
        <div class="message-input">
            <input type="text" id="messageInput" placeholder="Digite sua mensagem..." autocomplete="off">
            <button onclick="sendMessage()">📤 Enviar</button>
        </div>
    </div>

    <script>
        const socket = io('http://localhost:3000/atendimento');
        const solicitacaoId = '${id}';
        const atendenteNome = '${atendente || "Atendente"}';

        socket.on('connect', () => {
            console.log('✅ Conectado ao servidor');
            addMessage('Sistema', 'Conectado ao portal de atendimento', 'incoming');
            
            // Login automático
            socket.emit('atendente:login', {
                nome: atendenteNome,
                discordId: 'discord_' + Date.now()
            });
        });

        socket.on('atendente:logged', (data) => {
            console.log('✅ Login realizado:', data);
            addMessage('Sistema', 'Login realizado com sucesso', 'incoming');
            
            // Assumir solicitação
            socket.emit('solicitacao:assumir', { solicitacaoId: solicitacaoId });
        });

        socket.on('solicitacao:assumida:success', (data) => {
            console.log('✅ Solicitação assumida:', data);
            addMessage('Sistema', 'Atendimento iniciado para solicitação ' + solicitacaoId, 'incoming');
        });

        socket.on('message:sent', (data) => {
            console.log('📤 Mensagem enviada:', data);
        });

        socket.on('solicitacao:nova', (data) => {
            console.log('📋 Nova solicitação:', data);
        });

        socket.on('whatsapp:qr', (qr) => {
            console.log('📱 QR Code recebido');
            addMessage('Sistema', 'QR Code WhatsApp disponível no terminal', 'incoming');
        });

        socket.on('whatsapp:ready', (info) => {
            console.log('✅ WhatsApp conectado:', info);
            addMessage('Sistema', 'WhatsApp conectado e pronto para atendimento', 'incoming');
        });

        socket.on('disconnect', () => {
            console.log('❌ Desconectado do servidor');
            addMessage('Sistema', 'Desconectado do servidor. Tentando reconectar...', 'incoming');
        });

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (message) {
                // Enviar mensagem de exemplo
                socket.emit('mensagem:enviar', {
                    whatsappId: '5511999999999', // Exemplo
                    mensagem: message,
                    solicitacaoId: solicitacaoId
                });
                
                // Adicionar visualmente
                addMessage(atendenteNome, message, 'outgoing');
                input.value = '';
                input.focus();
            }
        }

        function addMessage(author, text, type) {
            const chat = document.getElementById('chat-container');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}\`;
            messageDiv.innerHTML = \`<strong>\${author}:</strong> \${text}\`;
            chat.appendChild(messageDiv);
            chat.scrollTop = chat.scrollHeight;
        }

        // Enter para enviar
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    </script>
</body>
</html>
    `;
  }
}