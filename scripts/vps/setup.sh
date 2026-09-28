#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 VPS. Run as root from the
# cloned repo:  sudo bash scripts/vps/setup.sh
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)

apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl git openssl ufw fail2ban unattended-upgrades

# Docker Engine + compose plugin, from Docker's own apt repository.
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Firewall: SSH and web only. (Compose publishes nothing else publicly; the
# API port is bound to 127.0.0.1.)
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

systemctl enable --now fail2ban
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades

# The Next.js build peaks above 2 GB; swap keeps a small VPS from OOM-killing it.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Faster delivery to distant mobile visitors (BBR, HTTP/3 buffers).
bash "$REPO/scripts/vps/tune-network.sh"

echo "15 3 * * * root bash $REPO/scripts/vps/backup.sh >> /var/log/avida-backup.log 2>&1" \
  > /etc/cron.d/avida-backup

echo "✓ VPS ready. Next: bash scripts/vps/init-env.sh <domain> <email>, then SEED=1 bash scripts/vps/deploy.sh"
