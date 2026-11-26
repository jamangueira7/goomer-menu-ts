import { describe, expect, it } from 'vitest';
import { Api, ADMIN_EMAIL, ADMIN_PASSWORD } from './api-harness.js';

const mailpit = (process.env['MAILPIT_URL'] ?? 'http://mailpit:8025').replace(/\/$/, '');

async function clearMailpit(): Promise<void> {
  await fetch(`${mailpit}/api/v1/messages`, { method: 'DELETE' });
}

/** Lê o token do link do e-mail pela API do Mailpit, como faria quem recebeu a mensagem. */
async function tokenFromMailpit(to: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    const first = messages[0];
    if (first !== undefined) {
      const message = await (await fetch(`${mailpit}/api/v1/message/${first.ID}`)).text();
      const token = /token=([a-f0-9]{64})/.exec(message)?.[1];
      if (token === undefined) {
        throw new Error(`E-mail sem token: ${message}`);
      }
      return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Nenhum e-mail para ${to} no Mailpit.`);
}

describe('autenticação e usuários (ponta a ponta, com Mailpit)', () => {
  const api = Api.setup();

  it('CRUD de usuários', async () => {
    const token = await api.login();
    const create = await api.request(
      'POST',
      '/api/v1/users',
      { name: 'Bia', email: 'bia@bardojoao.com', password: 'senha-da-bia' },
      token,
    );
    expect(create.statusCode, create.body).toBe(201);
    const bia = create.json<Record<string, unknown> & { id: number }>();
    expect(bia).not.toHaveProperty('passwordHash');
    expect(create.headers['location']).toBe(`/api/v1/users/${bia.id}`);

    const duplicate = { name: 'Bia', email: 'BIA@bardojoao.com', password: 'senha-da-bia' };
    expect((await api.request('POST', '/api/v1/users', duplicate, token)).statusCode).toBe(409);
    const short = { name: 'Curta', email: 'c@bardojoao.com', password: '123' };
    expect((await api.request('POST', '/api/v1/users', short, token)).statusCode).toBe(422);

    const list = await api.request('GET', '/api/v1/users', undefined, token);
    expect(list.json<{ data: unknown[] }>().data).toHaveLength(2);
    expect(list.body).not.toContain('argon2');
    expect(
      (await api.request('POST', '/api/v1/auth/login', { email: 'bia@bardojoao.com', password: 'senha-da-bia' }))
        .statusCode,
    ).toBe(200);

    const me = await api.login();
    const adminId = await api.db.int('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
    expect((await api.request('DELETE', `/api/v1/users/${adminId}`, undefined, me)).statusCode).toBe(422);
    expect((await api.request('DELETE', `/api/v1/users/${bia.id}`, undefined, me)).statusCode).toBe(204);
    expect((await api.request('DELETE', `/api/v1/users/${bia.id}`, undefined, me)).statusCode).toBe(404);
  });

  it('esqueci a senha e redefinição pelo Mailpit', async () => {
    await clearMailpit();
    const known = await api.request('POST', '/api/v1/auth/forgot-password', { email: ADMIN_EMAIL });
    expect(known.statusCode).toBe(202);
    const unknown = await api.request('POST', '/api/v1/auth/forgot-password', { email: 'ninguem@bardojoao.com' });
    expect(unknown.statusCode).toBe(202);
    expect(unknown.body, 'mesma resposta, exista ou não').toBe(known.body);

    const token = await tokenFromMailpit(ADMIN_EMAIL);
    const reset = (password: string) => api.request('POST', '/api/v1/auth/reset-password', { token, password });
    expect((await reset('curta')).statusCode).toBe(422);
    expect((await reset('senha-nova-123')).statusCode).toBe(204);
    expect((await reset('outra-senha-123')).statusCode, 'uso único').toBe(422);
    expect(
      (await api.request('POST', '/api/v1/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).statusCode,
    ).toBe(401);
    await api.login(ADMIN_EMAIL, 'senha-nova-123');
  });

  it('limite de pedidos de recuperação: 429 com Retry-After', async () => {
    api.remoteAddress = '10.1.1.1';
    for (let i = 0; i < 5; i++) {
      const response = await api.request('POST', '/api/v1/auth/forgot-password', { email: `x${i}@bardojoao.com` });
      expect(response.statusCode).toBe(202);
    }
    const blocked = await api.request('POST', '/api/v1/auth/forgot-password', { email: 'y@bardojoao.com' });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBe('900');

    api.clock.advanceMinutes(16);
    expect((await api.request('POST', '/api/v1/auth/forgot-password', { email: 'y@bardojoao.com' })).statusCode).toBe(
      202,
    );
  });
});
