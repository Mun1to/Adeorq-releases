#!/usr/bin/env bash
# Decides how the macOS build gets signed, from whatever Apple secrets the
# workflow has, and hands Tauri exactly the variables it reads.
#
# Input (environment, normally from GitHub secrets):
#   APPLE_CERTIFICATE           the Developer ID Application .p12, base64
#   APPLE_CERTIFICATE_PASSWORD  its password
# and, to notarize, one of these two routes (the first wins if both are set):
#   APPLE_API_ISSUER            App Store Connect Issuer ID      } team API key
#   APPLE_API_KEY               App Store Connect Key ID         } (an individual
#   APPLE_API_KEY_P8            the AuthKey_<Key ID>.p8 text     }  key cannot notarize)
#   APPLE_ID                    the Apple Account email          } app-specific
#   APPLE_PASSWORD              an app-specific password for it  } password
#
# Output: `modo=adhoc|firmado|notarizado` in GITHUB_OUTPUT, and the variables
# Tauri expects in GITHUB_ENV, but only for the steps that come after this one.
# A secret that does not exist reaches a step as an empty string, and Tauri
# treats an empty variable as a set one, so nothing is exported unless complete.
#
#   nothing        -> adhoc       exports nothing: a plain ad-hoc build, which runs
#                                 but opens with the "Apple could not verify" dialog.
#   certificate    -> firmado     signed with Developer ID, not notarized. Still
#                                 better than ad-hoc: macOS keeps the
#                                 Accessibility permission across updates.
#   everything     -> notarizado  signed and notarized: opens without the
#                                 "Apple could not verify" dialog.
#
# Nothing here prints a secret, and nothing runs with `set -x`.

set -euo pipefail

tiene() { [ -n "${!1:-}" ]; }

: "${GITHUB_ENV:?this script only runs inside GitHub Actions}"
: "${GITHUB_OUTPUT:?this script only runs inside GitHub Actions}"
temporal="${RUNNER_TEMP:-$(mktemp -d)}"

# Writes NAME=value to GITHUB_ENV with a random delimiter, so a value can never
# end the block early or smuggle in a variable of its own.
exportar() {
  local delimitador
  delimitador="FIN_$(openssl rand -hex 16)"
  {
    printf '%s<<%s\n' "$1" "$delimitador"
    printf '%s\n' "$2"
    printf '%s\n' "$delimitador"
  } >>"$GITHUB_ENV"
}

certificado=false
if tiene APPLE_CERTIFICATE && tiene APPLE_CERTIFICATE_PASSWORD; then
  certificado=true
elif tiene APPLE_CERTIFICATE || tiene APPLE_CERTIFICATE_PASSWORD; then
  echo "::warning title=Firma de Apple::APPLE_CERTIFICATE and APPLE_CERTIFICATE_PASSWORD go together and only one is set. Building ad-hoc."
fi

notarizacion=no
if tiene APPLE_API_ISSUER && tiene APPLE_API_KEY && tiene APPLE_API_KEY_P8; then
  notarizacion=clave
elif tiene APPLE_ID && tiene APPLE_PASSWORD; then
  notarizacion=appleid
else
  if tiene APPLE_API_ISSUER || tiene APPLE_API_KEY || tiene APPLE_API_KEY_P8; then
    echo "::warning title=Firma de Apple::The API key route needs APPLE_API_ISSUER, APPLE_API_KEY and APPLE_API_KEY_P8, and some are missing."
  fi
  if tiene APPLE_ID || tiene APPLE_PASSWORD; then
    echo "::warning title=Firma de Apple::The Apple ID route needs both APPLE_ID and APPLE_PASSWORD, and one is missing."
  fi
fi

if [ "$certificado" = false ]; then
  if [ "$notarizacion" != no ]; then
    echo "::warning title=Firma de Apple::There are notarization credentials but no certificate, and Apple only notarizes signed apps. Building ad-hoc."
  fi
  echo "modo=adhoc" >>"$GITHUB_OUTPUT"
  echo "No Apple certificate: building ad-hoc, as before."
  exit 0
