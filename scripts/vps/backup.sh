#!/usr/bin/env bash
# Database dump + media snapshot, kept KEEP_DAYS days. setup.sh installs a
# nightly cron entry. Copy $BACKUP_DIR off the server too: a backup on the
# machine it protects does not survive losing that machine.
set -euo pipefail
cd "$(dirname "$0")/../.."

DEST=${BACKUP_DIR:-/var/backups/avida}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%F-%H%M)
mkdir -p "$DEST"

dc() { docker compose -f infra/docker-compose.prod.yml --env-file .env.production "$@"; }

dc exec -T postgres pg_dump -U avida -d avida --format=custom > "$DEST/db-$STAMP.dump"
docker run --rm -v avida-prod_miniodata:/data:ro -v "$DEST":/backup alpine \
  tar czf "/backup/media-$STAMP.tar.gz" -C /data .
cp .env.production "$DEST/env-$STAMP"
chmod 600 "$DEST"/*

find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete
echo "✓ backup $STAMP → $DEST"
