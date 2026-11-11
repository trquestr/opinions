import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** Первичный ключ uuidv7 (Postgres 18): монотонный по времени, поэтому индекс не фрагментируется. */
export const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
