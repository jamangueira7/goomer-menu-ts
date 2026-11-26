import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { authOf } from '../../auth/http/jwt-guard.js';
import { intFromQuery, QueryInt, queryOf, routeId } from '../../shared/http/http-kit.js';
import type { ListAuditLogsUseCase } from '../application/list-audit-logs.js';

const AuditQuery = Type.Object({
  dateIni: Type.String({ description: 'Dia inicial (AAAA-MM-DD), no fuso do restaurante', examples: ['2026-11-25'] }),
  dateEnd: Type.Optional(
    Type.String({ description: 'Dia final, inclusivo; sem ele, vai até agora', examples: ['2026-11-26'] }),
  ),
  page: Type.Optional(QueryInt),
  perPage: Type.Optional(QueryInt),
});
const IdParams = Type.Object({ id: Type.String({ description: 'Usuário cujas ações se quer ver' }) });

export function auditRoutes(app: FastifyInstance, list: ListAuditLogsUseCase): void {
  app.get(
    '/users/:id/audit-logs',
    {
      schema: {
        tags: ['Auditoria'],
        security: [{ bearerAuth: [] }],
        summary: 'Log de auditoria de um usuário por período (mais recente primeiro)',
        params: IdParams,
        querystring: AuditQuery,
      },
    },
    (request) => {
      const query = queryOf(request, AuditQuery);
      return list.execute(authOf(request).restaurantId, routeId(request), {
        dateIni: query.dateIni,
        dateEnd: query.dateEnd || null,
        page: intFromQuery(query.page),
        perPage: intFromQuery(query.perPage),
      });
    },
  );
}
