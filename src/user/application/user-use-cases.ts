import type { Actor, Auditor } from '../../shared/application/audit.js';
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

/**
 * Cadastra um usuário no restaurante. Pela rota, o ator é quem está logado; no seed e no create-admin não há
 * ninguém logado, então o próprio usuário criado assina a entrada do log.
 */
export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly auditor: Auditor,
  ) {}

  async execute(restaurantId: number, input: NewUser, actor?: Actor): Promise<UserOutput> {
    const email = Email.fromString(input.email);
    const password = Password.fromString(input.password);
    const passwordHash = await this.hasher.hash(password);
    const id = await this.users.nextId();
    const signer = actor ?? { userId: id, email: email.value, restaurantId, ip: null };
    return this.auditor.run(signer, async () => {
      if ((await this.users.findByEmail(email)) !== null) {
        throw EmailAlreadyTaken.of(email);
      }
      const user = User.register(id, restaurantId, input.name, email, passwordHash);
      await this.users.save(user);
      return {
        result: toUserOutput(user),
        audit: {
          action: 'user.created',
          entityType: 'user',
          entityId: id,
          changes: { after: { name: user.name, email: user.email.value } },
        },
      };
    });
  }
}

export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(restaurantId: number): Promise<UserOutput[]> {
    return (await this.users.ofRestaurant(restaurantId)).map(toUserOutput);
  }
}

export class DeleteUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly auditor: Auditor,
  ) {}

  async execute(actor: Actor, id: number): Promise<void> {
    if (id === actor.userId) {
      throw new CannotDeleteSelf();
    }
    await this.auditor.run(actor, async () => {
      const user = await this.users.find(actor.restaurantId, id);
      if (user === null) {
        throw UserNotFound.withId(id);
      }
      await this.users.delete(user.id);
      return {
        result: undefined,
        audit: {
          action: 'user.deleted',
          entityType: 'user',
          entityId: id,
          changes: { before: { name: user.name, email: user.email.value } },
        },
      };
    });
  }
}
