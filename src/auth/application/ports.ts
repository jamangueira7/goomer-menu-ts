/** Quem está chamando: o restaurante das rotas protegidas vem sempre daqui, nunca da URL. */
export interface AuthContext {
  userId: number;
  restaurantId: number;
  /** Cópia do e-mail no token, para o log de auditoria não precisar de outra consulta. */
  email: string;
}

/** Emissão e verificação do token de acesso (JWT HS256 na infraestrutura). */
export interface AccessTokens {
  issue(userId: number, restaurantId: number, email: string): Promise<string>;
  /** Lança Unauthenticated se o token for inválido ou estiver vencido. */
  verify(token: string): Promise<AuthContext>;
}

export const ACCESS_TOKEN_TTL_SECONDS = 3600;

/**
 * Porta de envio de e-mail. A implementação registra falhas de SMTP no log e não lança exceção,
 * para que forgot-password continue respondendo 202.
 */
export interface Mailer {
  sendPasswordReset(toEmail: string, toName: string, resetLink: string): Promise<void>;
}

/** Registro dos pedidos de recuperação, para o limite por e-mail e por IP. */
export interface ResetRequestThrottle {
  countByEmailSince(email: string, since: Date): Promise<number>;
  countByIpSince(ip: string, since: Date): Promise<number>;
  record(email: string, ip: string, at: Date): Promise<void>;
}
