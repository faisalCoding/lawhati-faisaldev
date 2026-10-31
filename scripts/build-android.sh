#!/usr/bin/env bash
# Builds the Android app as a signed APK, ready to install or send to someone, and checks it.
#
#   npm run build:android
#
# The addresses are baked into the bundle at build time, as they are for the web version: without
# the sync address the app falls back to ws://localhost:8787, a phone has no server there, and
# nothing syncs — the app looks fine until someone shares a board. So they are set here, from the
# site's address, and the finished APK is searched for the sync address before it is handed over.
#
# It is signed with the release key named in keystore.properties (see plugins/withReleaseSigning.js).
# Without that file Gradle quietly signs with the debug key instead, and Android, which knows an app
# by its signature, would refuse such an APK as an update to an installed copy. So the file is
# required, and the signature on the result is checked too.
set -euo pipefail
cd "$(dirname "$0")/.."

SITE_URL="${SITE_URL:-https://faisaldev.site}"
export EXPO_PUBLIC_SYNC_URL="${EXPO_PUBLIC_SYNC_URL:-wss://${SITE_URL#*://}/lawhati-sync/}"
export EXPO_PUBLIC_APP_URL="${EXPO_PUBLIC_APP_URL:-$SITE_URL/lawhati-app}"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

if [ ! -f keystore.properties ]; then
  echo "keystore.properties is missing: the APK would be signed with the debug key and could not update an installed copy." >&2
  exit 1
fi

echo "› Bringing the native project in line with app.json"
CI=1 npx expo prebuild --platform android --no-install >/dev/null

echo "› Building the release APK for $EXPO_PUBLIC_SYNC_URL (this takes a few minutes)"
(cd android && ./gradlew assembleRelease --quiet)

APK=android/app/build/outputs/apk/release/app-release.apk
# grep -c, not grep -q: under pipefail, -q stops reading at the first match, the writer upstream
# dies of a broken pipe, and the pipeline reports failure for an APK that is fine.
FOUND="$(unzip -p "$APK" assets/index.android.bundle | grep -ac 'lawhati-sync' || true)"
if [ "${FOUND:-0}" -eq 0 ]; then
  echo "The APK does not carry $EXPO_PUBLIC_SYNC_URL: it would not sync." >&2
  exit 1
fi

# The signature is read whole before it is searched, for the same reason — and here a broken pipe
# would have let a debug-signed APK through, which is the one thing this check is for.
APKSIGNER="$(ls -d "$SDK"/build-tools/*/apksigner 2>/dev/null | tail -1)"
if [ -n "$APKSIGNER" ]; then
  CERTS="$("$APKSIGNER" verify --print-certs "$APK")"
  if grep -q 'CN=Android Debug' <<<"$CERTS"; then
    echo "The APK is signed with the debug key: it could not update an installed copy." >&2
    exit 1
  fi
fi

VERSION="$(node -p "require('./app.json').expo.version")"
OUT="dist-android/lawhati-$VERSION.apk"
mkdir -p dist-android
cp "$APK" "$OUT"
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