fi

# Tauri takes the identity from APPLE_SIGNING_IDENTITY before tauri.conf.json,
# whose "-" (ad-hoc) would otherwise clash with the imported certificate: Tauri
# requires the certificate name to contain the identity, and fails. It is read
# from the certificate itself, so it can never disagree with it.
p12="$temporal/developer-id.p12"
pem="$temporal/developer-id.pem"
printf '%s' "$APPLE_CERTIFICATE" | base64 --decode >"$p12"
if ! openssl pkcs12 -in "$p12" -nokeys -clcerts -passin env:APPLE_CERTIFICATE_PASSWORD -out "$pem" 2>/dev/null; then
  rm -f "$p12" "$pem"
  echo "::error title=Firma de Apple::APPLE_CERTIFICATE does not open with APPLE_CERTIFICATE_PASSWORD."
  exit 1
fi
rm -f "$p12"
sujeto=$(openssl x509 -in "$pem" -noout -subject -nameopt multiline)
identidad=$(sed -n '/^ *commonName *= */{s///p;q;}' <<<"$sujeto")
equipo=$(sed -n '/^ *organizationalUnitName *= */{s///p;q;}' <<<"$sujeto")
case "$identidad" in
  "Developer ID Application:"*) ;;
  *)
    rm -f "$pem"
    echo "::error title=Firma de Apple::The certificate is \"$identidad\", and downloads need a \"Developer ID Application\" one."
    exit 1
    ;;
esac

# Developer ID certificates from the G2 authority last one year. Past that date
# signing fails, so the warning starts a month ahead, while there is time.
if ! openssl x509 -in "$pem" -noout -checkend 0 >/dev/null; then
  rm -f "$pem"
  echo "::error title=Firma de Apple::The Developer ID certificate has expired. Make a new one and replace APPLE_CERTIFICATE and APPLE_CERTIFICATE_PASSWORD."
  exit 1
fi
if ! openssl x509 -in "$pem" -noout -checkend $((30 * 24 * 3600)) >/dev/null; then
  echo "::warning title=Firma de Apple::The Developer ID certificate expires on $(openssl x509 -in "$pem" -noout -enddate | cut -d= -f2). Renew it before then."
fi
rm -f "$pem"

exportar APPLE_CERTIFICATE "$APPLE_CERTIFICATE"
exportar APPLE_CERTIFICATE_PASSWORD "$APPLE_CERTIFICATE_PASSWORD"
exportar APPLE_SIGNING_IDENTITY "$identidad"

case "$notarizacion" in
  no)
    echo "::warning title=Firma de Apple::Signed with Developer ID but NOT notarized: macOS will still warn when the DMG is opened from a browser download."
    echo "modo=firmado" >>"$GITHUB_OUTPUT"
    echo "Signing as \"$identidad\", without notarization."
    exit 0
    ;;
  clave)
    # Tauri wants the .p8 as a file, named the way Apple names it.
    clave="$temporal/private_keys/AuthKey_${APPLE_API_KEY}.p8"
    mkdir -p "$(dirname "$clave")"
    printf '%s\n' "$APPLE_API_KEY_P8" >"$clave"
    chmod 600 "$clave"
    exportar APPLE_API_ISSUER "$APPLE_API_ISSUER"
    exportar APPLE_API_KEY "$APPLE_API_KEY"
    exportar APPLE_API_KEY_PATH "$clave"
    echo "Signing as \"$identidad\" and notarizing with the App Store Connect team key."
    ;;
  appleid)
    # The team ID is the certificate's organizational unit: no extra secret.
    exportar APPLE_ID "$APPLE_ID"
    exportar APPLE_PASSWORD "$APPLE_PASSWORD"
    exportar APPLE_TEAM_ID "$equipo"
    echo "Signing as \"$identidad\" and notarizing with the Apple ID and an app-specific password."
    ;;
esac

echo "modo=notarizado" >>"$GITHUB_OUTPUT"
