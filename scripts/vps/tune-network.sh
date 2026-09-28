#!/usr/bin/env bash
# Kernel TCP tuning for visitors far from the server. Safe to re-run.
#
#   bash scripts/vps/tune-network.sh
#
# The VPS is in France; most visitors are in East Africa on mobile networks,
# ~180 ms away with some packet loss. Linux's default (cubic) halves its send
# rate on every lost packet and restarts slow start after a pause, so pages and
# images crawl on exactly those links. BBR paces by measured bandwidth instead,
# and keeping the window across idle gaps stops each new request on a
# kept-alive connection from starting cold.
set -euo pipefail

conf=/etc/sysctl.d/90-avida-network.conf
cat > "$conf" <<'EOF'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_fastopen = 3
net.ipv4.tcp_mtu_probing = 1
# QUIC (HTTP/3) buffers: Caddy warns and under-performs with the 208 KB default.
net.core.rmem_max = 7500000
net.core.wmem_max = 7500000
EOF

echo tcp_bbr > /etc/modules-load.d/bbr.conf
modprobe tcp_bbr
sysctl --system >/dev/null

echo "✓ congestion control: $(sysctl -n net.ipv4.tcp_congestion_control), qdisc: $(sysctl -n net.core.default_qdisc)"
