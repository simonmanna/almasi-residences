# Deploying to a single VPS

Everything runs on one server: the public site, the API, the admin, the media
worker, Postgres (PostGIS), Redis, and media storage. MinIO provides the S3 API,
so moving media to any other S3-compatible host later only means changing
environment values (see the end of this page).

```
                    ┌──────────────── VPS (Docker) ────────────────┐
 internet ─80/443─▶ │ Caddy ── example.com ─────────▶ web :3000     │
                    │       ── api.example.com ─────▶ api :3001 ─┐  │
                    │       ── admin.example.com ───▶ /srv/admin │  │
                    │       ── storage.example.com ─▶ minio :9000│  │
                    │                    worker ◀── redis ◀──────┤  │
                    │                                postgres ◀──┘  │
                    └───────────────────────────────────────────────┘
```

## 1. Server

- Ubuntu 24.04 LTS, x86-64.
- At least 4 vCPU, 8 GB RAM, 80 GB SSD. The Next.js build and video encoding
  are the peaks.
- Log in with an SSH key, not a password.

## 2. DNS

Add these A records at your registrar, all pointing at the VPS IP address:

| Name | Serves |
|---|---|
| `@` | public site |
| `www` | redirects to the bare domain |
| `api` | API |
| `admin` | sales admin |
| `storage` | images and video |

Wait until `ping api.example.com` answers from the VPS IP before deploying.
Caddy requests the certificates on first start, and Let's Encrypt rate-limits
repeated failures.

## 3. First deploy

```bash
git clone https://github.com/saimenogm/Real-Estate-Website.git /opt/avida
cd /opt/avida
sudo bash scripts/vps/setup.sh                              # docker, firewall, swap, nightly backup
sudo bash scripts/vps/init-env.sh example.com you@example.com   # writes .env.production with fresh secrets
sudo SEED=1 bash scripts/vps/deploy.sh                      # build, migrate, load placeholder content, start
```

`SEED=1` loads the placeholder development (92 units). Run it once only. It
creates no admin accounts in production.

## 4. Admin accounts

Production requires two-factor sign-in for every admin account. Create each
account on the server:

```bash
cd /opt/avida
docker compose -f infra/docker-compose.prod.yml --env-file .env.production \
  --profile tools run --rm --no-deps tools node scripts/create-admin.mjs you@example.com "Your Name" OWNER
```

The command prints a password and an `otpauth://` URI. Add the URI to an
authenticator app (Google Authenticator, 1Password, Authy…), then sign in at
`https://admin.example.com`. Running it again for the same email resets the
password and the 2FA secret. Roles are `OWNER`, `MARKETING` and `SALES`.

## 5. Updating

```bash
cd /opt/avida && git pull && sudo bash scripts/vps/deploy.sh
```

Migrations run on every deploy. The site stays up while images build; each
container is replaced only once its new image is ready.

## 6. Backups

`setup.sh` installs a cron job that runs `scripts/vps/backup.sh` at 03:15
every night. It writes a database dump, a media archive and a copy of
`.env.production` to `/var/backups/avida`, and keeps 14 days. **Also copy that
folder off the server** (for example with `rclone` to any cloud drive). A
backup kept on the same machine is lost along with it.

Restore the database:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env.production \
  exec -T postgres pg_restore -U avida -d avida --clean --if-exists < /var/backups/avida/db-YYYY-MM-DD-HHMM.dump
```

Restore media: stop `minio`, extract the archive into the `avida-prod_miniodata`
volume, start it again.

## 7. Everyday operations

```bash
alias dc='docker compose -f infra/docker-compose.prod.yml --env-file .env.production'
dc ps                      # what's running
dc logs -f api             # follow one service
dc restart web
dc exec postgres psql -U avida avida
```

## Moving media to a hosted object store later

Once media grows past a few GB, or you want a CDN in front of it:

1. Create buckets `avida-media` (public) and `avida-originals` (private) on any
   S3-compatible host.
2. Copy the objects across (`rclone sync` from MinIO).
3. In `infra/docker-compose.prod.yml` point `S3_ENDPOINT`, `S3_PUBLIC_URL`,
   the S3 keys and `NEXT_PUBLIC_MEDIA_URL` at the new host, then run `deploy.sh`.
4. Remove the `minio`, `minio-init` and storage site entries.

## Notes

- MinIO no longer publishes community Docker images. The stack pins the last
  release (`RELEASE.2025-09-07T16-13-09Z`). That's fine for a private bucket
  behind Caddy, but it's one more reason to move to a hosted bucket when media
  grows.
- The web build reads live inventory from the API (§6.7), so `deploy.sh`
  always starts the API before it builds the web image.
