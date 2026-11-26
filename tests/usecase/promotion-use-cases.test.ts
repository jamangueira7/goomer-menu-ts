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
import { InMemoryProductRepository, InMemoryPromotionRepository } from '../support/in-memory.js';

const happyHour: PromotionData = {
  description: 'Happy hour',
  priceCents: 700,
  windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
};

describe('casos de uso de promoção', () => {
  let products: InMemoryProductRepository;
  let promotions: InMemoryPromotionRepository;
  let create: CreatePromotionUseCase;
  let chopp: number;

  beforeEach(async () => {
    products = new InMemoryProductRepository();
    promotions = new InMemoryPromotionRepository(products);
    create = new CreatePromotionUseCase(products, promotions);
    chopp = (
      await new CreateProductUseCase(products).execute(1, { name: 'Chopp', priceCents: 1400, category: 'bebidas' })
    ).id;
  });

  it('cria e lê a promoção', async () => {
    const created = await create.execute(1, chopp, happyHour);

    expect(created).toEqual({
      id: 1,
      productId: chopp,
      description: 'Happy hour',
      price: 700,
      windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
    });
    expect(await new GetPromotionUseCase(promotions).execute(1, created.id)).toEqual(created);
  });

  it('janela sobreposta do mesmo produto é conflito', async () => {
    await create.execute(1, chopp, happyHour);

    await expect(
      create.execute(1, chopp, { ...happyHour, windows: [{ weekday: 3, start: '19:00', end: '21:00' }] }),
    ).rejects.toThrow(OverlappingPromotion);
  });

  it('preço maior ou igual ao normal é recusado', async () => {
    await expect(create.execute(1, chopp, { ...happyHour, priceCents: 1400 })).rejects.toThrow(ValidationError);
  });

  it('produto de outro restaurante não existe', async () => {
    await expect(create.execute(2, chopp, happyHour)).rejects.toThrow(ProductNotFound);
  });

  it('update pode manter as próprias janelas, mas não colidir com outras', async () => {
    const first = await create.execute(1, chopp, happyHour);
    const second = await create.execute(1, chopp, {
      ...happyHour,
      windows: [{ weekday: 4, start: '18:00', end: '20:00' }],
    });
    const update = new UpdatePromotionUseCase(products, promotions);

    const extended = await update.execute(1, first.id, {
      ...happyHour,
      description: 'Estendido',
      windows: [{ weekday: 3, start: '17:00', end: '20:00' }],
    });
    expect(extended.description).toBe('Estendido');
    await expect(
      update.execute(1, second.id, { ...happyHour, windows: [{ weekday: 3, start: '19:00', end: '19:30' }] }),
    ).rejects.toThrow(OverlappingPromotion);
    await expect(update.execute(2, first.id, happyHour)).rejects.toThrow(PromotionNotFound);
  });

  it('lista com filtro e exclui', async () => {
    const created = await create.execute(1, chopp, happyHour);
    const list = new ListPromotionsUseCase(promotions);
    const remove = new DeletePromotionUseCase(promotions);

    expect(await list.execute(1)).toHaveLength(1);
    expect(await list.execute(1, chopp)).toHaveLength(1);
    expect(await list.execute(1, 999)).toHaveLength(0);
    expect(await list.execute(2)).toHaveLength(0);
    await expect(remove.execute(2, created.id)).rejects.toThrow(PromotionNotFound);
    await remove.execute(1, created.id);
    await expect(new GetPromotionUseCase(promotions).execute(1, created.id)).rejects.toThrow(
      'Promoção 1 não encontrada.',
    );
  });

  it('excluir o produto leva as promoções junto', async () => {
    await create.execute(1, chopp, happyHour);
    await new DeleteProductUseCase(products).execute(1, chopp);

    expect(await new ListPromotionsUseCase(promotions).execute(1)).toEqual([]);
  });
});
