#!/usr/bin/env bash
# Writes .env.production from infra/env.production.example with fresh secrets.
#
#   bash scripts/vps/init-env.sh <domain> <acme-email> [https|http]
set -euo pipefail
cd "$(dirname "$0")/../.."

DOMAIN=${1:?usage: init-env.sh <domain> <acme-email> [https|http]}
EMAIL=${2:?usage: init-env.sh <domain> <acme-email> [https|http]}
SCHEME=${3:-https}

if [ -f .env.production ]; then
  echo "✗ .env.production already exists; not overwriting its secrets." >&2
  exit 1
fi

umask 077
while IFS= read -r line; do
  case "$line" in
    DOMAIN=*) echo "DOMAIN=$DOMAIN" ;;
    SCHEME=*) echo "SCHEME=$SCHEME" ;;
    ACME_EMAIL=*) echo "ACME_EMAIL=$EMAIL" ;;
    *=__GENERATE__) echo "${line%%=*}=$(openssl rand -hex 32)" ;;
    *) echo "$line" ;;
  esac
done < infra/env.production.example > .env.production

echo "✓ wrote .env.production for ${SCHEME}://${DOMAIN} (mode 600). Back it up somewhere safe."
