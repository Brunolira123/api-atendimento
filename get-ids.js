// get-ids.js - Execute apenas localmente!
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

client.on('ready', () => {
  console.log('✅ Bot conectado como:', client.user.tag);
  
  // Lista servidores
  console.log('\n🏰 SERVIDORES:');
  client.guilds.cache.forEach(guild => {
    console.log(`• "${guild.name}" → ID: ${guild.id}`);
  });
  
  // Para listar canais de um servidor específico:
  const guildId = 'ID_DO_SEU_SERVIDOR'; // Substitua pelo ID real
  const guild = client.guilds.cache.get(guildId);
  
  if (guild) {
    console.log(`\n📁 CANAIS em "${guild.name}":`);
    guild.channels.cache.forEach(channel => {
      if (channel.type === 0) { // Apenas canais de texto
        console.log(`• #${channel.name} → ID: ${channel.id}`);
      }
    });
  }
  
  console.log('\n⚠️  NÃO COMPARTILHE ESTES IDs PUBLICAMENTE!');
  process.exit(0);
});

// Use o NOVO token aqui
client.login('MTQ1MDIzODkwMzk3Njk4NDY5Ng.GRqTJ6.RngnM3lFcePdUBwYasmkQ-Jg2uWl-w6qeDQ4J4').catch(console.error);