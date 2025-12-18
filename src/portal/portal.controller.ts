// src/portal/portal.controller.ts
import { Controller, Get, Param, Res, Query } from '@nestjs/common';
import { Response } from 'express';
import { Solicitacao } from '../shared/entities/solicitacao.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Controller('portal')
export class PortalController {
  constructor(
    @InjectRepository(Solicitacao)
    private solicitacaoRepository: Repository<Solicitacao>,
  ) {}

  @Get('solicitacao/:id')
  async getSolicitacaoData(
    @Param('id') id: string,
    @Query('atendente') atendente?: string,
    @Query('discordId') discordId?: string,
  ) {
    try {
      const solicitacao = await this.solicitacaoRepository.findOne({
        where: { solicitacaoId: id },
      });

      if (!solicitacao) {
        return {
          success: false,
          error: 'Solicitação não encontrada',
        };
      }

      // Se veio do Discord, atualizar atendente
      if (atendente && discordId) {
        solicitacao.atendenteDiscord = atendente;
        solicitacao.status = 'em_atendimento';
        await this.solicitacaoRepository.save(solicitacao);
      }

      return {
        success: true,
        data: {
          id: solicitacao.solicitacaoId,
          whatsapp_id: solicitacao.whatsappId,
          customer_name: solicitacao.nomeResponsavel,
          razao_social: solicitacao.razaoSocial,
          cnpj: solicitacao.cnpj,
          tipo_problema: solicitacao.tipoProblema,
          descricao: solicitacao.descricao,
          status: solicitacao.status,
          atendente_discord: solicitacao.atendenteDiscord,
          created_at: solicitacao.createdAt,
          finalizado_em: solicitacao.finalizadoEm,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}