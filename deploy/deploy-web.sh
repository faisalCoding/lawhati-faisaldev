#!/usr/bin/env bash
# Publishes the web version of the app at https://faisaldev.site/lawhati/, on the same server as
# the site and the sync server, then checks it.
#
#   SSH_TARGET=root@72.61.207.108 npm run deploy:web
#
# Copies the built site to /var/www/lawhati and enables the Apache alias for /lawhati only. The old
# address, https://faisaldev.site/lawhati/, sends visitors to the new one; the boards browsers saved
# there are brought over by the app (public/migrate.html). Safe to run again to publish a new version.
set -euo pipefail

: "${SSH_TARGET:?Set SSH_TARGET, for example root@72.61.207.108}"
APP_URL="${APP_URL:-https://faisaldev.site}"
OLD_URL="${OLD_URL:-https://faisaldev.site}"
cd "$(dirname "$0")/.."

echo "› Building the web version"
npm run build:web --silent

echo "› Uploading to $SSH_TARGET"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# COPYFILE_DISABLE keeps macOS metadata files (._*) out of the archive, and the flags its extended
# attributes, which the server's tar would warn about for every file.
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C dist-web -czf "$WORK/lawhati-web.tgz" .
scp -q "$WORK/lawhati-web.tgz" deploy/apache-lawhati.conf "$SSH_TARGET:/tmp/"

echo "› Installing"
ssh "$SSH_TARGET" "APP_URL='$APP_URL' OLD_URL='$OLD_URL' bash -s" <<'REMOTE'
set -euo pipefail
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

# Unpack next to the live copy and swap, so visitors never get a half-copied site.
$SUDO rm -rf /var/www/lawhati.new /var/www/lawhati.old
$SUDO install -d -m 755 /var/www/lawhati.new
$SUDO tar -xzf /tmp/lawhati-web.tgz -C /var/www/lawhati.new
$SUDO chmod -R a+rX /var/www/lawhati.new
if [ -d /var/www/lawhati ]; then $SUDO mv /var/www/lawhati /var/www/lawhati.old; fi
$SUDO mv /var/www/lawhati.new /var/www/lawhati
$SUDO rm -rf /var/www/lawhati.old

$SUDO a2enmod -q headers rewrite
$SUDO install -m 644 /tmp/apache-lawhati.conf /etc/apache2/conf-available/lawhati.conf
$SUDO a2enconf -q lawhati
if $SUDO apachectl configtest 2>/dev/null; then
  $SUDO systemctl reload apache2
else
  echo "Apache rejected the configuration; rolling back." >&2
  $SUDO a2disconf -q lawhati
  exit 1
fi
rm -f /tmp/lawhati-web.tgz /tmp/apache-lawhati.conf

sleep 1
# The app's page (not the site's): it loads the app's script. Deep links must get the same page.
check() {
  local page
  page="$(curl -fsS "$1")" || { echo "  $2: $1 did not answer" >&2; exit 1; }
  if grep -q "/lawhati/_expo/static/js" <<<"$page"; then echo "  $2: ok"; else echo "  $2: $1 is not the app" >&2; exit 1; fi
}
check "$APP_URL/lawhati/" "page"
check "$APP_URL/lawhati/board/example" "deep link"
# The old address sends visitors to the new one, except for the page that hands over their boards.
moved="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "$OLD_URL/lawhati/board/example")"
if [ "$moved" = "301 $APP_URL/lawhati/board/example" ]; then echo "  old address: ok"; else echo "  old address: got \"$moved\"" >&2; exit 1; fi
if curl -fsS "$OLD_URL/lawhati/migrate.html" | grep -q "lawhati-previous-address"; then echo "  hand-over page: ok"; else echo "  hand-over page: missing at $OLD_URL" >&2; exit 1; fi
REMOTE

echo "✓ Published at $APP_URL/lawhati/"
