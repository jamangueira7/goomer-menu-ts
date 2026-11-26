import type { Email } from './email.js';
import type { User } from './user.js';

export interface UserRepository {
  nextId(): Promise<number>;
  /** Lança EmailAlreadyTaken se o banco recusar o e-mail repetido. */
  save(user: User): Promise<void>;
  findByEmail(email: Email): Promise<User | null>;
  findById(id: number): Promise<User | null>;
  /** Só devolve o usuário se ele for do restaurante informado. */
  find(restaurantId: number, id: number): Promise<User | null>;
  ofRestaurant(restaurantId: number): Promise<User[]>;
  delete(id: number): Promise<void>;
}
