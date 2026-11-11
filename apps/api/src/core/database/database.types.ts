import { getDrizzleToken } from '@nestjs/drizzle';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

/** Токен инъекции БД: `@Inject(DATABASE) private readonly db: Database`. */
export const DATABASE = getDrizzleToken();
