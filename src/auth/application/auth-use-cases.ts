import { createHash, randomBytes } from 'node:crypto';
import { TooManyRequests, Unauthenticated } from '../../shared/application/errors.js';
import type { Clock } from '../../shared/domain/clock.js';
import { ValidationError } from '../../shared/domain/errors.js';
import type { PasswordHasher } from '../../user/application/user-use-cases.js';
import { Email } from '../../user/domain/email.js';
import { Password } from '../../user/domain/password.js';
import type { User } from '../../user/domain/user.js';
import type { UserRepository } from '../../user/domain/user-repository.js';
import { InvalidResetToken, PasswordResetToken } from '../domain/password-reset-token.js';
import type { PasswordResetTokenRepository } from '../domain/password-reset-token-repository.js';
import { ACCESS_TOKEN_TTL_SECONDS, type AccessTokens, type Mailer, type ResetRequestThrottle } from './ports.js';

/** SHA-256 em hexadecimal: é o que vai para o banco, nunca o token em texto puro. */
export function hashResetToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export interface LoginOutput {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: AccessTokens,
  ) {}

  async execute(email: string, password: string): Promise<LoginOutput> {
    let user: User | null = null;
    try {
      user = await this.users.findByEmail(Email.fromString(email));
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }
    }
    if (user === null || !(await this.hasher.verify(password, user.passwordHash))) {
      throw new Unauthenticated('E-mail ou senha inválidos.');
    }
    return {
      accessToken: await this.tokens.issue(user.id, user.restaurantId),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}

/**
 * Envia o link de redefinição. A resposta é a mesma exista ou não o e-mail; o limite vale para ambos.
 */
export class ForgotPasswordUseCase {
  static readonly MAX_REQUESTS = 5;
  static readonly WINDOW_MINUTES = 15;

  constructor(
    private readonly users: UserRepository,
    private readonly tokens: PasswordResetTokenRepository,
    private readonly throttle: ResetRequestThrottle,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
    private readonly resetUrl: string,
  ) {}

  async execute(email: string, ip: string): Promise<void> {
    const address = Email.fromString(email);
    const now = this.clock.now();
    const since = new Date(now.getTime() - ForgotPasswordUseCase.WINDOW_MINUTES * 60_000);
    const { MAX_REQUESTS, WINDOW_MINUTES } = ForgotPasswordUseCase;
    if (
      (await this.throttle.countByEmailSince(address.value, since)) >= MAX_REQUESTS ||
      (await this.throttle.countByIpSince(ip, since)) >= MAX_REQUESTS
    ) {
      throw new TooManyRequests('Muitos pedidos de recuperação. Tente de novo em alguns minutos.', WINDOW_MINUTES * 60);
    }
    await this.throttle.record(address.value, ip, now);
    const user = await this.users.findByEmail(address);
    if (user === null) {
      return;
    }
    const plain = randomBytes(32).toString('hex');
    await this.tokens.invalidateOpenTokensOf(user.id, now);
    await this.tokens.save(PasswordResetToken.issue(user.id, hashResetToken(plain), now));
    const separator = this.resetUrl.includes('?') ? '&' : '?';
    await this.mailer.sendPasswordReset(user.email.value, user.name, `${this.resetUrl}${separator}token=${plain}`);
  }
}

/**
 * Troca a senha com o token do e-mail. JWTs já emitidos continuam valendo até vencer (no máximo 1 hora).
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: PasswordResetTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(plainToken: string, newPassword: string): Promise<void> {
    const password = Password.fromString(newPassword);
    const now = this.clock.now();
    const token = await this.tokens.findByHash(hashResetToken(plainToken));
    if (token === null) {
      throw new InvalidResetToken();
    }
    token.consume(now);
    const user = await this.users.findById(token.userId);
    if (user === null) {
      throw new InvalidResetToken();
    }
    user.changePassword(await this.hasher.hash(password));
    await this.users.save(user);
    await this.tokens.save(token);
  }
}
