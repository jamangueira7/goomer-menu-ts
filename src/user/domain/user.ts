import { textLength } from '../../shared/domain/text.js';
import { Conflict, NotFound, ValidationError } from '../../shared/domain/errors.js';
import type { Email } from './email.js';

export class UserNotFound extends NotFound {
  static withId(id: number): UserNotFound {
    return new UserNotFound(`Usuário ${id} não encontrado.`);
  }
}

export class EmailAlreadyTaken extends Conflict {
  static of(email: Email): EmailAlreadyTaken {
    return new EmailAlreadyTaken(`Já existe um usuário com o e-mail ${email.value}.`);
  }
}

export class CannotDeleteSelf extends ValidationError {
  constructor() {
    super('Você não pode remover a si mesmo.', 'id');
  }
}

export class User {
  private constructor(
    readonly id: number,
    readonly restaurantId: number,
    readonly name: string,
    readonly email: Email,
    private _passwordHash: string,
  ) {}

  static register(id: number, restaurantId: number, name: string, email: Email, passwordHash: string): User {
    const trimmed = name.trim();
    if (trimmed === '' || textLength(trimmed) > 120) {
      throw new ValidationError('O nome é obrigatório e tem no máximo 120 caracteres.', 'name');
    }
    return new User(id, restaurantId, trimmed, email, passwordHash);
  }

  static restore(id: number, restaurantId: number, name: string, email: Email, passwordHash: string): User {
    return new User(id, restaurantId, name, email, passwordHash);
  }

  changePassword(passwordHash: string): void {
    this._passwordHash = passwordHash;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }
}
