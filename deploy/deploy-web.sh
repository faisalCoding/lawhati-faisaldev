#!/usr/bin/env bash
# Publishes the web version of the app at https://faisaldev.site/lawhati-app/, on the same server
# as the site and the sync server, then checks it.
#
#   SSH_TARGET=root@72.61.207.108 npm run deploy:web
#
# Copies the built site to /var/www/lawhati-app and enables the Apache alias for /lawhati-app only.
# Not /lawhati — the site's own account pages live there. Safe to run again to publish a new
# version. This instance is new, so there is no previous address to carry boards over from.
set -euo pipefail

: "${SSH_TARGET:?Set SSH_TARGET, for example root@72.61.207.108}"
APP_URL="${APP_URL:-https://faisaldev.site}"
# The sync address is baked into the bundle at build time. Without it the app falls back to
# ws://<host>:8787 — a plain-ws address an https page is not allowed to open at all, so sharing a
# board fails with nothing listening and nothing to see. Derived from APP_URL so the published app
# and the server it talks to cannot drift apart; Apache proxies this path to the sync service.
SYNC_URL="${SYNC_URL:-wss://${APP_URL#*://}/lawhati-sync/}"
cd "$(dirname "$0")/.."

echo "› Building the web version for $SYNC_URL"
EXPO_PUBLIC_SYNC_URL="$SYNC_URL" npm run build:web --silent

# It has been built without it once, and the app looked fine until someone tried to share a board.
if ! grep -rq 'lawhati-sync' dist-web/_expo/static/js/web/; then
  echo "The build does not carry $SYNC_URL; it would fall back to ws://host:8787." >&2
  exit 1
fi

echo "› Uploading to $SSH_TARGET"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# COPYFILE_DISABLE keeps macOS metadata files (._*) out of the archive, and the flags its extended
# attributes, which the server's tar would warn about for every file.
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C dist-web -czf "$WORK/lawhati-web.tgz" .
scp -q "$WORK/lawhati-web.tgz" deploy/apache-lawhati.conf "$SSH_TARGET:/tmp/"

echo "› Installing"
ssh "$SSH_TARGET" "APP_URL='$APP_URL' bash -s" <<'REMOTE'
set -euo pipefail
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

# Unpack next to the live copy and swap, so visitors never get a half-copied site.
$SUDO rm -rf /var/www/lawhati-app.new /var/www/lawhati-app.old
$SUDO install -d -m 755 /var/www/lawhati-app.new
$SUDO tar -xzf /tmp/lawhati-web.tgz -C /var/www/lawhati-app.new
$SUDO chmod -R a+rX /var/www/lawhati-app.new
if [ -d /var/www/lawhati-app ]; then $SUDO mv /var/www/lawhati-app /var/www/lawhati-app.old; fi
$SUDO mv /var/www/lawhati-app.new /var/www/lawhati-app
$SUDO rm -rf /var/www/lawhati-app.old

$SUDO a2enmod -q headers
# Named for this instance, not «lawhati». The other instance on this server installs its own web
# conf as conf-available/lawhati.conf and enables it as «lawhati»; sharing the name meant whichever
# deployed last silently replaced the other's routing, and that is exactly what happened once.
$SUDO install -m 644 /tmp/apache-lawhati.conf /etc/apache2/conf-available/lawhati-faisaldev.conf
$SUDO a2enconf -q lawhati-faisaldev
# Apache's own words, not just "it said no": the message names the line and the reason, and
# without it a rejection here is a guess. configtest writes to stderr even when it passes.
if check="$($SUDO apachectl configtest 2>&1)"; then
  $SUDO systemctl reload apache2
else
  echo "Apache rejected the configuration; rolling back." >&2
  echo "$check" | sed 's/^/  /' >&2
  $SUDO a2disconf -q lawhati-faisaldev
  exit 1
fi
rm -f /tmp/lawhati-web.tgz /tmp/apache-lawhati.conf

sleep 1
# The app's page (not the site's): it loads the app's script. Deep links must get the same page.
check() {
  local page
  page="$(curl -fsS "$1")" || { echo "  $2: $1 did not answer" >&2; exit 1; }
  if grep -q "/lawhati-app/_expo/static/js" <<<"$page"; then echo "  $2: ok"; else echo "  $2: $1 is not the app" >&2; exit 1; fi
}
check "$APP_URL/lawhati-app/" "page"
check "$APP_URL/lawhati-app/board/example" "deep link"
# The site's own account pages must still answer. They live under /apps/lawhati because another
# instance left a server-wide redirect owning /lawhati/ on this machine.
for path in /apps/lawhati/login /apps/lawhati/signup; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$APP_URL$path")"
  if [ "$code" = "200" ]; then echo "  $path: ok"; else echo "  $path: got $code — the app may be shadowing it" >&2; exit 1; fi
done
REMOTE

# Published, but sharing a board needs the sync service too — it is deployed by deploy.sh, not
# this script, so say which of the two is down rather than failing the web deploy over it.
if [ "$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$APP_URL/lawhati-sync/health" || true)" = "200" ]; then
  echo "  sync: ok"
else
  echo "  sync: $APP_URL/lawhati-sync/health is not answering — run deploy/deploy.sh" >&2
fi

echo "✓ Published at $APP_URL/lawhati-app/"
