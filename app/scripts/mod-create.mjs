// Usage: npm run mod:create -- <username> [--remote]
// The password is read from stdin (hidden on a TTY), never from argv, and never generated here.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { hashPassword } from '../src/lib/server/crypto.ts';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const username = args.find((a) => !a.startsWith('--'));
if (!username || !/^[A-Za-z0-9_.-]{3,40}$/.test(username)) {
	console.error('usage: npm run mod:create -- <username 3-40 chars [A-Za-z0-9_.-]> [--remote]');
	process.exit(1);
}

function readSecret(prompt) {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
		if (process.stdin.isTTY) {
			rl._writeToOutput = (s) => (s.includes(prompt) ? process.stdout.write(s) : undefined); // hide typing
		}
		rl.question(prompt, (answer) => {
			rl.close();
			if (process.stdin.isTTY) process.stdout.write('\n');
			resolve(answer);
		});
	});
}

const password = await readSecret('Password (min 12 chars): ');
if (password.length < 12) {
	console.error('password must be at least 12 characters');
	process.exit(1);
}
const { hash, salt, iterations } = await hashPassword(password);
const sql = `INSERT INTO moderators (username, password_hash, salt, iterations, created_at)
VALUES ('${username}', '${hash}', '${salt}', ${iterations}, '${new Date().toISOString()}')
ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, iterations = excluded.iterations;`;
const dir = mkdtempSync(join(tmpdir(), 'wm-mod-'));
const file = join(dir, 'mod.sql');
try {
	writeFileSync(file, sql, { mode: 0o600 });
	const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'wastemap-salui', remote ? '--remote' : '--local', `--file=${file}`], {
		stdio: 'inherit'
	});
	process.exit(r.status ?? 1);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
