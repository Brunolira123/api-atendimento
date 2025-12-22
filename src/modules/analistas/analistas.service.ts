import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Analista } from '../../shared/entities/analistas.entity';

@Injectable()
export class AnalistasService {
  private readonly logger = new Logger(AnalistasService.name);

  constructor(
    @InjectRepository(Analista)
    private readonly analistaRepository: Repository<Analista>,
  ) {}

  async findById(id: number): Promise<Analista | null> {
    try {
      return await this.analistaRepository.findOne({
        where: { id, ativo: true },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar analista ${id}: ${error.message}`);
      return null;
    }
  }

  async findByUsername(username: string): Promise<Analista | null> {
    try {
      return await this.analistaRepository.findOne({
        where: { username, ativo: true },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar analista ${username}: ${error.message}`);
      return null;
    }
  }

  async validateCredentials(username: string, password: string): Promise<Analista | null> {
    try {
      const analista = await this.findByUsername(username);
      
      if (!analista) {
        return null;
      }

      const isValid = await analista.validatePassword(password);
      
      return isValid ? analista : null;
    } catch (error) {
      this.logger.error(`❌ Erro ao validar credenciais: ${error.message}`);
      return null;
    }
  }

  async createAnalista(data: Partial<Analista>): Promise<Analista> {
    try {
      const analista = this.analistaRepository.create(data);
      return await this.analistaRepository.save(analista);
    } catch (error) {
      this.logger.error(`❌ Erro ao criar analista: ${error.message}`);
      throw error;
    }
  }

  async updateAnalista(id: number, data: Partial<Analista>): Promise<Analista> {
    try {
      await this.analistaRepository.update(id, data);
      const updated = await this.findById(id);
      
      if (!updated) {
        throw new NotFoundException(`Analista ${id} não encontrado`);
      }
      
      return updated;
    } catch (error) {
      this.logger.error(`❌ Erro ao atualizar analista: ${error.message}`);
      throw error;
    }
  }

  async deactivateAnalista(id: number): Promise<boolean> {
    try {
      const result = await this.analistaRepository.update(id, { ativo: false });
      return result.affected > 0;
    } catch (error) {
      this.logger.error(`❌ Erro ao desativar analista: ${error.message}`);
      return false;
    }
  }

  async getAllAnalistas(): Promise<Analista[]> {
    try {
      return await this.analistaRepository.find({
        where: { ativo: true },
        order: { nomeCompleto: 'ASC' },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar analistas: ${error.message}`);
      return [];
    }
  }

  async getAnalistasPorDepartamento(departamentoId: number): Promise<Analista[]> {
    try {
      return await this.analistaRepository.find({
        where: { departamentoId, ativo: true },
        order: { nomeCompleto: 'ASC' },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar analistas por departamento: ${error.message}`);
      return [];
    }
  }

  async getAnalistasPorRole(role: string): Promise<Analista[]> {
    try {
      return await this.analistaRepository.find({
        where: { role, ativo: true },
        order: { nomeCompleto: 'ASC' },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao buscar analistas por role: ${error.message}`);
      return [];
    }
  }

  async countAnalistasAtivos(): Promise<number> {
    try {
      return await this.analistaRepository.count({
        where: { ativo: true },
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao contar analistas: ${error.message}`);
      return 0;
    }
  }
}