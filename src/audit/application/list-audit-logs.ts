import { ValidationError } from '../../shared/domain/errors.js';
import type { Clock } from '../../shared/domain/clock.js';
import type { Timezone } from '../../shared/domain/timezone.js';
import { RestaurantNotFound, type RestaurantRepository } from '../../menu/domain/restaurant.js';
import { UserNotFound } from '../../user/domain/user.js';
import type { UserRepository } from '../../user/domain/user-repository.js';
import { AuditPeriod } from '../domain/audit-period.js';

/** Linha do log como o banco guarda (a hora em UTC). */
export interface StoredAuditEntry {
  id: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: number | null;
  changes: Record<string, unknown>;
  ip: string | null;
  createdAt: Date;
}

export interface AuditSearch {
  restaurantId: number;
  actorUserId: number;
  from: Date;
  until: Date;
  page: number;
  perPage: number;
}

/** Porta de leitura do log (no Postgres, pelo índice restaurant_id + actor_user_id + created_at). */
export interface AuditLogReader {
  search(query: AuditSearch): Promise<{ items: StoredAuditEntry[]; total: number }>;
  /** E-mail gravado na entrada mais recente do ator, para quem já foi excluído; null se ele nunca agiu ali. */
  lastActorEmail(restaurantId: number, actorUserId: number): Promise<string | null>;
}

export interface AuditLogQuery {
  dateIni: string;
  dateEnd?: string | null | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export interface AuditLogPage {
  data: {
    id: number;
    action: string;
    entityType: string;
    entityId: number | null;
    changes: Record<string, unknown>;
    ip: string | null;
    createdAt: string;
  }[];
  user: { id: number; email: string };
  meta: { page: number; perPage: number; total: number };
}

/**
 * Log de um usuário (o ator) num período, mais recente primeiro. Usuário de outro restaurante ou que nunca existiu
 * é 404; usuário já excluído, mas com log no restaurante, devolve o log normalmente.
 */
export class ListAuditLogsUseCase {
  static readonly MAX_PER_PAGE = 100;

  constructor(
    private readonly restaurants: RestaurantRepository,
    private readonly users: UserRepository,
    private readonly reader: AuditLogReader,
    private readonly clock: Clock,
  ) {}

  async execute(restaurantId: number, actorUserId: number, query: AuditLogQuery): Promise<AuditLogPage> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;
    if (page < 1 || perPage < 1 || perPage > ListAuditLogsUseCase.MAX_PER_PAGE) {
      throw new ValidationError('page precisa ser >= 1 e perPage entre 1 e 100.', 'page');
    }
    const timezone = await this.timezoneOf(restaurantId);
    const period = AuditPeriod.of(query.dateIni, query.dateEnd ?? null, timezone, this.clock.now());
    const email =
      (await this.users.find(restaurantId, actorUserId))?.email.value ??
      (await this.reader.lastActorEmail(restaurantId, actorUserId));
    if (email === null) {
      throw UserNotFound.withId(actorUserId);
    }
    const { items, total } = await this.reader.search({
      restaurantId,
      actorUserId,
      from: period.from,
      until: period.until,
      page,
      perPage,
    });
    return {
      data: items.map(({ actorEmail: _email, createdAt, ...entry }) => ({
        ...entry,
        createdAt: timezone.localize(createdAt).iso,
      })),
      user: { id: actorUserId, email },
      meta: { page, perPage, total },
    };
  }

  private async timezoneOf(restaurantId: number): Promise<Timezone> {
    const restaurant = await this.restaurants.find(restaurantId);
    if (restaurant === null) {
      throw RestaurantNotFound.withId(restaurantId);
    }
    return restaurant.timezone;
  }
}
