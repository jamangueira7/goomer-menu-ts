import { describe, expect, it } from 'vitest';
import { Category } from '../../../src/product/domain/category.js';
import { Product, type ProductState } from '../../../src/product/domain/product.js';
import { ValidationError } from '../../../src/shared/domain/errors.js';
import { Money } from '../../../src/shared/domain/money.js';
import { TimeWindow } from '../../../src/shared/domain/time-window.js';
import { Timezone } from '../../../src/shared/domain/timezone.js';

const base: ProductState = {
  id: 1,
  restaurantId: 1,
  name: '  Chopp 300 ml  ',
  price: Money.ofCents(1400),
  category: Category.Drinks,
  visible: true,
  position: 1,
  availability: [],
};
const at = (iso: string) => Timezone.fromString('America/Sao_Paulo').localize(new Date(iso));

describe('Product', () => {
  it('nasce com o nome aparado', () => {
    const product = Product.create(base);

    expect(product.name).toBe('Chopp 300 ml');
    expect(product.price.cents).toBe(1400);
    expect(product.category).toBe(Category.Drinks);
    expect(product.belongsTo(1)).toBe(true);
    expect(product.belongsTo(2)).toBe(false);
  });

  it('recusa nome vazio, nome longo, preço zero e janelas sobrepostas', () => {
    expect(() => Product.create({ ...base, name: '   ' })).toThrow('obrigatório');
    expect(() => Product.create({ ...base, name: 'x'.repeat(121) })).toThrow('120 caracteres');
    expect(Product.create({ ...base, name: 'á'.repeat(120) }).name).toHaveLength(120);
    expect(() => Product.create({ ...base, price: Money.ofCents(0) })).toThrow('maior que zero');
    expect(() =>
      Product.create({
        ...base,
        availability: [TimeWindow.fromStrings(1, '10:00', '12:00'), TimeWindow.fromStrings(1, '11:00', '13:00')],
      }),
    ).toThrow(ValidationError);
  });

  it('visibilidade e posição', () => {
    const product = Product.create(base);
    product.hide();
    expect(product.visible).toBe(false);
    product.show();
    expect(product.visible).toBe(true);
    product.moveTo(7);
    expect(product.position).toBe(7);
  });

  it('sem janelas está sempre disponível; com janelas, só dentro delas', () => {
    expect(Product.create(base).isAvailableAt(at('2026-12-02T21:30:00Z'))).toBe(true);

    const feijoada = Product.create({ ...base, availability: [TimeWindow.fromStrings(6, '11:00', '16:00')] });
    expect(feijoada.isAvailableAt(at('2026-12-05T15:00:00Z'))).toBe(true); // sábado 12:00
    expect(feijoada.isAvailableAt(at('2026-12-05T19:00:00Z'))).toBe(false); // sábado 16:00
    expect(feijoada.availability).toHaveLength(1);
  });

  it('restore não revalida (o banco já garantiu)', () => {
    expect(Product.restore({ ...base, name: 'Como veio do banco ' }).name).toBe('Como veio do banco ');
  });
});

describe('Category', () => {
  it('lê o valor, traz o rótulo e mantém a ordem do cardápio', () => {
    expect(Category.fromString('pratos_principais')).toBe(Category.MainCourses);
    expect(Category.MainCourses.label).toBe('Pratos principais');
    expect(Category.all.map((c) => c.value)).toEqual(['entradas', 'pratos_principais', 'sobremesas', 'bebidas']);
    expect(() => Category.fromString('lanches')).toThrow('Categoria "lanches" inválida');
  });
});
