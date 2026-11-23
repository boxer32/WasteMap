import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/lib/server/ratelimit';

/** D1-shaped wrapper over node:sqlite (D1 is SQLite) so the real SQL runs in unit tests. */
export function memoryDb(): Db {
	const sqlite = new DatabaseSync(':memory:');
	for (const f of ['0001_init.sql', '0002_retention.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
	return {
		prepare(sql: string) {
			const stmt = sqlite.prepare(sql);
			return {
				bind: (...v: unknown[]) => ({
					first: async <T>() => ((stmt.get(...(v as never[])) as T | undefined) ?? null),
					all: async <T>() => ({ results: stmt.all(...(v as never[])) as T[] }),
					run: async () => stmt.run(...(v as never[]))
				})
			};
		}
	};
}
