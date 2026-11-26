import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { loadConfig } from '../../src/bootstrap/config.js';
import { createContainer, type Container } from '../../src/bootstrap/container.js';
import { buildHttpApp } from '../../src/bootstrap/http-app.js';
import type { Database } from '../../src/shared/infrastructure/database.js';
import { FixedClock } from '../support/fixed-clock.js';
import { TestDatabase } from '../support/test-database.js';

export const ADMIN_EMAIL = 'admin@bardojoao.com';
export const ADMIN_PASSWORD = 'goomer123';

type Body = Record<string, unknown> | unknown[] | string;

/**
 * Sobe a app Fastify inteira (container real, banco de teste, Mailpit de verdade) com o relógio fixo numa
 * quarta-feira às 18:30 de São Paulo, e manda as requisições com `app.inject`, sem abrir porta.
 */
export class Api {
  db!: Database;
  clock!: FixedClock;
  app!: FastifyInstance;
  container!: Container;
  remoteAddress = '10.0.0.1';

  static setup(): Api {
    const api = new Api();
    beforeEach(async () => {
      api.db = await TestDatabase.reset();
      api.clock = new FixedClock();
      api.remoteAddress = '10.0.0.1';
      const config = loadConfig({ ...process.env, JWT_SECRET: 'test-secret-com-pelo-menos-32-caracteres' });
      api.container = createContainer(config, { clock: api.clock, database: api.db });
      api.app = await buildHttpApp(api.container, { logger: false });
      await api.container.users.create.execute(1, { name: 'Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    });
    afterEach(async () => {
      await api.app.close();
      await api.container.close();
    });
    afterAll(() => TestDatabase.close());
    return api;
  }

  request(method: string, url: string, body?: Body, token?: string): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (token !== undefined) {
      headers['authorization'] = `Bearer ${token}`;
    }
    return this.app.inject({
      method: method as 'GET',
      url,
      headers,
      remoteAddress: this.remoteAddress,
      ...(body === undefined ? {} : { payload: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
  }

  async login(email = ADMIN_EMAIL, password = ADMIN_PASSWORD): Promise<string> {
    const response = await this.request('POST', '/api/v1/auth/login', { email, password });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<{ accessToken: string }>().accessToken;
  }

  async createProduct(token: string, product: Record<string, unknown>): Promise<number> {
    const response = await this.request('POST', '/api/v1/products', product, token);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ id: number }>().id;
  }
}
