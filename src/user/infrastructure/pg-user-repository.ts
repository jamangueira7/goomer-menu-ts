import { SqlState, sqlStateOf, type Database } from '../../shared/infrastructure/database.js';
import { Email } from '../domain/email.js';
import { EmailAlreadyTaken, User } from '../domain/user.js';
import type { UserRepository } from '../domain/user-repository.js';

interface UserRow {
  id: number;
  restaurant_id: number;
  name: string;
  email: string;
  password_hash: string;
}

const COLUMNS = 'id, restaurant_id, name, email, password_hash';

function hydrate(row: UserRow): User {
  return User.restore(row.id, row.restaurant_id, row.name, Email.fromString(row.email), row.password_hash);
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  nextId(): Promise<number> {
    return this.db.int("SELECT nextval(pg_get_serial_sequence('users', 'id'))");
  }

  async save(user: User): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO users (id, restaurant_id, name, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           updated_at = now()`,
        [user.id, user.restaurantId, user.name, user.email.value, user.passwordHash],
      );
    } catch (error) {
      if (sqlStateOf(error) === SqlState.UNIQUE_VIOLATION) {
        throw EmailAlreadyTaken.of(user.email);
      }
      throw error;
    }
  }

  findByEmail(email: Email): Promise<User | null> {
    return this.oneUser(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email.value]);
  }

  findById(id: number): Promise<User | null> {
    return this.oneUser(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  }

  find(restaurantId: number, id: number): Promise<User | null> {
    return this.oneUser(`SELECT ${COLUMNS} FROM users WHERE id = $1 AND restaurant_id = $2`, [id, restaurantId]);
  }

  async ofRestaurant(restaurantId: number): Promise<User[]> {
    const rows = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE restaurant_id = $1 ORDER BY id`, [
      restaurantId,
    ]);
    return rows.map(hydrate);
  }

  async delete(id: number): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = $1', [id]);
  }

  private async oneUser(sql: string, params: readonly unknown[]): Promise<User | null> {
    const row = await this.db.one<UserRow>(sql, params);
    return row === null ? null : hydrate(row);
  }
}
