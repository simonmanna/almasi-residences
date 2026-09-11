#!/usr/bin/env bash
# Build and (re)start the whole stack on the VPS. Safe to re-run.
#
#   bash scripts/vps/deploy.sh           deploy the current checkout
#   SEED=1 bash scripts/vps/deploy.sh    also load placeholder content (first deploy)
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -f .env.production ]; then
  echo "✗ .env.production missing. Run: bash scripts/vps/init-env.sh <domain> <email>" >&2
  exit 1
fi
set -a; . ./.env.production; set +a

dc() { docker compose -f infra/docker-compose.prod.yml --env-file .env.production "$@"; }

echo "› building api + worker"
dc build api worker

echo "› starting postgres, redis, minio"
dc up -d --wait postgres redis minio

echo "› applying migrations"
dc run --rm --no-deps api pnpm --filter @avida/db migrate:deploy

if [ "${SEED:-0}" = "1" ]; then
  echo "› seeding placeholder content"
  dc run --rm --no-deps api pnpm --filter @avida/db seed
fi

echo "› starting api + worker"
dc up -d --wait api worker

# The web build pre-renders from the API that just came up.
echo "› building web + proxy"
dc build web caddy
dc up -d --wait web caddy

dc ps
echo "✓ live at ${SCHEME}://${DOMAIN}  (admin: ${SCHEME}://admin.${DOMAIN})"
