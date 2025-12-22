
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '../modules/auth/jwt.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [JwtService],
  exports: [JwtService],
})
export class SharedModule {}