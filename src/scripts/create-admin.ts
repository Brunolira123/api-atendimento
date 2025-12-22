// src/scripts/create-admin.ts
import * as bcrypt from 'bcrypt';
import dataSource from '../config/typeorm.config';

async function createAdmin() {
  console.log('🚀 Iniciando criação do admin...\n');
  
  try {
    // Inicializar a conexão do TypeORM
    if (!dataSource.isInitialized) {
      console.log('📡 Conectando ao banco de dados...');
      await dataSource.initialize();
    }
    
    console.log('✅ Conectado ao banco de dados');

    const adminUsername = 'admin';
    const adminPassword = 'admin123';
    
    // Gerar hash da senha
    console.log('🔐 Gerando hash da senha...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);
    
    // Verificar se admin já existe
    console.log('🔍 Verificando se admin já existe...');
    const analistaRepository = dataSource.getRepository('Analista');
    const existingAdmin = await analistaRepository.findOne({
      where: { username: adminUsername }
    });
    
    if (existingAdmin) {
      console.log('ℹ️ Admin já existe no sistema');
      console.log('👤 Usuário:', existingAdmin.username);
      console.log('🆔 ID:', existingAdmin.id);
      
      await dataSource.destroy();
      return;
    }
    
    // Criar admin
    console.log('👨‍💼 Criando admin...');
    const adminData = {
      username: adminUsername,
      passwordHash: passwordHash,
      nomeCompleto: 'Administrador do Sistema',
      email: 'admin@empresa.com',
      role: 'admin',
      ativo: true,
    };
    
    const admin = analistaRepository.create(adminData);
    await analistaRepository.save(admin);
    
    console.log('\n🎉 ADMIN CRIADO COM SUCESSO!');
    console.log('==============================');
    console.log('👤 Usuário: admin');
    console.log('🔐 Senha: admin123');
    console.log('📧 Email: admin@empresa.com');
    console.log('👑 Role: admin');
    console.log('==============================');
    console.log('\n⚠️  IMPORTANTE:');
    console.log('1. Altere a senha após o primeiro login!');
    console.log('2. Crie mais analistas através da API');
    console.log('3. Nunca compartilhe estas credenciais');
    console.log('==============================\n');
    
    // Fechar conexão
    await dataSource.destroy();
    console.log('🔌 Conexão com banco fechada');
    
  } catch (error) {
    console.error('❌ ERRO AO CRIAR ADMIN:', error);
    
    // Tentar mostrar erro específico
    if (error.code === '23505') {
      console.error('⚠️  Erro: Usuário já existe (violação de unique constraint)');
    } else if (error.code === '28P01') {
      console.error('⚠️  Erro: Credenciais do banco inválidas');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('⚠️  Erro: Não foi possível conectar ao banco');
      console.error('   Verifique se o PostgreSQL está rodando');
    } else if (error.message.includes('Analista')) {
      console.error('⚠️  Erro: Tabela "analistas" não encontrada');
      console.error('   Execute as migrations primeiro:');
      console.error('   npm run migration:run');
    }
    
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  createAdmin();
}

export { createAdmin };