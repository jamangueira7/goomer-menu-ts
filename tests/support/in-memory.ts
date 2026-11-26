import type { AuditLogReader, AuditSearch, StoredAuditEntry } from '../../src/audit/application/list-audit-logs.js';
import {
  Auditor,
  type Actor,
  type AuditEntry,
  type AuditLog,
  type TransactionManager,
} from '../../src/shared/application/audit.js';
import type { Clock } from '../../src/shared/domain/clock.js';
import { FixedClock } from './fixed-clock.js';
import type { AccessTokens, AuthContext, Mailer, ResetRequestThrottle } from '../../src/auth/application/ports.js';
import { PasswordResetToken } from '../../src/auth/domain/password-reset-token.js';
import type { PasswordResetTokenRepository } from '../../src/auth/domain/password-reset-token-repository.js';
import type { MenuItem, MenuReader } from '../../src/menu/application/get-menu.js';
import type { Restaurant, RestaurantRepository } from '../../src/menu/domain/restaurant.js';
import { Category } from '../../src/product/domain/category.js';
import { Product } from '../../src/product/domain/product.js';
import type { ProductRepository, ProductSearch } from '../../src/product/domain/product-repository.js';
import { Promotion } from '../../src/promotion/domain/promotion.js';
import type { PromotionRepository } from '../../src/promotion/domain/promotion-repository.js';
import { Unauthenticated } from '../../src/shared/application/errors.js';
import type { LocalMoment } from '../../src/shared/domain/local-moment.js';
import type { PasswordHasher } from '../../src/user/application/user-use-cases.js';
import type { Email } from '../../src/user/domain/email.js';
import type { Password } from '../../src/user/domain/password.js';
import { User } from '../../src/user/domain/user.js';
import type { UserRepository } from '../../src/user/domain/user-repository.js';

/** Cópia da entidade, para o teste não enxergar mudanças feitas fora do `save` (como um banco faria). */
const copyProduct = (p: Product): Product =>
  Product.restore({
    id: p.id,
    restaurantId: p.restaurantId,
    name: p.name,
    price: p.price,
    category: p.category,
    visible: p.visible,
    position: p.position,
    availability: p.availability,
  });
const copyPromotion = (p: Promotion): Promotion =>
  Promotion.restore(p.id, p.productId, p.description, p.price, p.windows);
const copyUser = (u: User): User => User.restore(u.id, u.restaurantId, u.name, u.email, u.passwordHash);

export class InMemoryProductRepository implements ProductRepository {
  readonly items = new Map<number, Product>();
  private sequence = 0;

  nextId(): Promise<number> {
    return Promise.resolve(++this.sequence);
  }

  save(product: Product): Promise<void> {
    this.items.set(product.id, copyProduct(product));
    return Promise.resolve();
  }

  find(restaurantId: number, id: number): Promise<Product | null> {
    const product = this.items.get(id);
    return Promise.resolve(product?.belongsTo(restaurantId) ? copyProduct(product) : null);
  }

  search(restaurantId: number, filter: ProductSearch): Promise<{ items: Product[]; total: number }> {
    const matching = this.ordered(restaurantId).filter(
      (p) =>
        (filter.category === null || p.category === filter.category) &&
        (filter.visible === null || p.visible === filter.visible),
    );
    const start = (filter.page - 1) * filter.perPage;
    return Promise.resolve({
      items: matching.slice(start, start + filter.perPage).map(copyProduct),
      total: matching.length,
    });
  }

  lastPosition(restaurantId: number): Promise<number> {
    return Promise.resolve(Math.max(0, ...this.ordered(restaurantId).map((p) => p.position)));
  }

  idsOf(restaurantId: number): Promise<number[]> {
    return Promise.resolve(this.ordered(restaurantId).map((p) => p.id));
  }

  savePositions(restaurantId: number, positions: ReadonlyMap<number, number>): Promise<void> {
    for (const [id, position] of positions) {
      const product = this.items.get(id);
      if (product?.belongsTo(restaurantId)) {
        product.moveTo(position);
      }
    }
    return Promise.resolve();
  }

  delete(restaurantId: number, id: number): Promise<void> {
    if (this.items.get(id)?.belongsTo(restaurantId)) {
      this.items.delete(id);
    }
    return Promise.resolve();
  }

  ordered(restaurantId: number): Product[] {
    return [...this.items.values()]
      .filter((p) => p.belongsTo(restaurantId))
      .sort((a, b) => a.position - b.position || a.id - b.id);
  }
}

