import { Email } from '../domain/email.js';
import { Password } from '../domain/password.js';
import { CannotDeleteSelf, EmailAlreadyTaken, User, UserNotFound } from '../domain/user.js';
import type { UserRepository } from '../domain/user-repository.js';

/** Porta de hash de senha (Argon2id na infraestrutura). */
export interface PasswordHasher {
  hash(password: Password): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

/** Usuário para fora da aplicação: nunca leva o hash da senha. */
export interface UserOutput {
  id: number;
  restaurantId: number;
  name: string;
  email: string;
}

export function toUserOutput(user: User): UserOutput {
  return { id: user.id, restaurantId: user.restaurantId, name: user.name, email: user.email.value };
}

export interface NewUser {
  name: string;
  email: string;
  password: string;
}

/** Cadastra um usuário no restaurante (usado pela rota protegida, pelo seed e pelo create-admin). */
export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(restaurantId: number, input: NewUser): Promise<UserOutput> {
    const email = Email.fromString(input.email);
    const password = Password.fromString(input.password);
    if ((await this.users.findByEmail(email)) !== null) {
      throw EmailAlreadyTaken.of(email);
    }
    const user = User.register(
      await this.users.nextId(),
      restaurantId,
      input.name,
      email,
      await this.hasher.hash(password),
    );
    await this.users.save(user);
    return toUserOutput(user);
  }
}

export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(restaurantId: number): Promise<UserOutput[]> {
    return (await this.users.ofRestaurant(restaurantId)).map(toUserOutput);
  }
}

export class DeleteUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(restaurantId: number, currentUserId: number, id: number): Promise<void> {
    if (id === currentUserId) {
      throw new CannotDeleteSelf();
    }
    const user = await this.users.find(restaurantId, id);
    if (user === null) {
      throw UserNotFound.withId(id);
    }
    await this.users.delete(user.id);
  }
}
