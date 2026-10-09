# Production operations

## Deployment checklist

1. Provision PostgreSQL with automated point-in-time backups, TLS, and the
   `vector` extension. Do not use
   the development credentials or exposed port from `docker-compose.yml`.
2. Configure `NODE_ENV=production`, `DATABASE_URL`, both Clerk server keys,
   explicit `CORS_ORIGINS`, and `TRUST_PROXY=true` only when the API is behind
   the expected trusted reverse proxy. Set provider keys only in the server's
   secret manager; never use `VITE_` prefixes for secrets.
3. Set `CHAT_DAILY_QUOTA` to the per-user daily request allowance appropriate
   for the provider account and budget. Requests that pass API validation
   consume one quota unit before generation, including provider failures and
   client disconnects.
   For document search, configure the server-only `OPENAI_API_KEY` for the
   embeddings API, even if chat is routed to a different model vendor.
4. Build and test the exact release artifact with `npm ci`, `npm test`,
   `npm run lint`, and `npm run build`. Keep `dist/` and server code from the
   same revision.
5. Take a pre-release backup, then run `npm run db:migrate` as a release step
   with network access to the production database. Do not have every web
   replica independently run migrations at startup. Migration 007 requires
   pgvector to be installed/enabled on that PostgreSQL instance.
6. Start the API and verify `GET /api/health` for liveness and
   `GET /api/health/ready` for database readiness before routing traffic.
   Monitor structured logs by `requestId`; never log message bodies, session
   tokens, or provider credentials.
7. For rollback, redeploy the previous application release only when the
   migration is backward-compatible. Restore the database only as a deliberate
   recovery action into a verified target, not as a routine deployment step.

The API's in-memory per-IP rate limiter is local to each process; use a shared
rate-limit store at the edge or in the application platform when deploying
multiple replicas. The daily per-user chat quota is stored atomically in
PostgreSQL and is shared across replicas.

## PostgreSQL backup and restore

Use the PostgreSQL client tools matching the supported server version. Run
commands from PowerShell with `DATABASE_URL` supplied by a protected
environment/secret manager; do not put credentials in command history or
commit a populated environment file.

Create a custom-format database backup:

```powershell
$backup = Join-Path $env:BACKUP_DIR ("chatbot-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dump")
pg_dump --format=custom --no-owner --file=$backup $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
pg_restore --list $backup | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Backup archive verification failed" }
```

Encrypt the archive at rest, restrict access, and apply a documented retention
policy. Test restores regularly in an isolated database:

```powershell
pg_restore --clean --if-exists --no-owner --dbname=$env:RESTORE_DATABASE_URL $backup
if ($LASTEXITCODE -ne 0) { throw "Restore failed" }
```

`--clean` removes matching objects in the target database. Never point this
restore command at production unless executing an approved recovery plan.
Verify the restored schema with `npm run db:migrate` and check the application
using `/api/health/ready` plus authenticated conversation and upload checks.

File bytes live outside PostgreSQL in `UPLOAD_STORAGE_DIR`; database backups
alone do not back them up. Back up the private upload directory using the
deployment platform's encrypted filesystem/object-storage backup mechanism,
and coordinate its snapshot with the database backup. Test restoring both
metadata and file bytes together. Extracted text, chunks, and vector embeddings
are stored in PostgreSQL, but are not a substitute for the original uploaded
file. Ensure pgvector is installed before restoring/applying migration 007.

The `chat_usage_daily` table retains one counter row per active user per day.
Operators may remove old counters according to their retention policy:

```sql
DELETE FROM chat_usage_daily
WHERE usage_date < CURRENT_DATE - INTERVAL '90 days';
```
