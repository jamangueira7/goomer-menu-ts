import { ListAuditLogsUseCase } from '../audit/application/list-audit-logs.js';
import { PgAuditLog, PgAuditLogReader, PgTransactionManager } from '../audit/infrastructure/pg-audit.js';
import { ForgotPasswordUseCase, LoginUseCase, ResetPasswordUseCase } from '../auth/application/auth-use-cases.js';
import type { AccessTokens } from '../auth/application/ports.js';
import { JoseAccessTokens } from '../auth/infrastructure/jose-access-tokens.js';
import { NodemailerMailer } from '../auth/infrastructure/nodemailer-mailer.js';
import { PgPasswordResetTokenRepository, PgResetRequestThrottle } from '../auth/infrastructure/pg-auth-stores.js';
import { GetMenuUseCase } from '../menu/application/get-menu.js';
import { PgMenuReader, PgRestaurantRepository } from '../menu/infrastructure/pg-menu.js';
import {
  ChangeProductVisibilityUseCase,
  CreateProductUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  ListProductsUseCase,
  ReorderProductsUseCase,
  UpdateProductUseCase,
} from '../product/application/product-use-cases.js';
import { PgProductRepository } from '../product/infrastructure/pg-product-repository.js';
import {
  CreatePromotionUseCase,
  DeletePromotionUseCase,
  GetPromotionUseCase,
  ListPromotionsUseCase,
  UpdatePromotionUseCase,
} from '../promotion/application/promotion-use-cases.js';
import { PgPromotionRepository } from '../promotion/infrastructure/pg-promotion-repository.js';
import { Auditor } from '../shared/application/audit.js';
import type { Clock } from '../shared/domain/clock.js';
import { Database } from '../shared/infrastructure/database.js';
import { SystemClock } from '../shared/infrastructure/system-clock.js';
import { CreateUserUseCase, DeleteUserUseCase, ListUsersUseCase } from '../user/application/user-use-cases.js';
import { Argon2idPasswordHasher } from '../user/infrastructure/argon2id-password-hasher.js';
import { PgUserRepository } from '../user/infrastructure/pg-user-repository.js';
import type { Config } from './config.js';

/** O que os testes podem trocar: o relógio (fixo) e o banco (o de teste). */
export interface Overrides {
  clock?: Clock;
  database?: Database;
}

/**
 * Único ponto de composição: liga cada porta à sua implementação, à mão, sem framework de injeção.
 */
export function createContainer(config: Config, overrides: Overrides = {}) {
  const clock = overrides.clock ?? new SystemClock();
  const database = overrides.database ?? Database.connect(config.database);
  const mailer = NodemailerMailer.fromDsn(config.mailerDsn, config.mailFrom);

  const products = new PgProductRepository(database);
  const promotions = new PgPromotionRepository(database);
  const users = new PgUserRepository(database);
  const resetTokens = new PgPasswordResetTokenRepository(database);
  const hasher = new Argon2idPasswordHasher();
  const accessTokens: AccessTokens = new JoseAccessTokens(config.jwtSecret, clock);
  const restaurants = new PgRestaurantRepository(database);
  // Toda escrita de negócio passa pelo Auditor: escrita e log de auditoria na mesma transação.
  const auditor = new Auditor(new PgAuditLog(database, clock), new PgTransactionManager(database));

  return {
    config,
    database,
    accessTokens,
    menu: new GetMenuUseCase(restaurants, new PgMenuReader(database), clock),
    audit: new ListAuditLogsUseCase(restaurants, users, new PgAuditLogReader(database), clock),
    auth: {
      login: new LoginUseCase(users, hasher, accessTokens),
      forgotPassword: new ForgotPasswordUseCase(
        users,
        resetTokens,
        new PgResetRequestThrottle(database),
        mailer,
        clock,
        auditor,
        config.resetUrl,
      ),
      resetPassword: new ResetPasswordUseCase(users, resetTokens, hasher, clock, auditor),
    },
    products: {
      list: new ListProductsUseCase(products),
      create: new CreateProductUseCase(products, auditor),
      get: new GetProductUseCase(products),
      update: new UpdateProductUseCase(products, auditor),
      visibility: new ChangeProductVisibilityUseCase(products, auditor),
      reorder: new ReorderProductsUseCase(products, auditor),
      delete: new DeleteProductUseCase(products, promotions, auditor),
    },
    promotions: {
      list: new ListPromotionsUseCase(promotions),
      create: new CreatePromotionUseCase(products, promotions, auditor),
      get: new GetPromotionUseCase(promotions),
      update: new UpdatePromotionUseCase(products, promotions, auditor),
      delete: new DeletePromotionUseCase(promotions, auditor),
    },
    users: {
      list: new ListUsersUseCase(users),
      create: new CreateUserUseCase(users, hasher, auditor),
      delete: new DeleteUserUseCase(users, auditor),
    },
    /** Fecha o SMTP e, se foi o container que abriu, o pool do banco. */
    async close(): Promise<void> {
      mailer.close();
      if (overrides.database === undefined) {
        await database.close();
      }
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