/** Promoções em memória; o "ON DELETE CASCADE" vem de consultar o repositório de produtos. */
export class InMemoryPromotionRepository implements PromotionRepository {
  readonly items = new Map<number, Promotion>();
  private sequence = 0;

  constructor(private readonly products: InMemoryProductRepository) {}

  nextId(): Promise<number> {
    return Promise.resolve(++this.sequence);
  }

  save(promotion: Promotion): Promise<void> {
    this.items.set(promotion.id, copyPromotion(promotion));
    return Promise.resolve();
  }

  find(restaurantId: number, id: number): Promise<Promotion | null> {
    const promotion = this.alive().find((p) => p.id === id);
    const owner = promotion && this.products.items.get(promotion.productId);
    return Promise.resolve(promotion && owner?.belongsTo(restaurantId) ? copyPromotion(promotion) : null);
  }

  ofProduct(productId: number): Promise<Promotion[]> {
    return Promise.resolve(
      this.alive()
        .filter((p) => p.productId === productId)
        .map(copyPromotion),
    );
  }

  ofRestaurant(restaurantId: number, productId: number | null): Promise<Promotion[]> {
    return Promise.resolve(
      this.alive()
        .filter((p) => this.products.items.get(p.productId)?.belongsTo(restaurantId) === true)
        .filter((p) => productId === null || p.productId === productId)
        .map(copyPromotion),
    );
  }

  delete(id: number): Promise<void> {
    this.items.delete(id);
    return Promise.resolve();
  }

  private alive(): Promotion[] {
    return [...this.items.values()].filter((p) => this.products.items.has(p.productId)).sort((a, b) => a.id - b.id);
  }
}

/** Leitor de cardápio e repositório de restaurantes em memória, com as mesmas regras da consulta SQL. */
export class InMemoryMenu implements MenuReader, RestaurantRepository {
  private readonly restaurants = new Map<number, Restaurant>();

  constructor(
    private readonly products: InMemoryProductRepository,
    private readonly promotions: InMemoryPromotionRepository,
  ) {}

  addRestaurant(restaurant: Restaurant): void {
    this.restaurants.set(restaurant.id, restaurant);
  }

  find(id: number): Promise<Restaurant | null> {
    return Promise.resolve(this.restaurants.get(id) ?? null);
  }

