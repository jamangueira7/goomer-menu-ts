import { jwtVerify, SignJWT } from 'jose';
import { Unauthenticated } from '../../shared/application/errors.js';
import type { Clock } from '../../shared/domain/clock.js';
import { ACCESS_TOKEN_TTL_SECONDS, type AccessTokens, type AuthContext } from '../application/ports.js';

const ALGORITHM = 'HS256';

/**
 * JWT HS256 com validade de 1 hora: `sub` é o id do usuário e `rid` o do restaurante.
 * A hora de emissão e a de verificação vêm do mesmo `Clock`, então os testes controlam o vencimento.
 */
export class JoseAccessTokens implements AccessTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly clock: Clock,
  ) {
    if (secret.length < 32) {
      throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
    }
    this.key = new TextEncoder().encode(secret);
  }

  issue(userId: number, restaurantId: number): Promise<string> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ rid: restaurantId })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(String(userId))
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  async verify(token: string): Promise<AuthContext> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        currentDate: this.clock.now(),
        requiredClaims: ['sub', 'exp'],
      }));
    } catch {
      throw new Unauthenticated('Token inválido ou vencido.');
    }
    const userId = Number(payload.sub);
    const restaurantId = payload['rid'];
    if (!Number.isSafeInteger(userId) || typeof restaurantId !== 'number' || !Number.isSafeInteger(restaurantId)) {
      throw new Unauthenticated('Token sem usuário ou restaurante.');
    }
    return { userId, restaurantId };
  }
}
