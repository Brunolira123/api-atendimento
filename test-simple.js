// test-namespace-3000.js
const { io } = require('socket.io-client');

console.log('🧪 Testando namespace /atendimento na porta 3000...');

const socket = io('http://localhost:3000/atendimento', {
  transports: ['polling', 'websocket'],
  timeout: 10000,
  reconnection: false
});

socket.on('connect', () => {
  console.log('✅✅✅ CONECTADO AO NAMESPACE /atendimento!');
  console.log('Socket ID:', socket.id);
  console.log('Transporte:', socket.io.engine.transport.name);
  
  // Testa o evento
  socket.emit('whatsapp:test', {
    message: 'Teste com namespace',
    timestamp: new Date().toISOString()
  });
});

socket.on('connected', (data) => {
  console.log('\n📨 Mensagem de boas-vindas:', data);
});

socket.on('whatsapp:test_response', (data) => {
  console.log('\n✅✅✅ RESPOSTA DO TESTE:');
  console.log(JSON.stringify(data, null, 2));
});

socket.on('connect_error', (err) => {
  console.error('\n❌ Erro:', err.message);
  console.error('Detalhes:', err);
});

socket.onAny((event, data) => {
  console.log(`📨 [${event}]:`, 
    typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : data
  );
});

setTimeout(() => {
  console.log('\n' + '='.repeat(50));
  if (socket.connected) {
    console.log('✅ Conexão com namespace funcionando!');
    socket.disconnect();
  } else {
    console.log('❌ Falha na conexão com namespace');
  }
  process.exit(0);
}, 15000);