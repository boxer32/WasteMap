export const WINDOW_MS = 3_600_000;
export const LIMITS = { report: 10, feedback: 20, login: 10 } as const;
export type Bucket = keyof typeof LIMITS;

/** Minimal D1 surface used by the server code (also satisfied by the node:sqlite test shim). */
export interface Db {
	prepare(sql: string): {
		bind(...v: unknown[]): {
			first<T = Record<string, unknown>>(): Promise<T | null>;
			all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
			run(): Promise<unknown>;
		};
	};
}

/**
 * Atomic fixed-window counter. Returns true when the request is within the limit.
 * `key` is already a salted hash: the raw IP never reaches the database.
 */
export async function hit(db: Db, key: string, bucket: Bucket, now = Date.now()): Promise<boolean> {
	const k = `${bucket}:${key}`;
	const row = await db
		.prepare(
			`INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
			 ON CONFLICT(key) DO UPDATE SET
			   count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
			   window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
			 RETURNING count`
		)
		.bind(k, now, now - WINDOW_MS)
		.first<{ count: number }>();
	return (row?.count ?? 1) <= LIMITS[bucket];
}
