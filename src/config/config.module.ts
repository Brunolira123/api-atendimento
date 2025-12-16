import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_NAME: Joi.string().required(),
        DB_USER: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        
        DISCORD_TOKEN: Joi.string().optional(),
        DISCORD_CLIENT_ID: Joi.string().optional(),
        DISCORD_GUILD_ID: Joi.string().optional(),
        DISCORD_WEBHOOK_URL: Joi.string().optional(),
        
        WHATSAPP_SESSION_PATH: Joi.string().default('./whatsapp-sessions'),
        WHATSAPP_CLIENT_ID: Joi.string().default('vr-atendimento-bot'),
        
        LOG_LEVEL: Joi.string()
          .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
          .default('info'),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
  ],
})
export class AppConfigModule {}