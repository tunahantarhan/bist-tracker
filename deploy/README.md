# Deployment

The whole stack runs on one Linux server with Docker Compose: Postgres, Redis, the API
(FastAPI + the APScheduler market scan), the Next.js web app and Caddy, which serves
both on one domain with automatic HTTPS (`/api/*` → API, everything else → web).

## Server

- A VPS / cloud server (not shared hosting: the app needs Docker and a process that runs
  all day). Ubuntu 24.04, 2 vCPU, 4 GB RAM, 40 GB disk is enough; 2 GB RAM can run it but
  the web build may run out of memory.
- Ports 80 and 443 open, SSH access.
- A domain or sub-domain whose DNS `A` record points at the server's IP.

## First install

```bash
# on the server
curl -fsSL https://get.docker.com | sh
git clone https://github.com/tunahantarhan/bist-tracker.git && cd bist-tracker
cp deploy/.env.example deploy/.env && nano deploy/.env    # DOMAIN, SECRET_KEY, POSTGRES_PASSWORD, SMTP_*
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml logs -f backend   # first scan takes a few minutes
```

Migrations run automatically when the API container starts.

## Moving the local database (rules, users, admin 2FA)

```bash
# on the Mac
docker exec bist-tracker-db-1 pg_dump -U postgres -Fc bist_tracker_db > bist.dump
scp bist.dump user@server:~/bist-tracker/

# on the server
C="docker compose -f deploy/docker-compose.yml"
$C stop backend
$C exec -T db pg_restore -U postgres -d bist_tracker_db --clean --if-exists < bist.dump
$C start backend
```

Without a dump, create the admin through the API's register flow, seed the default rules
from the admin panel and run `$C exec backend python -m app.scripts.sync_stock_catalog --activate-all`.

## Updating

```bash
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

## Operations

- Logs: `docker compose -f deploy/docker-compose.yml logs -f backend`
- Nightly backup (crontab): `0 3 * * * cd ~/bist-tracker && docker compose -f deploy/docker-compose.yml exec -T db pg_dump -U postgres -Fc bist_tracker_db > ~/backups/bist-$(date +\%F).dump`
- Lost admin authenticator: `$C exec backend python -m app.scripts.reset_admin_2fa <email>`
- Yahoo Finance rate-limits data-centre IPs harder than home connections. Watch the
  backend log for HTTP 429 / circuit breaker messages after the first day and lower
  `YAHOO_MAX_RPS` in `deploy/.env` if they repeat.
