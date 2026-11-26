import { ValidationError } from '../../shared/domain/errors.js';

export class InvalidResetToken extends ValidationError {
  constructor() {
    super('Token de redefinição inválido, já usado ou vencido.', 'token');
  }
}

/**
 * Pedido de redefinição de senha. Guarda só o hash SHA-256 do token; vale 30 minutos e uma única vez.
 */
export class PasswordResetToken {
  static readonly TTL_MINUTES = 30;

  private constructor(
    readonly tokenHash: string,
    readonly userId: number,
    readonly expiresAt: Date,
    private _usedAt: Date | null,
  ) {}

  /** O hash vem pronto da aplicação: o domínio não depende de biblioteca de criptografia. */
  static issue(userId: number, tokenHash: string, now: Date): PasswordResetToken {
    return new PasswordResetToken(
      tokenHash,
      userId,
      new Date(now.getTime() + PasswordResetToken.TTL_MINUTES * 60_000),
      null,
    );
  }

  static restore(tokenHash: string, userId: number, expiresAt: Date, usedAt: Date | null): PasswordResetToken {
    return new PasswordResetToken(tokenHash, userId, expiresAt, usedAt);
  }

  isUsableAt(now: Date): boolean {
    return this._usedAt === null && now.getTime() < this.expiresAt.getTime();
  }

  consume(now: Date): void {
    if (!this.isUsableAt(now)) {
      throw new InvalidResetToken();
    }
    this._usedAt = now;
  }

  get usedAt(): Date | null {
    return this._usedAt;
  }
}
