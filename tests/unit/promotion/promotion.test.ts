import { describe, expect, it } from 'vitest';
import { OverlappingPromotion, Promotion, type PromotionChanges } from '../../../src/promotion/domain/promotion.js';
import { Conflict, ValidationError } from '../../../src/shared/domain/errors.js';
import { Money } from '../../../src/shared/domain/money.js';
import { TimeWindow } from '../../../src/shared/domain/time-window.js';
import { Timezone } from '../../../src/shared/domain/timezone.js';

const happyHour: PromotionChanges = {
  regularPrice: Money.ofCents(1400),
  description: ' Happy hour ',
  price: Money.ofCents(700),
  windows: [TimeWindow.fromStrings(3, '18:00', '20:00')],
};
const at = (iso: string) => Timezone.fromString('America/Sao_Paulo').localize(new Date(iso));

describe('Promotion', () => {
  it('preço promocional precisa ser menor que o normal', () => {
    expect(Promotion.create(1, 1, happyHour).description).toBe('Happy hour');
    expect(() => Promotion.create(1, 1, { ...happyHour, price: Money.ofCents(1400) })).toThrow(
      'O preço promocional (1400) precisa ser menor que o preço normal (1400).',
    );
  });

  it('exige descrição, preço positivo e ao menos uma janela', () => {
    expect(() => Promotion.create(1, 1, { ...happyHour, description: ' ' })).toThrow('obrigatória');
    expect(() => Promotion.create(1, 1, { ...happyHour, description: 'x'.repeat(256) })).toThrow('255');
    expect(() => Promotion.create(1, 1, { ...happyHour, price: Money.ofCents(0) })).toThrow('maior que zero');
    expect(() => Promotion.create(1, 1, { ...happyHour, windows: [] })).toThrow(ValidationError);
  });

  it('as janelas da própria promoção não se sobrepõem', () => {
    const windows = [TimeWindow.fromStrings(3, '18:00', '20:00'), TimeWindow.fromStrings(3, '19:00', '21:00')];

    expect(() => Promotion.create(1, 1, { ...happyHour, windows })).toThrow(OverlappingPromotion);
  });

  it('conflita com outra promoção do mesmo produto', () => {
    const existing = Promotion.create(1, 1, happyHour);
    const late = Promotion.create(2, 1, { ...happyHour, windows: [TimeWindow.fromStrings(3, '19:45', '21:00')] });

    expect(() => late.assertNoOverlapWith([existing])).toThrow(Conflict);
    expect(() => late.assertNoOverlapWith([existing])).toThrow('Janela sobreposta à promoção 1 (dia 3, 18:00–20:00).');
    expect(() => existing.assertNoOverlapWith([existing])).not.toThrow();
  });

  it('ignora promoções de outros produtos', () => {
    const other = Promotion.create(1, 99, happyHour);

    expect(() => Promotion.create(2, 1, happyHour).assertNoOverlapWith([other])).not.toThrow();
  });

  it('janela ativa num momento local', () => {
    const promotion = Promotion.create(1, 1, happyHour);

    expect(promotion.activeWindowAt(at('2026-12-02T21:30:00Z'))?.end.format()).toBe('20:00');
    expect(promotion.activeWindowAt(at('2026-12-02T23:00:00Z'))).toBeNull();
  });

  it('update troca descrição, preço e janelas; restore reconstitui', () => {
    const promotion = Promotion.create(1, 1, happyHour);
    promotion.update({ ...happyHour, description: 'Estendido', price: Money.ofCents(650) });

    expect([promotion.description, promotion.price.cents, promotion.windows.length]).toEqual(['Estendido', 650, 1]);
    expect(Promotion.restore(5, 1, 'X', Money.ofCents(100), []).id).toBe(5);
  });
});
