// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from './jwt.service';

@Module({
  imports: [ConfigModule],
  providers: [JwtService],
  exports: [JwtService], // ✅ CRUCIAL: Exportar o serviço
})
export class AuthModule {}