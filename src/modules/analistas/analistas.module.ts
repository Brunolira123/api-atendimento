import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalistasService } from './analistas.service';
import { AnalistasController } from './analistas.controller';
import { Analista } from '../../shared/entities/analistas.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Analista])],
  controllers: [AnalistasController],
  providers: [AnalistasService],
  exports: [AnalistasService],
})
export class AnalistasModule {}