import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(databasePool = pool) {
  if (!databasePool) {
    throw new Error('Database access requires DATABASE_URL.');
  }

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await databasePool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file],
    );
    if (alreadyApplied.rowCount > 0) continue;

    const sql = await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
    const client = await databasePool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await migrate();
    process.stdout.write('Database migrations are up to date.\n');
  } catch (error) {
    process.stderr.write(`Database migration failed: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
