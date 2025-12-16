import { createLogger, format, transports } from 'winston';
import * as path from 'path';
import * as fs from 'fs';

const logDir = 'logs';

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json(),
  ),
  transports: [
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
    }),
    new transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
    }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(
          ({ timestamp, level, message }) =>
            `${timestamp} [${level}]: ${message}`,
        ),
      ),
    }),
  ],
});

export class AppLogger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  log(message: string, meta?: any) {
    logger.info(`[${this.context}] ${message}`, meta);
  }

  error(message: string, trace?: string, meta?: any) {
    logger.error(`[${this.context}] ${message}`, {
      trace,
      ...meta,
    });
  }

  warn(message: string, meta?: any) {
    logger.warn(`[${this.context}] ${message}`, meta);
  }

  debug(message: string, meta?: any) {
    logger.debug(`[${this.context}] ${message}`, meta);
  }
}