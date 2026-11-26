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
import { ValidationError } from '../../src/shared/domain/errors.js';
import { InMemoryProductRepository } from '../support/in-memory.js';

describe('casos de uso de produto', () => {
  let products: InMemoryProductRepository;
  let create: CreateProductUseCase;

  beforeEach(() => {
    products = new InMemoryProductRepository();
    create = new CreateProductUseCase(products);
  });

  const chopp = () => create.execute(1, { name: 'Chopp', priceCents: 1400, category: 'bebidas' });

  it('cria na próxima posição e devolve a saída', async () => {
    await chopp();
    const output = await create.execute(1, {
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
  });

  it('recusa categoria e janela inválidas', async () => {
    await expect(create.execute(1, { name: 'X', priceCents: 100, category: 'lanches' })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      create.execute(1, {
        name: 'X',
        priceCents: 100,
        category: 'bebidas',
        availability: [{ weekday: 1, start: '10:10', end: '11:00' }],
      }),
    ).rejects.toThrow('Os minutos só aceitam 00, 15, 30 ou 45.');
    expect(products.items.size).toBe(0);
  });

  it('atualiza, detalha e muda a visibilidade só no restaurante dono', async () => {
    const { id } = await chopp();
    const updated = await new UpdateProductUseCase(products).execute(1, id, {
      name: 'Chopp 500 ml',
      priceCents: 1900,
      category: 'bebidas',
    });
    const hidden = await new ChangeProductVisibilityUseCase(products).execute(1, id, false);
    const shown = await new ChangeProductVisibilityUseCase(products).execute(1, id, true);

    expect(updated.name).toBe('Chopp 500 ml');
    expect(hidden.visible).toBe(false);
    expect(shown.visible).toBe(true);
    expect((await new GetProductUseCase(products).execute(1, id)).price).toBe(1900);
    await expect(new GetProductUseCase(products).execute(2, id)).rejects.toThrow(ProductNotFound);
    await expect(new ChangeProductVisibilityUseCase(products).execute(2, id, false)).rejects.toThrow(ProductNotFound);
  });

  it('atualizar produto de outro restaurante é 404', async () => {
    const { id } = await chopp();

    await expect(
      new UpdateProductUseCase(products).execute(2, id, { name: 'X', priceCents: 1, category: 'bebidas' }),
    ).rejects.toThrow('Produto 1 não encontrado.');
  });

  it('lista com filtros e paginação', async () => {
    await chopp();
    await create.execute(1, { name: 'Pudim', priceCents: 1800, category: 'sobremesas' });
    await create.execute(1, { name: 'Água', priceCents: 500, category: 'bebidas', visible: false });
    await create.execute(2, { name: 'De outro', priceCents: 500, category: 'bebidas' });
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

  it('reordenar coloca os ids listados primeiro e mantém a ordem dos outros', async () => {
    const a = (await chopp()).id;
    const b = (await create.execute(1, { name: 'B', priceCents: 100, category: 'bebidas' })).id;
    const c = (await create.execute(1, { name: 'C', priceCents: 100, category: 'bebidas' })).id;

    await new ReorderProductsUseCase(products).execute(1, [c]);

    expect(await products.idsOf(1)).toEqual([c, a, b]);
  });

  it('reordenar valida a lista de ids', async () => {
    const { id } = await chopp();
    const reorder = new ReorderProductsUseCase(products);
    const other = (await create.execute(2, { name: 'Outro', priceCents: 100, category: 'bebidas' })).id;

    await expect(reorder.execute(1, [])).rejects.toThrow('ao menos um id');
    await expect(reorder.execute(1, [id, id])).rejects.toThrow('repetições');
    await expect(reorder.execute(1, [id, 999, other])).rejects.toThrow('Produtos inexistentes: 999, 2.');
  });

  it('exclui só o que é do restaurante', async () => {
    const { id } = await chopp();
    const remove = new DeleteProductUseCase(products);

    await expect(remove.execute(2, id)).rejects.toThrow(ProductNotFound);
    await remove.execute(1, id);
    expect(products.items.size).toBe(0);
  });
});
