import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChangeProductVisibilityUseCase,
  CreateProductUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  ListProductsUseCase,
  ReorderProductsUseCase,
  UpdateProductUseCase,
} from '../../src/product/application/product-use-cases.js';
import { ProductNotFound } from '../../src/product/domain/product-repository.js';
import { CreatePromotionUseCase } from '../../src/promotion/application/promotion-use-cases.js';
import { ValidationError } from '../../src/shared/domain/errors.js';
import {
  actorOf,
  InMemoryAuditLog,
  InMemoryProductRepository,
  InMemoryPromotionRepository,
} from '../support/in-memory.js';

const admin = actorOf(1);
const stranger = actorOf(2, 2, 'caio@izakaya.jp');

describe('casos de uso de produto', () => {
  let products: InMemoryProductRepository;
  let promotions: InMemoryPromotionRepository;
  let audit: InMemoryAuditLog;
  let create: CreateProductUseCase;

  beforeEach(() => {
    products = new InMemoryProductRepository();
    promotions = new InMemoryPromotionRepository(products);
    audit = new InMemoryAuditLog();
    create = new CreateProductUseCase(products, audit.auditor());
  });

  const chopp = () => create.execute(admin, { name: 'Chopp', priceCents: 1400, category: 'bebidas' });
  const update = () => new UpdateProductUseCase(products, audit.auditor());
  const visibility = () => new ChangeProductVisibilityUseCase(products, audit.auditor());
  const reorder = () => new ReorderProductsUseCase(products, audit.auditor());
  const remove = () => new DeleteProductUseCase(products, promotions, audit.auditor());

  it('cria na próxima posição, devolve a saída e grava product.created', async () => {
    await chopp();
    const output = await create.execute(admin, {
      name: 'Feijoada',
      priceCents: 6500,
      category: 'pratos_principais',
      visible: false,
      availability: [{ weekday: 6, start: '11:00', end: '16:00' }],
    });

    expect(output).toEqual({
      id: 2,
      name: 'Feijoada',
      price: 6500,
      category: 'pratos_principais',
      visible: false,
      position: 2,
      availability: [{ weekday: 6, start: '11:00', end: '16:00' }],
    });
    expect(audit.entries[1]).toMatchObject({
      actor: admin,
      action: 'product.created',
      entityType: 'product',
      entityId: 2,
      changes: { after: { name: 'Feijoada', price: 6500, visible: false, position: 2 } },
    });
  });

  it('recusa categoria e janela inválidas, sem gravar log', async () => {
    await expect(create.execute(admin, { name: 'X', priceCents: 100, category: 'lanches' })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      create.execute(admin, {
        name: 'X',
        priceCents: 100,
        category: 'bebidas',
        availability: [{ weekday: 1, start: '10:10', end: '11:00' }],
      }),
    ).rejects.toThrow('Os minutos só aceitam 00, 15, 30 ou 45.');
    expect(products.items.size).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('atualiza, detalha e muda a visibilidade só no restaurante dono, com de/para no log', async () => {
    const { id } = await chopp();
    const updated = await update().execute(admin, id, { name: 'Chopp 500 ml', priceCents: 1900, category: 'bebidas' });
    const hidden = await visibility().execute(admin, id, false);
    const shown = await visibility().execute(admin, id, true);

    expect(updated.name).toBe('Chopp 500 ml');
    expect(hidden.visible).toBe(false);
    expect(shown.visible).toBe(true);
    expect((await new GetProductUseCase(products).execute(1, id)).price).toBe(1900);
    await expect(new GetProductUseCase(products).execute(2, id)).rejects.toThrow(ProductNotFound);
    await expect(visibility().execute(stranger, id, false)).rejects.toThrow(ProductNotFound);

    expect(audit.entries[1]?.changes).toEqual({
      before: { name: 'Chopp', price: 1400 },
      after: { name: 'Chopp 500 ml', price: 1900 },
    });
    expect(audit.entries[2]).toMatchObject({
      action: 'product.visibility_changed',
      changes: { before: { visible: true }, after: { visible: false } },
    });
    expect(audit.actions()).toHaveLength(4);
  });

  it('atualizar produto de outro restaurante é 404 e não gera log', async () => {
    const { id } = await chopp();

    await expect(update().execute(stranger, id, { name: 'X', priceCents: 1, category: 'bebidas' })).rejects.toThrow(
      'Produto 1 não encontrado.',
    );
    expect(audit.actions()).toEqual(['product.created']);
  });

  it('lista com filtros e paginação', async () => {
    await chopp();
    await create.execute(admin, { name: 'Pudim', priceCents: 1800, category: 'sobremesas' });
    await create.execute(admin, { name: 'Água', priceCents: 500, category: 'bebidas', visible: false });
    await create.execute(stranger, { name: 'De outro', priceCents: 500, category: 'bebidas' });
    const list = new ListProductsUseCase(products);

    expect((await list.execute(1)).total).toBe(3);
    expect((await list.execute(1, { category: 'bebidas' })).items.map((p) => p.name)).toEqual(['Chopp', 'Água']);
    expect((await list.execute(1, { visible: false })).items.map((p) => p.name)).toEqual(['Água']);
    expect(await list.execute(1, { page: 2, perPage: 2 })).toMatchObject({ page: 2, perPage: 2, total: 3 });
    expect((await list.execute(1, { page: 2, perPage: 2 })).items.map((p) => p.name)).toEqual(['Água']);
    await expect(list.execute(1, { perPage: 101 })).rejects.toThrow(ValidationError);
    await expect(list.execute(1, { page: 0 })).rejects.toThrow(ValidationError);
    await expect(list.execute(1, { category: 'lanches' })).rejects.toThrow(ValidationError);
  });

  it('reordenar coloca os ids listados primeiro e registra a lista pedida', async () => {
    const a = (await chopp()).id;
    const b = (await create.execute(admin, { name: 'B', priceCents: 100, category: 'bebidas' })).id;
    const c = (await create.execute(admin, { name: 'C', priceCents: 100, category: 'bebidas' })).id;

    await reorder().execute(admin, [c]);

    expect(await products.idsOf(1)).toEqual([c, a, b]);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product.reordered',
      entityId: null,
      changes: { after: { ids: [c] } },
    });
  });

  it('reordenar valida a lista de ids', async () => {
    const { id } = await chopp();
    const other = (await create.execute(stranger, { name: 'Outro', priceCents: 100, category: 'bebidas' })).id;

    await expect(reorder().execute(admin, [])).rejects.toThrow('ao menos um id');
    await expect(reorder().execute(admin, [id, id])).rejects.toThrow('repetições');
    await expect(reorder().execute(admin, [id, 999, other])).rejects.toThrow('Produtos inexistentes: 999, 2.');
    expect(audit.actions()).not.toContain('product.reordered');
  });

  it('exclui só o que é do restaurante e conta as promoções que caíram junto', async () => {
    const { id } = await chopp();
    await new CreatePromotionUseCase(products, promotions, audit.auditor()).execute(admin, id, {
      description: 'Happy hour',
      priceCents: 700,
      windows: [{ weekday: 3, start: '18:00', end: '20:00' }],
    });

    await expect(remove().execute(stranger, id)).rejects.toThrow(ProductNotFound);
    await remove().execute(admin, id);

    expect(products.items.size).toBe(0);
    expect(audit.entries.at(-1)).toMatchObject({
      action: 'product.deleted',
      entityId: id,
      changes: { before: { name: 'Chopp', price: 1400, promotionsDeleted: 1 } },
    });
  });
});
