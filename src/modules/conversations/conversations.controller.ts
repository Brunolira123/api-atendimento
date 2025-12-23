// src/conversations/conversations.controller.ts
import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
// import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger'; // REMOVER
import { ConversationsService } from './conversations.service';

// @ApiTags('conversations') // REMOVER
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  // @ApiOperation({ summary: 'Listar todas as conversas' }) // REMOVER
  // @ApiResponse({ status: 200, description: 'Conversas retornadas com sucesso' }) // REMOVER
  async getAllConversations(
    @Query('status') status?: string,
    @Query('atendente') atendente?: string,
  ) {
    try {
      const filters = {
        status,
        atendente,
      };

      const conversations = await this.conversationsService.findAll(filters);
      
      return {
        success: true,
        data: conversations,
        count: conversations.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('pending')
  // @ApiOperation({ summary: 'Listar conversas pendentes' }) // REMOVER
  // @ApiResponse({ status: 200, description: 'Conversas pendentes retornadas' }) // REMOVER
  async getPendingConversations() {
    try {
      const conversations = await this.conversationsService.findPending();
      
      return {
        success: true,
        data: conversations,
        count: conversations.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('active')
  // @ApiOperation({ summary: 'Listar conversas ativas' }) // REMOVER
  // @ApiResponse({ status: 200, description: 'Conversas ativas retornadas' }) // REMOVER
  async getActiveConversations() {
    try {
      const conversations = await this.conversationsService.findActive();
      
      return {
        success: true,
        data: conversations,
        count: conversations.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':id')
  // @ApiOperation({ summary: 'Obter detalhes de uma conversa' }) // REMOVER
  // @ApiParam({ name: 'id', description: 'ID da conversa' }) // REMOVER
  // @ApiResponse({ status: 200, description: 'Detalhes da conversa' }) // REMOVER
  // @ApiResponse({ status: 404, description: 'Conversa não encontrada' }) // REMOVER
  async getConversationDetails(@Param('id') id: string) {
    try {
      const conversation = await this.conversationsService.findById(id);
      
      if (!conversation) {
        throw new NotFoundException(`Conversa ${id} não encontrada`);
      }

      return {
        success: true,
        data: conversation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message,
        data: null,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':id/messages')
  // @ApiOperation({ summary: 'Buscar mensagens de uma conversa' }) // REMOVER
  // @ApiParam({ name: 'id', description: 'ID da conversa' }) // REMOVER
  // @ApiResponse({ status: 200, description: 'Mensagens retornadas' }) // REMOVER
  async getConversationMessages(@Param('id') id: string) {
    try {
      // Verificar se a conversa existe
      const conversation = await this.conversationsService.findById(id);
      
      if (!conversation) {
        throw new NotFoundException(`Conversa ${id} não encontrada`);
      }

      const messages = await this.conversationsService.findMessages(id);
      
      return {
        success: true,
        data: messages,
        count: messages.length,
        conversation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message,
        data: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('stats/summary')
  // @ApiOperation({ summary: 'Obter estatísticas resumidas' }) // REMOVER
  // @ApiResponse({ status: 200, description: 'Estatísticas retornadas' }) // REMOVER
  async getStatsSummary() {
    try {
      const stats = await this.conversationsService.getStatsSummary();
      
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('search/by-whatsapp')
  // @ApiOperation({ summary: 'Buscar conversas por WhatsApp' }) // REMOVER
  async searchByWhatsapp(@Query('whatsapp') whatsapp: string) {
    try {
      if (!whatsapp) {
        return {
          success: false,
          error: 'Parâmetro "whatsapp" é obrigatório',
          data: [],
          timestamp: new Date().toISOString(),
        };
      }

      const conversations = await this.conversationsService.findByWhatsapp(whatsapp);
      
      return {
        success: true,
        data: conversations,
        count: conversations.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: [],
        timestamp: new Date().toISOString(),
      };
    }
  }
}