import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProductUseCase, DeleteProductUseCase } from '../../src/product/application/product-use-cases.js';
import { ProductNotFound } from '../../src/product/domain/product-repository.js';
import {
  CreatePromotionUseCase,
  DeletePromotionUseCase,
  GetPromotionUseCase,
  ListPromotionsUseCase,
  UpdatePromotionUseCase,
  type PromotionData,
} from '../../src/promotion/application/promotion-use-cases.js';
import { OverlappingPromotion, PromotionNotFound } from '../../src/promotion/domain/promotion.js';
import { ValidationError } from '../../src/shared/domain/errors.js';
import {
  actorOf,
  InMemoryAuditLog,
  InMemoryProductRepository,
  InMemoryPromotionRepository,
} from '../support/in-memory.js';

const admin = actorOf(1);
const stranger = actorOf(2, 2, 'caio@izakaya.jp');
const happyHour: PromotionData = {
  description: 'Happy hour',
  priceCents: 700,
  windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
};

describe('casos de uso de promoção', () => {
  let products: InMemoryProductRepository;
  let promotions: InMemoryPromotionRepository;
  let audit: InMemoryAuditLog;
  let create: CreatePromotionUseCase;
  let chopp: number;

  beforeEach(async () => {
    products = new InMemoryProductRepository();
    promotions = new InMemoryPromotionRepository(products);
    audit = new InMemoryAuditLog();
    create = new CreatePromotionUseCase(products, promotions, audit.auditor());
    chopp = (
      await new CreateProductUseCase(products, audit.auditor()).execute(admin, {
        name: 'Chopp',
        priceCents: 1400,
        category: 'bebidas',
      })
    ).id;
  });

  const update = () => new UpdatePromotionUseCase(products, promotions, audit.auditor());
  const remove = () => new DeletePromotionUseCase(promotions, audit.auditor());

  it('cria e lê a promoção, com promotion.created no log', async () => {
    const created = await create.execute(admin, chopp, happyHour);

    expect(created).toEqual({
      id: 1,
      productId: chopp,
      description: 'Happy hour',
      price: 700,
      windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
    });
    expect(await new GetPromotionUseCase(promotions).execute(1, created.id)).toEqual(created);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'promotion.created',
      entityType: 'promotion',
      entityId: created.id,
      changes: { after: { productId: chopp, price: 700, windows: happyHour.windows } },
    });
  });

  it('janela sobreposta do mesmo produto é conflito, e a falha não grava log', async () => {
    await create.execute(admin, chopp, happyHour);

    await expect(
      create.execute(admin, chopp, { ...happyHour, windows: [{ weekday: 3, start: '19:00', end: '21:00' }] }),
    ).rejects.toThrow(OverlappingPromotion);
    expect(audit.actions()).toEqual(['product.created', 'promotion.created']);
  });

  it('preço maior ou igual ao normal é recusado', async () => {
    await expect(create.execute(admin, chopp, { ...happyHour, priceCents: 1400 })).rejects.toThrow(ValidationError);
  });

  it('produto de outro restaurante não existe', async () => {
    await expect(create.execute(stranger, chopp, happyHour)).rejects.toThrow(ProductNotFound);
  });

  it('update pode manter as próprias janelas, mas não colidir com outras', async () => {
    const first = await create.execute(admin, chopp, happyHour);
    const second = await create.execute(admin, chopp, {
      ...happyHour,
      windows: [{ weekday: 4, start: '18:00', end: '20:00' }],
    });

    const extended = await update().execute(admin, first.id, {
      ...happyHour,
      description: 'Estendido',
      windows: [{ weekday: 3, start: '17:00', end: '20:00' }],
    });
    expect(extended.description).toBe('Estendido');
    expect(audit.entries.at(-1)?.changes).toEqual({
      before: { description: 'Happy hour', windows: [{ weekday: 3, start: '18:00', end: '20:00' }] },
      after: { description: 'Estendido', windows: [{ weekday: 3, start: '17:00', end: '20:00' }] },
    });
    await expect(
      update().execute(admin, second.id, { ...happyHour, windows: [{ weekday: 3, start: '19:00', end: '19:30' }] }),
    ).rejects.toThrow(OverlappingPromotion);
    await expect(update().execute(stranger, first.id, happyHour)).rejects.toThrow(PromotionNotFound);
  });

  it('lista com filtro e exclui', async () => {
    const created = await create.execute(admin, chopp, happyHour);
    const list = new ListPromotionsUseCase(promotions);

    expect(await list.execute(1)).toHaveLength(1);
    expect(await list.execute(1, chopp)).toHaveLength(1);
    expect(await list.execute(1, 999)).toHaveLength(0);
    expect(await list.execute(2)).toHaveLength(0);
    await expect(remove().execute(stranger, created.id)).rejects.toThrow(PromotionNotFound);
    await remove().execute(admin, created.id);
    await expect(new GetPromotionUseCase(promotions).execute(1, created.id)).rejects.toThrow(
      'Promoção 1 não encontrada.',
    );
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'promotion.deleted',
      changes: { before: { description: 'Happy hour', price: 700 } },
    });
  });

  it('excluir o produto leva as promoções junto', async () => {
    await create.execute(admin, chopp, happyHour);
    await new DeleteProductUseCase(products, promotions, audit.auditor()).execute(admin, chopp);

    expect(await new ListPromotionsUseCase(promotions).execute(1)).toEqual([]);
  });
});
