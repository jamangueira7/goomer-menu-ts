import { NotFound } from '../../shared/domain/errors.js';
import type { Timezone } from '../../shared/domain/timezone.js';

export class RestaurantNotFound extends NotFound {
  static withId(id: number): RestaurantNotFound {
    return new RestaurantNotFound(`Restaurante ${id} não encontrado.`);
  }
}

export class Restaurant {
  constructor(
    readonly id: number,
    readonly name: string,
    readonly timezone: Timezone,
  ) {}
}

export interface RestaurantRepository {
  find(id: number): Promise<Restaurant | null>;
}
