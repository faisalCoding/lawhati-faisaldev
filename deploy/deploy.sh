#!/usr/bin/env bash
# Deploys the sync server to an Ubuntu + Apache server over SSH, then checks it end to end.
#
#   SSH_TARGET=root@72.61.207.108 SITE_URL=https://faisaldev.site npm run deploy:server
#
# Installs /opt/lawhati-faisaldev/lawhati-faisaldev.cjs and the `lawhati-faisaldev` systemd service, and enables the
# Apache proxy for /lawhati-sync/ only. Safe to run again to update the server.
#
# The shared boards and registered phones (/var/lib/lawhati-faisaldev) are never changed: an update replaces
# only the program. They are copied to /var/backups/lawhati-sync/<time> first, and the number of
# shared boards the restarted server loads is checked against the copy.
set -euo pipefail

: "${SSH_TARGET:?Set SSH_TARGET, for example root@72.61.207.108}"
SITE_URL="${SITE_URL:-https://faisaldev.site}"
cd "$(dirname "$0")/.."

echo "› Building the server bundle"
npm run build:server --silent

echo "› Uploading to $SSH_TARGET"
scp -q server/dist/lawhati-faisaldev.cjs deploy/lawhati-faisaldev.service deploy/apache-lawhati-sync.conf "$SSH_TARGET:/tmp/"

echo "› Installing"
ssh "$SSH_TARGET" "SITE_URL='$SITE_URL' bash -s" <<'REMOTE'
set -euo pipefail
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Node.js is not installed system-wide. Install Node 20+ first (see deploy/README.md)." >&2
  exit 1
fi
case "$NODE_BIN" in
  /root/*|/home/*)
    echo "Node is installed per user ($NODE_BIN); the service needs a system-wide Node (see deploy/README.md)." >&2
    exit 1 ;;
esac
if [ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Node $("$NODE_BIN" -v) is too old; version 18 or newer is required." >&2
  exit 1
fi

DATA_DIR=/var/lib/lawhati-faisaldev
BOARDS_BEFORE=""
if $SUDO test -f "$DATA_DIR/data.json"; then
  BACKUP="/var/backups/lawhati-sync/$(date +%Y%m%d-%H%M%S)"
  $SUDO install -d -m 700 "$BACKUP"
  $SUDO cp -a "$DATA_DIR"/. "$BACKUP"/
  BOARDS_BEFORE="$($SUDO "$NODE_BIN" -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))).length)' "$DATA_DIR/data.json")"
  echo "  backup:         $BACKUP ($BOARDS_BEFORE shared boards)"
fi
STARTED_AT="$(date '+%Y-%m-%d %H:%M:%S')"

$SUDO install -d -m 755 /opt/lawhati-faisaldev
$SUDO install -m 644 /tmp/lawhati-faisaldev.cjs /opt/lawhati-faisaldev/lawhati-faisaldev.cjs
sed "s#/usr/bin/node#$NODE_BIN#" /tmp/lawhati-faisaldev.service | $SUDO tee /etc/systemd/system/lawhati-faisaldev.service >/dev/null
$SUDO systemctl daemon-reload
$SUDO systemctl enable lawhati-faisaldev >/dev/null 2>&1
$SUDO systemctl restart lawhati-faisaldev

$SUDO a2enmod -q proxy proxy_http
$SUDO install -m 644 /tmp/apache-lawhati-sync.conf /etc/apache2/conf-available/lawhati-faisaldev-sync.conf
$SUDO a2enconf -q lawhati-faisaldev-sync
if $SUDO apachectl configtest 2>/dev/null; then
  $SUDO systemctl reload apache2
else
  echo "Apache rejected the configuration; rolling back the proxy." >&2
  $SUDO a2disconf -q lawhati-faisaldev-sync
  exit 1
fi
rm -f /tmp/lawhati-faisaldev.cjs /tmp/lawhati-faisaldev.service /tmp/apache-lawhati-sync.conf

sleep 1
echo -n "  service:        " && curl -fsS http://127.0.0.1:8788/health && echo
echo -n "  through Apache: " && curl -fsS "$SITE_URL/lawhati-sync/health" && echo
if [ -n "$BOARDS_BEFORE" ]; then
  LOADED="$($SUDO journalctl -u lawhati-faisaldev --since "$STARTED_AT" -o cat | grep -o 'Loaded [0-9]* shared' | tail -1 | grep -o '[0-9]*' || true)"
  echo "  shared boards:  $BOARDS_BEFORE before, ${LOADED:-?} after the restart"
  if [ "${LOADED:-}" != "$BOARDS_BEFORE" ]; then
    echo "The restarted server did not load the same boards. The copy is in $BACKUP." >&2
    exit 1
  fi
fi
REMOTE

echo "✓ Deployed. In the app, use: ${SITE_URL/https:/wss:}/lawhati-sync/"
