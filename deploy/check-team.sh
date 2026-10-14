#!/usr/bin/env bash
# Checks team notifications on the server: whether the Web Push key is there and loaded, recent
# push errors, and what the phones registered (without their secret ids or push tokens).
#
#   SSH_TARGET=root@72.61.207.108 bash deploy/check-team.sh
set -euo pipefail

: "${SSH_TARGET:?Set SSH_TARGET, for example root@72.61.207.108}"

ssh "$SSH_TARGET" 'bash -s' <<'REMOTE'
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"
KEY=/etc/credstore/lawhati-faisaldev-vapid.json

echo "== $(systemctl --version | head -1)   (ImportCredential needs 254 or newer)"
echo "== service: $(systemctl is-active lawhati-faisaldev)"
if $SUDO test -f "$KEY"; then
  echo "== key file: present, mode $($SUDO stat -c '%a %U' "$KEY"), project $($SUDO node -p "require('$KEY').project_id" 2>/dev/null || echo '(unreadable JSON)')"
else
  echo "== key file: MISSING ($KEY)"
fi

echo "== server log, last 6 hours:"
$SUDO journalctl -u lawhati-faisaldev --since -6h --no-pager -o cat | grep -E "Team notifications|Push failed|device\(s\)" | tail -15

echo "== phones registered (name | push token | team notifications | watched cards):"
$SUDO node -e '
const fs = require("fs");
const file = "/var/lib/lawhati-faisaldev/devices.json";
if (!fs.existsSync(file)) { console.log("  none yet: no phone with the new app has connected"); process.exit(0); }
for (const d of Object.values(JSON.parse(fs.readFileSync(file, "utf8")))) {
  const watched = Object.values(d.watches).reduce((n, cards) => n + cards.length, 0);
  console.log(`  ${d.name || "(no name)"} | ${d.push ? "yes" : "NO"} | ${d.team ? "on" : "OFF"} | ${watched}`);
}'
REMOTE
