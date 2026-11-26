import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { bodyOf } from '../../shared/http/http-kit.js';
import type { ForgotPasswordUseCase, LoginUseCase, ResetPasswordUseCase } from '../application/auth-use-cases.js';

const LoginBody = Type.Object({
  email: Type.String({ examples: ['admin@bardojoao.com'] }),
  password: Type.String({ examples: ['goomer123'] }),
});
const ForgotBody = Type.Object({ email: Type.String() });
const ResetBody = Type.Object({
  token: Type.String({ description: 'Valor de token= do link do e-mail' }),
  password: Type.String({ description: 'Nova senha, com pelo menos 8 caracteres' }),
});

export interface AuthRouteDeps {
  login: LoginUseCase;
  forgotPassword: ForgotPasswordUseCase;
  resetPassword: ResetPasswordUseCase;
}

/** Rotas sem token: servem justamente a quem ainda não tem um. */
export function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const tags = ['Autenticação'];

  app.post(
    '/auth/login',
    { schema: { tags, summary: 'Troca e-mail e senha por um JWT de 1 hora', body: LoginBody } },
    (request) => {
      const body = bodyOf(request, LoginBody);
      return deps.login.execute(body.email, body.password);
    },
  );

  app.post(
    '/auth/forgot-password',
    { schema: { tags, summary: 'Envia o link de redefinição (responde sempre 202)', body: ForgotBody } },
    async (request, reply) => {
      await deps.forgotPassword.execute(bodyOf(request, ForgotBody).email, request.ip);
      return reply
        .code(202)
        .send({ message: 'Se o e-mail estiver cadastrado, você vai receber um link para redefinir a senha.' });
    },
  );

  app.post(
    '/auth/reset-password',
    { schema: { tags, summary: 'Define a nova senha com o token do e-mail', body: ResetBody } },
    async (request, reply) => {
      const body = bodyOf(request, ResetBody);
      await deps.resetPassword.execute(body.token, body.password, request.ip);
      return reply.code(204).send();
    },
  );
}
