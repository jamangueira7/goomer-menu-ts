import { ValidationError } from '../../shared/domain/errors.js';

/**
 * Categoria do produto. A ordem de `Category.all` é a ordem do cardápio (e do ENUM no Postgres).
 */
export class Category {
  static readonly Starters = new Category('entradas', 'Entradas');
  static readonly MainCourses = new Category('pratos_principais', 'Pratos principais');
  static readonly Desserts = new Category('sobremesas', 'Sobremesas');
  static readonly Drinks = new Category('bebidas', 'Bebidas');

  static readonly all: readonly Category[] = [
    Category.Starters,
    Category.MainCourses,
    Category.Desserts,
    Category.Drinks,
  ];

  private constructor(
    readonly value: string,
    readonly label: string,
  ) {}

  static fromString(value: string): Category {
    const category = Category.all.find((c) => c.value === value);
    if (category === undefined) {
      const valid = Category.all.map((c) => c.value).join(', ');
      throw new ValidationError(`Categoria "${value}" inválida. Use: ${valid}.`, 'category');
    }
    return category;
  }
}
