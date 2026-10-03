#!/usr/bin/env bash
# Makes Playwright's Chromium trust the HTTPS proxy of a Claude Code cloud session.
#
# The cloud session's agent proxy re-signs HTTPS with its own certificate authority. Chromium
# on Linux checks certificates against its NSS store (~/.pki/nssdb), not the system bundle or
# SSL_CERT_FILE, so page.goto fails with net::ERR_CERT_AUTHORITY_INVALID. This script imports
# the proxy's CA bundle into that store. TLS verification stays on and the proxy stays in use.
#
# Usage: bash scripts/trust-proxy-ca.sh [--verify] [ca-bundle]
#   ca-bundle  defaults to $PROXY_CA_BUNDLE, else /root/.ccr/ca-bundle.crt
#   --verify   then loads https://www.superbru.com/ in headless Chromium (no credentials)
#
# Needs certutil (libnss3-tools); installs it with apt-get when running as root without it.
# Safe to re-run: certificates already in the store are replaced, not duplicated.
set -euo pipefail

verify=false
bundle=""
for arg in "$@"; do
  case "$arg" in
    --verify) verify=true ;;
    *) bundle="$arg" ;;
  esac
done
bundle="${bundle:-${PROXY_CA_BUNDLE:-/root/.ccr/ca-bundle.crt}}"

if [[ ! -s "$bundle" ]]; then
  echo "CA bundle not found or empty: $bundle" >&2
  exit 1
fi

if ! command -v certutil >/dev/null 2>&1; then
  if [[ "$(id -u)" == "0" ]] && command -v apt-get >/dev/null 2>&1; then
    echo "Installing libnss3-tools for certutil"
    apt-get update -qq && apt-get install -y -qq libnss3-tools >/dev/null
  else
    echo "certutil is missing. Install libnss3-tools (Debian/Ubuntu) or nss-tools (Fedora)." >&2
    exit 1
  fi
fi

db="sql:$HOME/.pki/nssdb"
mkdir -p "$HOME/.pki/nssdb"
if [[ ! -f "$HOME/.pki/nssdb/cert9.db" ]]; then
  certutil -N -d "$db" --empty-password
fi

# certutil -A reads one certificate per file, so split the bundle first.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
awk -v dir="$work" '
  /-----BEGIN CERTIFICATE-----/ { n++; file = sprintf("%s/cert-%04d.pem", dir, n) }
  file { print > file }
  /-----END CERTIFICATE-----/ { close(file); file = "" }
' "$bundle"

count=0
for pem in "$work"/cert-*.pem; do
  [[ -e "$pem" ]] || continue
  nickname="proxy-ca-$(basename "$pem" .pem)"
  certutil -D -d "$db" -n "$nickname" >/dev/null 2>&1 || true
  certutil -A -d "$db" -n "$nickname" -t "C,," -i "$pem"
  count=$((count + 1))
done
if [[ "$count" == "0" ]]; then
  echo "No certificates found in $bundle" >&2
  exit 1
fi
echo "Imported $count certificate(s) from $bundle into $HOME/.pki/nssdb"
# Playwright's page.request runs in Node, which reads its own trust store, not NSS.
if [[ -z "${NODE_EXTRA_CA_CERTS:-}" ]]; then
  echo "For Node-side requests (Playwright page.request), also run: export NODE_EXTRA_CA_CERTS=$bundle"
fi

if $verify; then
  # Playwright from the working directory, apps/web, or the global npm root.
  NODE_PATH="$(pwd)/node_modules:$(pwd)/apps/web/node_modules:$(npm root -g 2>/dev/null || true)" node -e '
    const { chromium } = require("playwright");
    (async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const response = await (await browser.newPage()).goto("https://www.superbru.com/", { waitUntil: "domcontentloaded" });
        console.log(`Chromium loaded https://www.superbru.com/ with status ${response.status()}`);
      } finally {
        await browser.close();
      }
    })().catch((error) => { console.error(error.message); process.exit(1); });
  '
fi
