import { getTableConfig, pgTable } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt } from './columns.js';

// Хелперы проверяем на реальной таблице: билдеры колонок хранят настройки во внутренних полях.
const table = pgTable('sample', { id: id(), createdAt: createdAt(), updatedAt: updatedAt() });
const columns = Object.fromEntries(getTableConfig(table).columns.map((column) => [column.name, column]));

describe('хелперы колонок', () => {
  it('id: uuid PK с дефолтом', () => {
    expect(columns.id?.primary).toBe(true);
    expect(columns.id?.hasDefault).toBe(true);
  });

  it('createdAt и updatedAt: timestamptz not null с дефолтом', () => {
    for (const name of ['createdAt', 'updatedAt']) {
      expect(columns[name]?.notNull).toBe(true);
      expect(columns[name]?.hasDefault).toBe(true);
      expect(columns[name]?.getSQLType()).toBe('timestamp with time zone');
    }
  });

  it('updatedAt обновляется при изменении строки', () => {
    expect(columns.updatedAt?.onUpdateFn?.()).toBeInstanceOf(Date);
  });
});
