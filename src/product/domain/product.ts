import { textLength } from '../../shared/domain/text.js';
import { ValidationError } from '../../shared/domain/errors.js';
import type { LocalMoment } from '../../shared/domain/local-moment.js';
import type { Money } from '../../shared/domain/money.js';
import { TimeWindow } from '../../shared/domain/time-window.js';
import type { Category } from './category.js';

export interface ProductState {
  id: number;
  restaurantId: number;
  name: string;
  price: Money;
  category: Category;
  visible: boolean;
  position: number;
  availability: readonly TimeWindow[];
}

export type ProductChanges = Pick<ProductState, 'name' | 'price' | 'category' | 'visible' | 'availability'>;

/**
 * Produto do cardápio. Sem janelas de disponibilidade, está sempre disponível.
 */
export class Product {
  static readonly MAX_NAME_LENGTH = 120;

  private constructor(private state: ProductState) {}

  static create(state: ProductState): Product {
    const product = new Product({ ...state, name: '', availability: [] });
    product.update(state);
    return product;
  }

  /** Reconstitui do banco, sem repetir as validações de criação. */
  static restore(state: ProductState): Product {
    return new Product({ ...state });
  }

  update(changes: ProductChanges): void {
    const name = changes.name.trim();
    if (name === '') {
      throw new ValidationError('O nome do produto é obrigatório.', 'name');
    }
    if (textLength(name) > Product.MAX_NAME_LENGTH) {
      throw new ValidationError('O nome do produto tem no máximo 120 caracteres.', 'name');
    }
    if (changes.price.isZero()) {
      throw new ValidationError('O preço do produto precisa ser maior que zero.', 'price');
    }
    if (TimeWindow.anyOverlap(changes.availability)) {
      throw new ValidationError('As janelas de disponibilidade não podem se sobrepor.', 'availability');
    }
    this.state = {
      ...this.state,
      name,
      price: changes.price,
      category: changes.category,
      visible: changes.visible,
      availability: [...changes.availability],
    };
  }

  show(): void {
    this.state.visible = true;
  }

  hide(): void {
    this.state.visible = false;
  }

  moveTo(position: number): void {
    this.state.position = position;
  }

  isAvailableAt(moment: LocalMoment): boolean {
    return this.state.availability.length === 0 || this.state.availability.some((w) => w.contains(moment));
  }

  belongsTo(restaurantId: number): boolean {
    return this.state.restaurantId === restaurantId;
  }

  get id(): number {
    return this.state.id;
  }

  get restaurantId(): number {
    return this.state.restaurantId;
  }

  get name(): string {
    return this.state.name;
  }

  get price(): Money {
    return this.state.price;
  }

  get category(): Category {
    return this.state.category;
  }

  get visible(): boolean {
    return this.state.visible;
  }

  get position(): number {
    return this.state.position;
  }

  get availability(): readonly TimeWindow[] {
    return this.state.availability;
  }
}
