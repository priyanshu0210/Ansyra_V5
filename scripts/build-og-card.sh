#!/usr/bin/env bash
# Regenerates public/og.png (1200x630) from scripts/og-card.html.
#
# The card is declared in index.html as og:image / twitter:image. Its alt text
# ("Ansyra. ~30% of acquirers hit the synergies they announced.") must keep
# matching what the image actually says — update both together.
#
# Rendered with headless Chrome so the real brand faces (Redaction, Switzer)
# are used; the HTML loads them straight from public/fonts via file:// URLs,
# which is why the FONTDIR placeholder is substituted at render time.
#
# Usage:  ./scripts/build-og-card.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$ROOT/public/og.png"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ ! -x "$CHROME" ]; then
  echo "Chrome not found at: $CHROME" >&2
  echo "Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

sed "s|FONTDIR|file://$ROOT/public/fonts|g" \
  "$ROOT/scripts/og-card.html" > "$TMP/card.html"

"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --default-background-color=1b1e23 \
  --screenshot="$OUT" "file://$TMP/card.html" >/dev/null 2>&1

echo "Wrote $OUT"
file "$OUT"
