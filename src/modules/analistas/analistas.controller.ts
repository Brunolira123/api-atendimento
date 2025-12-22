import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AnalistasService } from './analistas.service';
import { Analista } from '../../shared/entities/analistas.entity';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';

// DTOs para validação
class CreateAnalistaDto {
  username: string;
  password: string;
  nomeCompleto: string;
  email?: string;
  role?: string;
  departamentoId?: number;
  discordId?: string;
}

class UpdateAnalistaDto {
  nomeCompleto?: string;
  email?: string;
  role?: string;
  departamentoId?: number;
  discordId?: string;
  ativo?: boolean;
}

class ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

class SearchAnalistasDto {
  role?: string;
  departamentoId?: number;
  ativo?: boolean;
  search?: string;
}

@Controller('api/analistas')
@UseGuards(AuthGuard, RolesGuard) // 🔐 Protege todas as rotas
export class AnalistasController {
  constructor(private readonly analistasService: AnalistasService) {}

  // ========== GET - LISTAR ==========
  @Get()
  @Roles('admin', 'supervisor') // Apenas admin e supervisor podem listar
  async getAllAnalistas(@Query() filters: SearchAnalistasDto) {
    try {
      let analistas: Analista[];
      
      if (filters.role) {
        analistas = await this.analistasService.getAnalistasPorRole(filters.role);
      } else if (filters.departamentoId) {
        analistas = await this.analistasService.getAnalistasPorDepartamento(filters.departamentoId);
      } else {
        analistas = await this.analistasService.getAllAnalistas();
      }
      
      // Filtrar por busca textual
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        analistas = analistas.filter(a =>
          a.nomeCompleto.toLowerCase().includes(searchLower) ||
          a.username.toLowerCase().includes(searchLower) ||
          a.email?.toLowerCase().includes(searchLower)
        );
      }
      
      // Filtrar por status ativo/inativo
      if (filters.ativo !== undefined) {
        analistas = analistas.filter(a => a.ativo === filters.ativo);
      }
      
      return {
        success: true,
        data: analistas.map(a => this.sanitizeAnalista(a)),
        count: analistas.length,
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

  @Get('ativos')
  @Roles('admin', 'supervisor', 'analista') // Todos logados podem ver ativos
  async getAnalistasAtivos() {
    try {
      const analistas = await this.analistasService.getAllAnalistas();
      
      return {
        success: true,
        data: analistas
          .filter(a => a.ativo)
          .map(a => ({
            id: a.id,
            username: a.username,
            nome: a.nomeCompleto,
            role: a.role,
          })),
        count: analistas.filter(a => a.ativo).length,
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

  @Get('count')
  @Roles('admin', 'supervisor')
  async getCount() {
    try {
      const count = await this.analistasService.countAnalistasAtivos();
      
      return {
        success: true,
        count,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        count: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':id')
  async getAnalistaById(@Param('id') id: string) {
    try {
      const analistaId = parseInt(id, 10);
      
      if (isNaN(analistaId)) {
        throw new BadRequestException('ID inválido');
      }
      
      const analista = await this.analistasService.findById(analistaId);
      
      if (!analista) {
        throw new NotFoundException(`Analista ${id} não encontrado`);
      }
      
      return {
        success: true,
        data: this.sanitizeAnalista(analista),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
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

  @Get('username/:username')
  @Roles('admin', 'supervisor')
  async getAnalistaByUsername(@Param('username') username: string) {
    try {
      const analista = await this.analistasService.findByUsername(username);
      
      if (!analista) {
        throw new NotFoundException(`Analista ${username} não encontrado`);
      }
      
      return {
        success: true,
        data: this.sanitizeAnalista(analista),
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

  // ========== POST - CRIAR ==========
  @Post()
  @Roles('admin') // Apenas admin pode criar
  @UsePipes(new ValidationPipe({ transform: true }))
  async createAnalista(@Body() createAnalistaDto: CreateAnalistaDto) {
    try {
      // Verificar se username já existe
      const existing = await this.analistasService.findByUsername(createAnalistaDto.username);
      
      if (existing) {
        throw new BadRequestException(`Username ${createAnalistaDto.username} já está em uso`);
      }
      
      // Criar analista
      const analista = await this.analistasService.createAnalista({
        ...createAnalistaDto,
        passwordHash: createAnalistaDto.password, // Será hashed pelo @BeforeInsert
      });
      
      return {
        success: true,
        data: this.sanitizeAnalista(analista),
        message: 'Analista criado com sucesso',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
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

  // ========== PUT - ATUALIZAR ==========
  @Put(':id')
  @Roles('admin', 'supervisor')
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateAnalista(
    @Param('id') id: string,
    @Body() updateAnalistaDto: UpdateAnalistaDto
  ) {
    try {
      const analistaId = parseInt(id, 10);
      
      if (isNaN(analistaId)) {
        throw new BadRequestException('ID inválido');
      }
      
      const updated = await this.analistasService.updateAnalista(analistaId, updateAnalistaDto);
      
      return {
        success: true,
        data: this.sanitizeAnalista(updated),
        message: 'Analista atualizado com sucesso',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
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

  @Put(':id/change-password')
  @UsePipes(new ValidationPipe({ transform: true }))
  async changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    try {
      const analistaId = parseInt(id, 10);
      
      if (isNaN(analistaId)) {
        throw new BadRequestException('ID inválido');
      }
      
      // Buscar analista
      const analista = await this.analistasService.findById(analistaId);
      
      if (!analista) {
        throw new NotFoundException(`Analista ${id} não encontrado`);
      }
      
      // Verificar senha atual
      const isValid = await analista.validatePassword(changePasswordDto.currentPassword);
      
      if (!isValid) {
        throw new BadRequestException('Senha atual incorreta');
      }
      
      // Atualizar senha
      const updated = await this.analistasService.updateAnalista(analistaId, {
        passwordHash: changePasswordDto.newPassword, // Será hashed
      });
      
      return {
        success: true,
        message: 'Senha alterada com sucesso',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Put(':id/activate')
  @Roles('admin', 'supervisor')
  async activateAnalista(@Param('id') id: string) {
    try {
      const analistaId = parseInt(id, 10);
      
      if (isNaN(analistaId)) {
        throw new BadRequestException('ID inválido');
      }
      
      const updated = await this.analistasService.updateAnalista(analistaId, {
        ativo: true,
      });
      
      return {
        success: true,
        data: this.sanitizeAnalista(updated),
        message: 'Analista ativado com sucesso',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
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

  @Put(':id/deactivate')
  @Roles('admin', 'supervisor')
  async deactivateAnalista(@Param('id') id: string) {
    try {
      const analistaId = parseInt(id, 10);
      
      if (isNaN(analistaId)) {
        throw new BadRequestException('ID inválido');
      }
      
      const success = await this.analistasService.deactivateAnalista(analistaId);
      
      if (!success) {
        throw new NotFoundException(`Analista ${id} não encontrado`);
      }
      
      return {
        success: true,
        message: 'Analista desativado com sucesso',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ========== DELETE ==========
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin') // Apenas admin pode deletar permanentemente
  async deleteAnalista(@Param('id') id: string) {
    try {
      const analistaId = parseInt(id, 10);
      
      if (isNaN(analistaId)) {
        throw new BadRequestException('ID inválido');
      }
      
      const success = await this.analistasService.deactivateAnalista(analistaId);
      
      if (!success) {
        throw new NotFoundException(`Analista ${id} não encontrado`);
      }
      
      // Em produção, você pode querer deletar realmente
      // await this.analistaRepository.delete(analistaId);
      
      return; // 204 No Content
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw error;
    }
  }

  // ========== MÉTODOS AUXILIARES ==========
  private sanitizeAnalista(analista: Analista): any {
    const { passwordHash, ...sanitized } = analista;
    return sanitized;
  }
}