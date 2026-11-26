import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashResetToken } from '../../src/auth/application/auth-use-cases.js';
import { PasswordResetToken } from '../../src/auth/domain/password-reset-token.js';
import { JoseAccessTokens } from '../../src/auth/infrastructure/jose-access-tokens.js';
import { NodemailerMailer } from '../../src/auth/infrastructure/nodemailer-mailer.js';
import {
  PgPasswordResetTokenRepository,
  PgResetRequestThrottle,
} from '../../src/auth/infrastructure/pg-auth-stores.js';
import { Unauthenticated } from '../../src/shared/application/errors.js';
import { Email } from '../../src/user/domain/email.js';
import { Password } from '../../src/user/domain/password.js';
import { EmailAlreadyTaken, User } from '../../src/user/domain/user.js';
import { Argon2idPasswordHasher } from '../../src/user/infrastructure/argon2id-password-hasher.js';
import { PgUserRepository } from '../../src/user/infrastructure/pg-user-repository.js';
import { FixedClock } from '../support/fixed-clock.js';
import { TestDatabase } from '../support/test-database.js';

describe('repositórios pg de usuários e autenticação, Argon2id e JWT', () => {
  let users: PgUserRepository;

  beforeEach(async () => {
    users = new PgUserRepository(await TestDatabase.reset());
  });

  afterAll(() => TestDatabase.close());

  async function user(restaurant: number, email: string): Promise<User> {
    const created = User.register(await users.nextId(), restaurant, 'Pessoa', Email.fromString(email), 'hash');
    await users.save(created);
    return created;
  }

  it('cumpre o contrato do repositório de usuários', async () => {
    const ana = await user(1, 'ana@bar.com');
    await user(2, 'bia@rest.com');

    expect((await users.findByEmail(Email.fromString('ANA@bar.com')))?.id).toBe(ana.id);
    expect(await users.find(1, ana.id)).not.toBeNull();
    expect(await users.find(2, ana.id)).toBeNull();
    expect(await users.ofRestaurant(1)).toHaveLength(1);

    ana.changePassword('novo-hash');
    await users.save(ana);
    expect((await users.findById(ana.id))?.passwordHash).toBe('novo-hash');
    await users.delete(ana.id);
    expect(await users.findById(ana.id)).toBeNull();
  });

  it('o banco garante o e-mail único', async () => {
    await user(1, 'ana@bar.com');

    await expect(user(2, 'ana@bar.com')).rejects.toThrow(EmailAlreadyTaken);
  });

  it('tokens de redefinição guardam só o hash; o limite conta por e-mail e por IP', async () => {
    const db = TestDatabase.db();
    const tokens = new PgPasswordResetTokenRepository(db);
    const ana = await user(1, 'ana@bar.com');
    const now = new Date('2026-12-02T12:00:00Z');

    await tokens.save(PasswordResetToken.issue(ana.id, hashResetToken('abc'), now));
    const found = await tokens.findByHash(hashResetToken('abc'));
    expect(found?.isUsableAt(new Date('2026-12-02T12:29:00Z'))).toBe(true);
    expect(await db.int("SELECT count(*) FROM password_reset_tokens WHERE token_hash = 'abc'")).toBe(0);

    await tokens.invalidateOpenTokensOf(ana.id, now);
    expect((await tokens.findByHash(hashResetToken('abc')))?.isUsableAt(now)).toBe(false);
    expect(await tokens.findByHash('nada')).toBeNull();

    const throttle = new PgResetRequestThrottle(db);
    await throttle.record('ana@bar.com', '10.0.0.1', now);
    await throttle.record('ana@bar.com', '10.0.0.2', new Date('2026-12-02T11:40:00Z'));
    const since = new Date('2026-12-02T11:45:00Z');
    expect(await throttle.countByEmailSince('ana@bar.com', since)).toBe(1);
    expect(await throttle.countByIpSince('10.0.0.1', since)).toBe(1);
  });

  it('Argon2id de verdade', async () => {
    const hasher = new Argon2idPasswordHasher();
    const hash = await hasher.hash(Password.fromString('senha-forte'));

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify('senha-forte', hash)).toBe(true);
    expect(await hasher.verify('errada', hash)).toBe(false);
    expect(await hasher.verify('qualquer', 'hash-corrompido')).toBe(false);
  });

  it('JWT HS256 leva usuário e restaurante e vence em 1 hora', async () => {
    const clock = new FixedClock('2026-12-02T12:00:00Z');
    const jwt = new JoseAccessTokens('s'.repeat(32), clock);
    const token = await jwt.issue(5, 1, 'ana@bar.com');

    expect(await jwt.verify(token)).toEqual({ userId: 5, restaurantId: 1, email: 'ana@bar.com' });
    await expect(jwt.verify(`${token}x`)).rejects.toThrow(Unauthenticated);
    await expect(new JoseAccessTokens('o'.repeat(32), clock).verify(token)).rejects.toThrow(Unauthenticated);
    clock.advanceMinutes(61);
    await expect(jwt.verify(token)).rejects.toThrow('Token inválido ou vencido.');
    expect(() => new JoseAccessTokens('curto', clock)).toThrow('32 caracteres');
  });

  it('falha de SMTP vai para o log, sem exceção', async () => {
    const mailer = NodemailerMailer.fromDsn('smtp://127.0.0.1:1', 'Goomer <no-reply@goomer.local>');

    await expect(mailer.sendPasswordReset('ana@bar.com', 'Ana', 'http://x/?token=1')).resolves.toBeUndefined();
    mailer.close();
  });
});
