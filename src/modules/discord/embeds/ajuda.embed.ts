import { EmbedBuilder } from 'discord.js';

export class AjudaEmbed {
  /**
   * Cria embed de ajuda completo
   */
  criarAjudaCompleta(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🤖 AJUDA - VR SOFTWARE')
      .setDescription('Comandos disponíveis e como usar o sistema')
      .addFields(
        { 
          name: '⚙️ CONFIGURAÇÃO', 
          value: 
            '`!canal` - Configura este canal para receber solicitações\n' +
            '`!config` - Sinônimo de !canal\n\n' +
            '**Exemplo:** `!canal`',
          inline: false 
        },
        { 
          name: '🧪 TESTES E DIAGNÓSTICO', 
          value: 
            '`!teste` - Envia uma solicitação de teste\n' +
            '`!status` - Mostra status do sistema\n\n' +
            '**Exemplo:** `!teste`',
          inline: false 
        },
        { 
          name: '🔧 UTILIDADES', 
          value: 
            '`!reabrir <id>` - Reabre uma solicitação resolvida\n' +
            '`!ajuda` - Mostra esta mensagem\n' +
            '`!help` - Sinônimo de !ajuda\n\n' +
            '**Exemplo:** `!reabrir SOL123456`',
          inline: false 
        },
        { 
          name: '📱 FLUXO DO SISTEMA', 
          value: 
            '1. Cliente envia mensagem no WhatsApp\n' +
            '2. Sistema faz triagem automática\n' +
            '3. Solicitação aparece aqui com botões\n' +
            '4. Analista clica "✅ Assumir" para atender\n' +
            '5. Portal abre automaticamente',
          inline: false 
        },
        { 
          name: '🎯 BOTÕES DISPONÍVEIS', 
          value: 
            '🟢 **Assumir** - Assumir atendimento\n' +
            '🔵 **Portal** - Abrir portal web\n' +
            '🟡 **Resolver** - Marcar como resolvido\n' +
            '🟣 **Reabrir** - Reabrir solicitação\n' +
            '📱 **WhatsApp** - Abrir conversa no WhatsApp',
          inline: false 
        },
        { 
          name: '📞 SUPORTE', 
          value: 
            '• **Problemas técnicos:** Contate o administrador\n' +
            '• **Dúvidas:** Use o comando `!ajuda`\n' +
            '• **Sugestões:** Envie para a equipe de desenvolvimento',
          inline: false 
        },
      )
      .setFooter({ 
        text: 'VR Software • Digite ! para ver todos os comandos' 
      })
      .setTimestamp();
  }

  /**
   * Cria embed de ajuda rápido
   */
  criarAjudaRapida(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🔧 COMANDOS RÁPIDOS')
      .setDescription('Principais comandos do sistema')
      .addFields(
        { name: '`!canal`', value: 'Configurar canal', inline: true },
        { name: '`!teste`', value: 'Enviar teste', inline: true },
        { name: '`!status`', value: 'Ver status', inline: true },
        { name: '`!ajuda`', value: 'Ajuda completa', inline: true },
        { name: '`!reabrir <id>`', value: 'Reabrir solicitação', inline: true },
      )
      .setFooter({ text: 'Digite !ajuda para ver todos os comandos' });
  }

  /**
   * Cria embed de tutorial de configuração
   */
  criarTutorialConfiguracao(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('📚 TUTORIAL DE CONFIGURAÇÃO')
      .setDescription('Passo a passo para configurar o sistema')
      .addFields(
        { 
          name: '📝 PASSO 1 - Configurar Canal', 
          value: 'Digite `!canal` neste canal onde deseja receber as solicitações',
          inline: false 
        },
        { 
          name: '🧪 PASSO 2 - Testar Sistema', 
          value: 'Digite `!teste` para enviar uma solicitação de teste',
          inline: false 
        },
        { 
          name: '✅ PASSO 3 - Verificar Status', 
          value: 'Digite `!status` para confirmar que tudo está funcionando',
          inline: false 
        },
        { 
          name: '🎯 PASSO 4 - Usar o Sistema', 
          value: 'Quando uma solicitação real chegar, clique em "✅ Assumir"',
          inline: false 
        },
        { 
          name: '⚠️ DICAS IMPORTANTES', 
          value: 
            '• Certifique-se que o bot tem permissão para enviar mensagens\n' +
            '• Use `!ajuda` sempre que tiver dúvidas\n' +
            '• Para problemas, contate o administrador',
          inline: false 
        },
      )
      .setFooter({ text: 'VR Software - Sistema de Atendimento' })
      .setTimestamp();
  }
}