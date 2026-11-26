import argon2 from 'argon2';
import type { PasswordHasher } from '../application/user-use-cases.js';
import type { Password } from '../domain/password.js';

/** Argon2id com os parâmetros padrão da biblioteca (64 MiB, 3 passadas). */
export class Argon2idPasswordHasher implements PasswordHasher {
  hash(password: Password): Promise<string> {
    return argon2.hash(password.plain(), { type: argon2.argon2id });
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash corrompido ou de outro formato: trata como senha errada.
      return false;
    }
  }
}
