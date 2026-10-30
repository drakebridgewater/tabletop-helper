#!/bin/sh
# Copies the Bridgewater brand files into public/. Run after the brand repo changes:
#   BRAND_DIR=../bridgewater-brand npm run sync-brand
set -eu
BRAND_DIR="${BRAND_DIR:-../bridgewater-brand}"
OUT="$(dirname "$0")/../public"
mkdir -p "$OUT/brand"
# An @import is ignored once it is not the first rule, so drop any from bundle.css.
{ cat "$BRAND_DIR/tokens.css"; grep -v '^@import' "$BRAND_DIR/components/bundle.css"; } > "$OUT/brand/bridgewater.css"
cp "$BRAND_DIR/components/bundle.js" "$OUT/brand/bundle.js"
# The self-hosted Fira files, at fonts/ next to the stylesheet that names them.
rm -rf "$OUT/brand/fonts"
cp -R "$BRAND_DIR/components/fonts" "$OUT/brand/fonts"
for f in favicon.svg favicon-32.png apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png og-image.png; do
  cp "$BRAND_DIR/assets/Favicons/$f" "$OUT/$f"
done
echo "Brand files copied from $BRAND_DIR ($(git -C "$BRAND_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown))"
