import type { DatabaseConfig } from '../shared/infrastructure/database.js';

/** Configuração lida do ambiente (12-factor; os segredos nunca vão para o Git). */
export interface Config {
  appEnv: string;
  port: number;
  database: DatabaseConfig;
  jwtSecret: string;
  resetUrl: string;
  mailerDsn: string;
  mailFrom: string;
}

type Env = Record<string, string | undefined>;

function get(env: Env, name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value === '' ? fallback : value;
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Variável de ambiente ${name} não definida.`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): Config {
  return {
    appEnv: get(env, 'APP_ENV', 'prod'),
    port: Number(get(env, 'PORT', '8080')),
    database: {
      host: get(env, 'DB_HOST', 'db'),
      port: Number(get(env, 'DB_PORT', '5432')),
      name: get(env, 'DB_NAME', 'goomer'),
      user: get(env, 'DB_USER', 'goomer'),
      password: get(env, 'DB_PASSWORD', 'goomer'),
    },
    jwtSecret: required(env, 'JWT_SECRET'),
    resetUrl: get(env, 'APP_RESET_URL', 'http://localhost:8091/reset-password'),
    mailerDsn: get(env, 'MAILER_DSN', 'smtp://mailpit:1025'),
    mailFrom: get(env, 'MAIL_FROM', 'Goomer Menu <no-reply@goomer.local>'),
  };
}
