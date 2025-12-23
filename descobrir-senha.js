// descobrir-senha.js
const bcrypt = require('bcrypt');

const hashDoBanco = '$2b$10$MAydeOBBqlfgEPu.YfEUEu5gh3fzEJYVq5nwXSI7aGTYLOatavJiu';

// Lista de senhas POSSÍVEIS baseadas no seu setup
const senhasParaTestar = [
  'VRIP@2024',      // Do log recente
  'admin123',       // Padrão comum
  'Admin@2024',     // Similar
  'admin',          // Simples
  'password',       // Muito comum
  '123456',         // Muito comum
  'VrPost@Server',  // Do seu .env
  'admin123456',    // Outra comum
  'Admin123',       // Com capital
  'vrip2024',       // Sem símbolos
  'VRIP2024',       // Sem símbolos caps
  'Adm!n2024',      // Com símbolo
];

async function testarSenhas() {
  console.log('🔍 Testando senhas para o hash do admin...\n');
  
  let encontrada = false;
  
  for (const senha of senhasParaTestar) {
    try {
      const valida = await bcrypt.compare(senha, hashDoBanco);
      if (valida) {
        console.log(`🎉 🎉 🎉 SENHA ENCONTRADA: "${senha}"`);
        console.log(`✅ Use no login: admin / ${senha}`);
        encontrada = true;
        break;
      }
      console.log(`❌ "${senha}" - incorreta`);
    } catch (error) {
      console.log(`⚠️ Erro testando "${senha}":`, error.message);
    }
  }
  
  if (!encontrada) {
    console.log('\n⚠️ Nenhuma senha da lista funcionou. Vamos resetar!');
  }
}

testarSenhas();