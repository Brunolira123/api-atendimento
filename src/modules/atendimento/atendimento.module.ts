import { Module } from '@nestjs/common';
import { AtendimentoController } from './atendimento.controller';

@Module({
  controllers: [AtendimentoController],
})
export class AtendimentoModule {}