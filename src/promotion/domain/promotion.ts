import { textLength } from '../../shared/domain/text.js';
import { Conflict, NotFound, ValidationError } from '../../shared/domain/errors.js';
import type { LocalMoment } from '../../shared/domain/local-moment.js';
import type { Money } from '../../shared/domain/money.js';
import { TimeWindow } from '../../shared/domain/time-window.js';

export class PromotionNotFound extends NotFound {
  static withId(id: number): PromotionNotFound {
    return new PromotionNotFound(`Promoção ${id} não encontrada.`);
  }
}

export class OverlappingPromotion extends Conflict {
  static with(otherPromotionId: number, window: TimeWindow): OverlappingPromotion {
    return new OverlappingPromotion(
      `Janela sobreposta à promoção ${otherPromotionId} (dia ${window.weekday.value}, ${window.start.format()}–${window.end.format()}).`,
    );
  }
}

export interface PromotionChanges {
  /** Preço normal do produto, para a regra "promocional menor que o normal". */
  regularPrice: Money;
  description: string;
  price: Money;
  windows: readonly TimeWindow[];
}

/**
 * Promoção de um produto: preço promocional menor que o normal, válido só nas janelas de dia e horário.
 */
export class Promotion {
  static readonly MAX_DESCRIPTION_LENGTH = 255;

  private constructor(
    readonly id: number,
    readonly productId: number,
    private _description: string,
    private _price: Money,
    private _windows: readonly TimeWindow[],
  ) {}

  static create(id: number, productId: number, changes: PromotionChanges): Promotion {
    const promotion = new Promotion(id, productId, '', changes.price, []);
    promotion.update(changes);
    return promotion;
  }

  static restore(
    id: number,
    productId: number,
    description: string,
    price: Money,
    windows: readonly TimeWindow[],
  ): Promotion {
    return new Promotion(id, productId, description, price, [...windows]);
  }

  update(changes: PromotionChanges): void {
    const description = changes.description.trim();
    if (description === '') {
      throw new ValidationError('A descrição da promoção é obrigatória.', 'description');
    }
    if (textLength(description) > Promotion.MAX_DESCRIPTION_LENGTH) {
      throw new ValidationError('A descrição tem no máximo 255 caracteres.', 'description');
    }
    if (changes.price.isZero()) {
      throw new ValidationError('O preço promocional precisa ser maior que zero.', 'price');
    }
    if (!changes.price.isLessThan(changes.regularPrice)) {
      throw new ValidationError(
        `O preço promocional (${changes.price.cents}) precisa ser menor que o preço normal (${changes.regularPrice.cents}).`,
        'price',
      );
    }
    if (changes.windows.length === 0) {
      throw new ValidationError('A promoção precisa de ao menos uma janela de dia e horário.', 'windows');
    }
    if (TimeWindow.anyOverlap(changes.windows)) {
      throw new OverlappingPromotion('As janelas da própria promoção se sobrepõem.');
    }
    this._description = description;
    this._price = changes.price;
    this._windows = [...changes.windows];
  }

  /** Garante que nenhuma janela desta promoção cruza com as das outras promoções do mesmo produto. */
  assertNoOverlapWith(others: readonly Promotion[]): void {
    for (const other of others) {
      if (other.id === this.id || other.productId !== this.productId) {
        continue;
      }
      for (const mine of this._windows) {
        const theirs = other._windows.find((w) => mine.overlaps(w));
        if (theirs !== undefined) {
          throw OverlappingPromotion.with(other.id, theirs);
        }
      }
    }
  }

  activeWindowAt(moment: LocalMoment): TimeWindow | null {
    return this._windows.find((w) => w.contains(moment)) ?? null;
  }

  get description(): string {
    return this._description;
  }

  get price(): Money {
    return this._price;
  }

  get windows(): readonly TimeWindow[] {
    return this._windows;
  }
}
