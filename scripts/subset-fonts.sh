#!/usr/bin/env bash
# Subsets public/fonts/*.woff2 to the characters this site actually sets.
#
# WHY THIS EXISTS
# Measured on the production build over Slow 4G + 4x CPU (Lighthouse's own
# throttling profile): the landing pulled 124.4 kB of font and its LCP element
# was the hero headline, which cannot reach its final form until the display
# face lands. Fonts were the critical path, not JS — the JS budget was already
# being met at ~217 kB gzip.
#
# The faces ship with full Latin coverage (Central European, Vietnamese, the
# lot). This site is English and sets, at most, Latin-1 plus a short list of
# typographic marks. Everything else is bytes the reader waits for and never
# sees.
#
# PROVENANCE — these are NOT self-generated. Re-download before re-subsetting:
#   Bespoke Slab 300/400/500  https://www.fontshare.com/fonts/bespoke-slab
#   General Sans 400/500      https://www.fontshare.com/fonts/general-sans
#   Redaction 50 400          the unresolved cut; see DESIGN.md
# Fontshare faces are free for personal and commercial use (ITF Free Font
# Licence). Subsetting is permitted under it; redistribution as a font product
# is not, and nothing here does that.
#
# Usage:  ./scripts/subset-fonts.sh          (subsets in place, prints savings)
# Needs:  pyftsubset  (pip install fonttools brotli)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/public/fonts"

command -v pyftsubset >/dev/null || {
  echo "pyftsubset not found. pip install 'fonttools[woff]' brotli" >&2
  exit 1
}

# Basic Latin + Latin-1 Supplement + Latin Extended-A, plus the marks this site
# genuinely uses: curly quotes, the middle dot in source lines, the arrow in
# CTAs, the trademark sign in instrument names, en/em dash (used in prose on
# /research/*, which is exempt from the landing's no-em-dash rule).
UNICODES="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2015,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212,U+00D7"

total_before=0
total_after=0

for f in "$DIR"/*.woff2; do
  [ -e "$f" ] || continue
  before=$(stat -f%z "$f")
  tmp="${f%.woff2}.subset.woff2"
  pyftsubset "$f" \
    --output-file="$tmp" \
    --flavor=woff2 \
    --layout-features='kern,liga,clig,calt,tnum,onum,frac,ccmp,locl,mark,mkmk' \
    --unicodes="$UNICODES" \
    --no-hinting \
    --desubroutinize \
    --drop-tables+=DSIG
  after=$(stat -f%z "$tmp")
  mv "$tmp" "$f"
  total_before=$((total_before + before))
  total_after=$((total_after + after))
  printf '%-42s %7d -> %7d bytes  (-%d%%)\n' \
    "$(basename "$f")" "$before" "$after" "$(( (before - after) * 100 / before ))"
done

printf '\n%-42s %7d -> %7d bytes  (-%d%%)\n' "TOTAL" \
  "$total_before" "$total_after" "$(( (total_before - total_after) * 100 / total_before ))"
echo
echo "Re-run scripts/build-og-card.sh if the display face changed: the OG card"
echo "renders with these same files over file://."
