import { randomBytes, pbkdf2Sync } from 'node:crypto';
import process from 'node:process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const iterations = 100_000;

function hashPassword(password: string, saltHex: string): string {
	return pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256').toString('hex');
}

function escapeSql(value: string): string {
	return value.replace(/'/g, "''");
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value || value.trim().length < 8) {
		throw new Error(`${name} must be set and at least 8 characters.`);
	}
	return value;
}

const adminPassword = requiredEnv('ADMIN_PASSWORD');
const judge1Password = requiredEnv('JUDGE1_PASSWORD');
const judge2Password = requiredEnv('JUDGE2_PASSWORD');
const judge3Password = requiredEnv('JUDGE3_PASSWORD');

const users = [
	{ username: 'admin', role: 'ADMIN', judgeNumber: null as number | null, displayName: 'Admin', password: adminPassword },
	{ username: 'judge1', role: 'JUDGE', judgeNumber: 1, displayName: 'Judge 1', password: judge1Password },
	{ username: 'judge2', role: 'JUDGE', judgeNumber: 2, displayName: 'Judge 2', password: judge2Password },
	{ username: 'judge3', role: 'JUDGE', judgeNumber: 3, displayName: 'Judge 3', password: judge3Password },
];

const statements: string[] = [];

for (const user of users) {
	const salt = randomBytes(16).toString('hex');
	const hash = hashPassword(user.password, salt);
	statements.push(`
INSERT INTO users (username, password_hash, password_salt, role, judge_number, display_name)
VALUES ('${escapeSql(user.username)}', '${hash}', '${salt}', '${user.role}', ${user.judgeNumber === null ? 'NULL' : user.judgeNumber}, '${escapeSql(user.displayName)}')
ON CONFLICT(username) DO UPDATE SET
	password_hash = excluded.password_hash,
	password_salt = excluded.password_salt,
	role = excluded.role,
	judge_number = excluded.judge_number,
	display_name = excluded.display_name,
	updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
`.trim());
}

const sql = statements.join('\n');
const tempDir = mkdtempSync(join(tmpdir(), 'ffdo-setup-users-'));
const sqlFile = join(tempDir, 'setup-users.sql');
writeFileSync(sqlFile, sql, 'utf8');

const target = process.argv.includes('--remote') ? '--remote' : '--local';
const wranglerCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const exec = spawnSync(
	wranglerCmd,
	['wrangler', 'd1', 'execute', 'family_fun_day', target, '--file', sqlFile],
	{ stdio: 'inherit' }
);

rmSync(tempDir, { recursive: true, force: true });

if (exec.status !== 0) {
	throw new Error('setup:users failed while executing SQL against D1.');
}

console.log(`setup:users completed (${target}).`);