  async itemsAt(restaurantId: number, moment: LocalMoment): Promise<MenuItem[]> {
    const order = (p: Product) => Category.all.indexOf(p.category);
    const visible = this.products
      .ordered(restaurantId)
      .filter((p) => p.visible && p.isAvailableAt(moment))
      .sort((a, b) => order(a) - order(b) || a.position - b.position || a.name.localeCompare(b.name));
    const items: MenuItem[] = [];
    for (const product of visible) {
      let promotion: MenuItem['promotion'] = null;
      for (const candidate of await this.promotions.ofProduct(product.id)) {
        const window = candidate.activeWindowAt(moment);
        if (window !== null) {
          promotion = { description: candidate.description, price: candidate.price.cents, endsAt: window.end.format() };
          break;
        }
      }
      items.push({
        id: product.id,
        name: product.name,
        category: product.category.value,
        price: product.price.cents,
        promotion,
      });
    }
    return items;
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly items = new Map<number, User>();
  private sequence = 0;

  nextId(): Promise<number> {
    return Promise.resolve(++this.sequence);
  }

  save(user: User): Promise<void> {
    this.items.set(user.id, copyUser(user));
    return Promise.resolve();
  }

  findByEmail(email: Email): Promise<User | null> {
    const user = [...this.items.values()].find((u) => u.email.value === email.value);
    return Promise.resolve(user ? copyUser(user) : null);
  }

  findById(id: number): Promise<User | null> {
    const user = this.items.get(id);
    return Promise.resolve(user ? copyUser(user) : null);
  }

  find(restaurantId: number, id: number): Promise<User | null> {
    const user = this.items.get(id);
    return Promise.resolve(user?.restaurantId === restaurantId ? copyUser(user) : null);
  }

  ofRestaurant(restaurantId: number): Promise<User[]> {
    return Promise.resolve([...this.items.values()].filter((u) => u.restaurantId === restaurantId).map(copyUser));
  }

  delete(id: number): Promise<void> {
    this.items.delete(id);
    return Promise.resolve();
  }
}

/** Hash de mentira, determinístico e rápido (o Argon2id de verdade é testado na integração). */
export class FakeHasher implements PasswordHasher {
  hash(password: Password): Promise<string> {
    return Promise.resolve(`hashed:${password.plain()}`);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plain}`);
  }
}

/** Dublês das portas de autenticação, todos em memória e determinísticos. */
export class AuthFakes implements AccessTokens, Mailer, ResetRequestThrottle, PasswordResetTokenRepository {
  readonly sent: { to: string; name: string; link: string }[] = [];
  readonly requests: { email: string; ip: string; at: Date }[] = [];
  readonly tokens = new Map<string, PasswordResetToken>();

  issue(userId: number, restaurantId: number, email: string): Promise<string> {
    return Promise.resolve(`token-${userId}-${restaurantId}-${email}`);
  }

  verify(token: string): Promise<AuthContext> {
    const match = /^token-(\d+)-(\d+)-(.+)$/.exec(token);
    if (!match) {
      return Promise.reject(new Unauthenticated('Token inválido.'));
    }
    return Promise.resolve({ userId: Number(match[1]), restaurantId: Number(match[2]), email: String(match[3]) });
  }

  sendPasswordReset(to: string, name: string, link: string): Promise<void> {
    this.sent.push({ to, name, link });
    return Promise.resolve();
  }

  countByEmailSince(email: string, since: Date): Promise<number> {
    return Promise.resolve(this.requests.filter((r) => r.email === email && r.at > since).length);
  }

  countByIpSince(ip: string, since: Date): Promise<number> {
    return Promise.resolve(this.requests.filter((r) => r.ip === ip && r.at > since).length);
  }

  record(email: string, ip: string, at: Date): Promise<void> {
    this.requests.push({ email, ip, at });
    return Promise.resolve();
  }

  save(token: PasswordResetToken): Promise<void> {
    this.tokens.set(
      token.tokenHash,
      PasswordResetToken.restore(token.tokenHash, token.userId, token.expiresAt, token.usedAt),
    );
    return Promise.resolve();
  }

  findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const token = this.tokens.get(tokenHash);
    return Promise.resolve(
      token ? PasswordResetToken.restore(token.tokenHash, token.userId, token.expiresAt, token.usedAt) : null,
    );
  }

  invalidateOpenTokensOf(userId: number, now: Date): Promise<void> {
    for (const [hash, token] of this.tokens) {
      if (token.userId === userId && token.usedAt === null) {
        this.tokens.set(hash, PasswordResetToken.restore(hash, userId, token.expiresAt, now));
      }
    }
    return Promise.resolve();
  }

  /** Último token em texto puro enviado por e-mail. */
  lastToken(): string {
    const last = this.sent.at(-1);
    const token = last && new URL(last.link).searchParams.get('token');
    if (!token) {
      throw new Error('Nenhum e-mail com token foi enviado.');
    }
    return token;
  }
}

/** Log de auditoria em memória: grava as entradas e responde às consultas do endpoint. */
export class InMemoryAuditLog implements AuditLog, AuditLogReader, TransactionManager {
  readonly entries: (AuditEntry & { at: Date })[] = [];

  constructor(private readonly clock: Clock = new FixedClock()) {}

  /** Sem banco não há rollback de verdade; a atomicidade é testada na integração. */
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  record(entry: AuditEntry): Promise<void> {
    this.entries.push({ ...entry, at: this.clock.now() });
    return Promise.resolve();
  }

  search(query: AuditSearch): Promise<{ items: StoredAuditEntry[]; total: number }> {
    const matching = this.entries
      .map((entry, index) => ({ entry, id: index + 1 }))
      .filter(
        ({ entry }) =>
          entry.actor.restaurantId === query.restaurantId &&
          entry.actor.userId === query.actorUserId &&
          entry.at >= query.from &&
          entry.at < query.until,
      )
      .reverse();
    const start = (query.page - 1) * query.perPage;
    return Promise.resolve({
      total: matching.length,
      items: matching.slice(start, start + query.perPage).map(({ entry, id }) => ({
        id,
        actorEmail: entry.actor.email,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        changes: entry.changes,
        ip: entry.actor.ip,
        createdAt: entry.at,
      })),
    });
  }

  lastActorEmail(restaurantId: number, actorUserId: number): Promise<string | null> {
    const last = this.entries.findLast((e) => e.actor.restaurantId === restaurantId && e.actor.userId === actorUserId);
    return Promise.resolve(last?.actor.email ?? null);
  }

  /** Auditor que grava neste log, para montar os casos de uso nos testes. */
  auditor(): Auditor {
    return new Auditor(this, this);
  }

  actions(): string[] {
    return this.entries.map((e) => e.action);
  }
}

/** Ator padrão dos testes: o admin (usuário 1) do restaurante 1. */
export function actorOf(restaurantId = 1, userId = 1, email = 'admin@bardojoao.com'): Actor {
  return { userId, email, restaurantId, ip: '10.0.0.1' };
}
