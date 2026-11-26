import type { PasswordResetToken } from './password-reset-token.js';

export interface PasswordResetTokenRepository {
  /** Grava um token novo ou o uso de um existente (pelo hash). */
  save(token: PasswordResetToken): Promise<void>;
  findByHash(tokenHash: string): Promise<PasswordResetToken | null>;
  /** Um novo pedido invalida os anteriores ainda não usados. */
  invalidateOpenTokensOf(userId: number, now: Date): Promise<void>;
}
