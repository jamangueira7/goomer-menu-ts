import type { Database } from '../../shared/infrastructure/database.js';
import type { ResetRequestThrottle } from '../application/ports.js';
import { PasswordResetToken } from '../domain/password-reset-token.js';
import type { PasswordResetTokenRepository } from '../domain/password-reset-token-repository.js';

interface TokenRow {
  token_hash: string;
  user_id: number;
  expires_at: Date;
  used_at: Date | null;
}

export class PgPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly db: Database) {}

  async save(token: PasswordResetToken): Promise<void> {
    await this.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO UPDATE SET used_at = EXCLUDED.used_at`,
      [token.userId, token.tokenHash, token.expiresAt, token.usedAt],
    );
  }

  async findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.db.one<TokenRow>(
      'SELECT token_hash, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    return row === null ? null : PasswordResetToken.restore(row.token_hash, row.user_id, row.expires_at, row.used_at);
  }

  async invalidateOpenTokensOf(userId: number, now: Date): Promise<void> {
    await this.db.query('UPDATE password_reset_tokens SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL', [
      now,
      userId,
    ]);
  }
}

export class PgResetRequestThrottle implements ResetRequestThrottle {
  constructor(private readonly db: Database) {}

  countByEmailSince(email: string, since: Date): Promise<number> {
    return this.db.int('SELECT count(*) FROM password_reset_requests WHERE email = $1 AND requested_at > $2', [
      email,
      since,
    ]);
  }

  countByIpSince(ip: string, since: Date): Promise<number> {
    return this.db.int('SELECT count(*) FROM password_reset_requests WHERE ip = $1 AND requested_at > $2', [ip, since]);
  }

  async record(email: string, ip: string, at: Date): Promise<void> {
    await this.db.query('INSERT INTO password_reset_requests (email, ip, requested_at) VALUES ($1, $2, $3)', [
      email,
      ip,
      at,
    ]);
  }
}
