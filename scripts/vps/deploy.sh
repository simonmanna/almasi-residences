#!/usr/bin/env bash
# Build and (re)start the whole stack on the VPS. Safe to re-run.
#
#   bash scripts/vps/deploy.sh           deploy the current checkout
#   SEED=1 bash scripts/vps/deploy.sh    also load placeholder content (first deploy)
#
# The deploy runs detached from the terminal and logs to /var/log/avida-deploy.log,
# so a dropped SSH session no longer kills it halfway. This shell only follows
# the log; if it disconnects, reconnect and `tail -f` the log instead.
set -euo pipefail
cd "$(dirname "$0")/../.."

LOG=/var/log/avida-deploy.log
PIDFILE=/run/avida-deploy.pid
STATUS="$LOG.status"

if [ -z "${AVIDA_DEPLOY_CHILD:-}" ]; then
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "✗ a deploy is already running (pid $(cat "$PIDFILE")); follow it with: tail -f $LOG" >&2
    exit 1
  fi
  rm -f "$STATUS"
  AVIDA_DEPLOY_CHILD=1 setsid nohup bash "$0" "$@" >"$LOG" 2>&1 </dev/null &
  pid=$!
  echo "$pid" >"$PIDFILE"
  echo "› deploy running as pid $pid, logging to $LOG (safe to disconnect)"
  tail -n +1 -f --pid="$pid" "$LOG"
  code="$(cat "$STATUS" 2>/dev/null || echo 1)"
  rm -f "$PIDFILE"
  exit "$code"
fi

trap 'echo $? >"$STATUS"' EXIT

if [ ! -f .env.production ]; then
  echo "✗ .env.production missing. Run: bash scripts/vps/init-env.sh <domain> <email>" >&2
  exit 1
fi
set -a; . ./.env.production; set +a

dc() { docker compose -f infra/docker-compose.prod.yml --env-file .env.production "$@"; }

# A registry that stops answering must fail the deploy, not hang it for hours.
# Each build gets BUILD_TIMEOUT and one retry.
BUILD_TIMEOUT="${BUILD_TIMEOUT:-30m}"
build() {
  local attempt
  for attempt in 1 2; do
    if timeout -k 1m "$BUILD_TIMEOUT" docker compose -f infra/docker-compose.prod.yml \
         --env-file .env.production --profile tools build "$@"; then
      return 0
    fi
    echo "! build of $* failed or timed out (attempt $attempt)" >&2
  done
  return 1
}

# Base images come from Docker Hub, which has reset connections mid-deploy
# before. Pull them up front with retries; the builds then find them locally.
echo "› pulling base images"
for img in node:24-bookworm-slim caddy:2-alpine; do
  for attempt in 1 2 3; do
    timeout 5m docker pull -q "$img" >/dev/null && break
    [ "$attempt" = 3 ] && { echo "✗ could not pull $img" >&2; exit 1; }
    echo "! pull of $img failed, retrying" >&2
    sleep 10
  done
done

echo "› building api + worker + tools"
build api worker tools

echo "› starting postgres, redis, minio"
dc up -d --wait postgres redis minio

echo "› applying migrations"
dc --profile tools run --rm --no-deps tools pnpm --filter @avida/db migrate:deploy

if [ "${SEED:-0}" = "1" ]; then
  echo "› seeding placeholder content"
  dc --profile tools run --rm --no-deps tools pnpm --filter @avida/db seed
fi

echo "› starting api + worker"
dc up -d --wait api worker

# The web build pre-renders from the API that just came up.
echo "› building web + proxy"
build web caddy
dc up -d --wait web caddy

# Warm the page cache and the image optimizer so the first visitor after a
# deploy is not the one who waits for renders and resizes.
echo "› warming caches"
base="${SCHEME}://${DOMAIN}"
for path in / /residences /gallery /amenities /location /3d-design /tour/penthouse; do
  curl -s -o /dev/null --max-time 30 "$base$path" || true
done
for img in hero-wide-v2.png introduction-arrival-v2.png; do
  for w in 640 828 1080 1280 1600 1920 2560; do
    for accept in image/avif image/webp; do
      curl -s -o /dev/null --max-time 30 -H "Accept: $accept" "$base/_next/image?url=%2Fmedia%2F$img&w=$w&q=82" || true
    done
  done
done

# Build cache grew to 50 GB once; keep enough for fast rebuilds, drop the rest.
echo "› trimming build cache"
docker builder prune -f --keep-storage "${BUILD_CACHE_KEEP:-15GB}" >/dev/null || true
docker image prune -f >/dev/null || true

dc ps
echo "✓ live at ${SCHEME}://${DOMAIN}  (admin: ${SCHEME}://admin.${DOMAIN})"
