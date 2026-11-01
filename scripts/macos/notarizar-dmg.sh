#!/usr/bin/env bash
# Notarizes the DMG and staples the ticket to it. Tauri notarizes and staples
# the .app inside, but only signs the DMG around it, and the DMG is what people
# download. Uses the same credentials preparar-firma.sh exported for Tauri.
#
#   scripts/macos/notarizar-dmg.sh <path to the .dmg>

set -euo pipefail

dmg="$1"

if [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  credenciales=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
elif [ -n "${APPLE_ID:-}" ]; then
  credenciales=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
else
  echo "::error title=Notarización del DMG::No notarization credentials: run scripts/macos/preparar-firma.sh first." >&2
  exit 1
fi

echo "Sending $(basename "$dmg") to Apple's notary service..."
resultado=$(xcrun notarytool submit "$dmg" "${credenciales[@]}" --wait --output-format json)
echo "$resultado"
estado=$(plutil -extract status raw -o - - <<<"$resultado" 2>/dev/null || echo "?")
if [ "$estado" != Accepted ]; then
  id=$(plutil -extract id raw -o - - <<<"$resultado" 2>/dev/null || true)
  if [ -n "$id" ]; then
    xcrun notarytool log "$id" "${credenciales[@]}" || true
  fi
  echo "::error title=Notarización del DMG::Apple answered \"$estado\" for the DMG."
  exit 1
fi

# stapler asks Apple's CDN for the ticket, and the GitHub runner drops its
# network now and then: on 2026-10-31 the 3.7.11 release failed on "The network
# connection was lost" right after Apple had accepted the DMG. A few tries with
# a pause cover that; a real problem still fails after the last one.
intentar() {
  local intento
  for intento in 1 2 3 4; do
    if "$@"; then
      return 0
    fi
    [ "$intento" = 4 ] && break
    echo "::warning title=Notarización del DMG::\"$*\" failed (try $intento of 4), retrying in 20 s."
    sleep 20
  done
  echo "::error title=Notarización del DMG::\"$*\" failed 4 times."
  return 1
}

intentar xcrun stapler staple "$dmg"
intentar xcrun stapler validate "$dmg"
