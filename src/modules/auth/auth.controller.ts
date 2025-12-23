// src/modules/auth/auth.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  UsePipes, 
  ValidationPipe 
} from '@nestjs/common';
import { AuthService, LoginResponse } from './auth.service';
import { IsNotEmpty, IsString } from 'class-validator';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

class ValidateTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async login(@Body() loginDto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(loginDto.username, loginDto.password);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateToken(@Body() validateTokenDto: ValidateTokenDto): Promise<LoginResponse> {
    return this.authService.validateToken(validateTokenDto.token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() validateTokenDto: ValidateTokenDto) {
    return this.authService.logout(validateTokenDto.token);
  }

  @Post('setup-admin')
  @HttpCode(HttpStatus.OK)
  async setupAdmin() {
    const success = await this.authService.createFirstAdmin();
    
    return {
      success,
      message: success 
        ? 'Admin criado com sucesso' 
        : 'Erro ao criar admin',
    };
  }
}