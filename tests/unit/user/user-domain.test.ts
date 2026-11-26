import { describe, expect, it } from 'vitest';
import { InvalidResetToken, PasswordResetToken } from '../../../src/auth/domain/password-reset-token.js';
import { Email } from '../../../src/user/domain/email.js';
import { Password } from '../../../src/user/domain/password.js';
import { CannotDeleteSelf, EmailAlreadyTaken, User, UserNotFound } from '../../../src/user/domain/user.js';

describe('Email', () => {
  it('normaliza e valida', () => {
    expect(Email.fromString('  Ana@Bar.COM ').value).toBe('ana@bar.com');
    expect(() => Email.fromString('sem-arroba')).toThrow('E-mail inválido.');
    expect(() => Email.fromString('a@b')).toThrow('E-mail inválido.');
    expect(() => Email.fromString(`${'a'.repeat(250)}@bar.com`)).toThrow('E-mail inválido.');
  });
});

describe('Password', () => {
  it('tem no mínimo 8 e no máximo 128 caracteres e não se mostra', () => {
    const password = Password.fromString('segredo123');

    expect(password.plain()).toBe('segredo123');
    expect(JSON.stringify({ password })).toBe('{"password":"***"}');
    expect(String(password)).toBe('***');
    expect(() => Password.fromString('1234567')).toThrow('mínimo 8');
    expect(() => Password.fromString('x'.repeat(129))).toThrow('máximo 128');
  });
});

describe('User', () => {
  it('cadastra com nome aparado e troca a senha', () => {
    const user = User.register(1, 1, ' Ana ', Email.fromString('ana@bar.com'), 'hash-1');
    user.changePassword('hash-2');

    expect([user.name, user.passwordHash]).toEqual(['Ana', 'hash-2']);
    expect(() => User.register(1, 1, ' ', Email.fromString('ana@bar.com'), 'h')).toThrow('nome é obrigatório');
    expect(User.restore(2, 1, 'Bia', Email.fromString('bia@bar.com'), 'h').id).toBe(2);
  });

  it('erros de domínio com mensagens claras', () => {
    expect(UserNotFound.withId(9).message).toBe('Usuário 9 não encontrado.');
    expect(EmailAlreadyTaken.of(Email.fromString('ana@bar.com')).message).toContain('ana@bar.com');
    expect(new CannotDeleteSelf().field).toBe('id');
  });
});

describe('PasswordResetToken', () => {
  it('vale 30 minutos e uma única vez', () => {
    const now = new Date('2026-12-02T12:00:00Z');
    const token = PasswordResetToken.issue(1, 'hash', now);

    expect(token.expiresAt.toISOString()).toBe('2026-12-02T12:30:00.000Z');
    expect(token.isUsableAt(new Date('2026-12-02T12:29:59Z'))).toBe(true);
    expect(token.isUsableAt(new Date('2026-12-02T12:30:00Z'))).toBe(false);

    token.consume(now);
    expect(token.usedAt).toEqual(now);
    expect(() => token.consume(now)).toThrow(InvalidResetToken);
    expect(PasswordResetToken.restore('h', 1, now, null).isUsableAt(now)).toBe(false);
  });
});
