import { beforeEach, describe, expect, it } from 'vitest';
import {
  ForgotPasswordUseCase,
  hashResetToken,
  LoginUseCase,
  ResetPasswordUseCase,
} from '../../src/auth/application/auth-use-cases.js';
import { InvalidResetToken, PasswordResetToken } from '../../src/auth/domain/password-reset-token.js';
import { TooManyRequests, Unauthenticated } from '../../src/shared/application/errors.js';
import { ValidationError } from '../../src/shared/domain/errors.js';
import { CreateUserUseCase, DeleteUserUseCase, ListUsersUseCase } from '../../src/user/application/user-use-cases.js';
import { CannotDeleteSelf, EmailAlreadyTaken, UserNotFound } from '../../src/user/domain/user.js';
import { FixedClock } from '../support/fixed-clock.js';
import { actorOf, AuthFakes, FakeHasher, InMemoryAuditLog, InMemoryUserRepository } from '../support/in-memory.js';

describe('casos de uso de autenticação e usuários', () => {
  let users: InMemoryUserRepository;
  let fakes: AuthFakes;
  let clock: FixedClock;
  let hasher: FakeHasher;
  let adminId: number;
  let audit: InMemoryAuditLog;

  const forgot = (url = 'http://localhost:8091/reset-password') =>
    new ForgotPasswordUseCase(users, fakes, fakes, fakes, clock, audit.auditor(), url);
  const reset = () => new ResetPasswordUseCase(users, fakes, hasher, clock, audit.auditor());
  const login = () => new LoginUseCase(users, hasher, fakes);

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    fakes = new AuthFakes();
    clock = new FixedClock();
    hasher = new FakeHasher();
    audit = new InMemoryAuditLog(clock);
    adminId = (
      await new CreateUserUseCase(users, hasher, audit.auditor()).execute(1, {
        name: 'Admin',
        email: 'Admin@BarDoJoao.com',
        password: 'goomer123',
      })
    ).id;
  });

  it('login devolve token com usuário e restaurante', async () => {
    const result = await login().execute('admin@bardojoao.com', 'goomer123');

    expect(result).toEqual({
      accessToken: `token-${adminId}-1-admin@bardojoao.com`,
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
    expect(await fakes.verify(result.accessToken)).toEqual({
      userId: adminId,
      restaurantId: 1,
      email: 'admin@bardojoao.com',
    });
  });

  it('falhas de login são 401, inclusive e-mail mal formado', async () => {
    await expect(login().execute('admin@bardojoao.com', 'errada')).rejects.toThrow(Unauthenticated);
    await expect(login().execute('ninguem@bardojoao.com', 'goomer123')).rejects.toThrow('E-mail ou senha inválidos.');
    await expect(login().execute('sem-arroba', 'goomer123')).rejects.toThrow(Unauthenticated);
    await expect(fakes.verify('lixo')).rejects.toThrow(Unauthenticated);
  });

  it('usuários ficam no restaurante e o e-mail é único', async () => {
    const create = new CreateUserUseCase(users, hasher, audit.auditor());
    const bia = await create.execute(1, { name: 'Bia', email: 'bia@bardojoao.com', password: 'senha-da-bia' });
    await create.execute(2, { name: 'Caio', email: 'caio@izakaya.jp', password: 'senha-do-caio' });

    expect(bia).toEqual({ id: bia.id, restaurantId: 1, name: 'Bia', email: 'bia@bardojoao.com' });
    expect(await new ListUsersUseCase(users).execute(1)).toHaveLength(2);
    await expect(
      create.execute(2, { name: 'Bia', email: 'BIA@bardojoao.com', password: 'outra-senha' }),
    ).rejects.toThrow(EmailAlreadyTaken);
    await expect(create.execute(1, { name: 'X', email: 'x@bar.com', password: '123' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('regras de exclusão de usuário', async () => {
    const remove = new DeleteUserUseCase(users, audit.auditor());
    const bia = await new CreateUserUseCase(users, hasher, audit.auditor()).execute(1, {
      name: 'Bia',
      email: 'bia@bardojoao.com',
      password: 'senha-da-bia',
    });

    const admin = actorOf(1, adminId);
    await expect(remove.execute(admin, adminId)).rejects.toThrow(CannotDeleteSelf);
    await expect(remove.execute(actorOf(2, 99), bia.id)).rejects.toThrow(UserNotFound);
    await remove.execute(admin, bia.id);
    await expect(remove.execute(admin, bia.id)).rejects.toThrow(UserNotFound);
    expect(audit.entries.at(-1)).toMatchObject({
      actor: admin,
      action: 'user.deleted',
      entityId: bia.id,
      changes: { before: { name: 'Bia', email: 'bia@bardojoao.com' } },
    });
  });

  it('esqueci a senha e redefinição', async () => {
    await forgot().execute('admin@bardojoao.com', '10.0.0.1');

    expect(fakes.sent).toHaveLength(1);
    expect(fakes.sent[0]?.link).toMatch(/^http:\/\/localhost:8091\/reset-password\?token=[a-f0-9]{64}$/);
    const token = fakes.lastToken();
    expect(fakes.tokens.has(token)).toBe(false); // só o hash fica guardado
    expect(fakes.tokens.has(hashResetToken(token))).toBe(true);

    await expect(reset().execute(token, 'curta')).rejects.toThrow(ValidationError);
    await reset().execute(token, 'senha-nova-123');
    await expect(reset().execute(token, 'outra-senha-123')).rejects.toThrow(InvalidResetToken);
    await expect(login().execute('admin@bardojoao.com', 'goomer123')).rejects.toThrow(Unauthenticated);
    expect((await login().execute('admin@bardojoao.com', 'senha-nova-123')).tokenType).toBe('Bearer');
  });

  it('link que já tem query string ganha &token=', async () => {
    await forgot('http://front/reset?from=email').execute('admin@bardojoao.com', '10.0.0.1');

    expect(fakes.sent[0]?.link).toMatch(/\?from=email&token=/);
  });

  it('e-mail desconhecido não envia nada, mas conta para o limite', async () => {
    await forgot().execute('ninguem@bardojoao.com', '10.0.0.1');

    expect(fakes.sent).toHaveLength(0);
    expect(fakes.requests).toHaveLength(1);
  });

  it('novo pedido invalida o token anterior', async () => {
    await forgot().execute('admin@bardojoao.com', '10.0.0.1');
    const first = fakes.lastToken();
    await forgot().execute('admin@bardojoao.com', '10.0.0.1');

    await expect(reset().execute(first, 'senha-nova-123')).rejects.toThrow(InvalidResetToken);
    await reset().execute(fakes.lastToken(), 'senha-nova-123');
  });

  it('token vencido, desconhecido ou de usuário removido é recusado', async () => {
    await forgot().execute('admin@bardojoao.com', '10.0.0.1');
    const token = fakes.lastToken();
    clock.advanceMinutes(31);

    await expect(reset().execute(token, 'senha-nova-123')).rejects.toThrow(InvalidResetToken);
    await expect(reset().execute('desconhecido', 'senha-nova-123')).rejects.toThrow(InvalidResetToken);

    await fakes.save(PasswordResetToken.issue(999, hashResetToken('orfao'), clock.now()));
    await expect(reset().execute('orfao', 'senha-nova-123')).rejects.toThrow(InvalidResetToken);
  });

  it('limite de 5 pedidos por e-mail e por IP em 15 minutos', async () => {
    for (let i = 0; i < 5; i++) {
      await forgot().execute('admin@bardojoao.com', `10.0.0.${i}`);
    }
    await expect(forgot().execute('admin@bardojoao.com', '10.9.9.9')).rejects.toThrow(TooManyRequests);

    for (let i = 0; i < 5; i++) {
      await forgot().execute(`x${i}@bardojoao.com`, '10.1.1.1');
    }
    const blocked = forgot().execute('y@bardojoao.com', '10.1.1.1');
    await expect(blocked).rejects.toMatchObject({ retryAfterSeconds: 900 });

    clock.advanceMinutes(16);
    await forgot().execute('admin@bardojoao.com', '10.1.1.1');
  });
});
