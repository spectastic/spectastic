#!/usr/bin/env bash
# inline.sh — produce a standalone single-file spectastic artifact.
# Replaces <link rel="stylesheet" href="…/spec.css"> with inline <style>…</style>
# and <script src="…/spec.js"></script> with inline <script>…</script>.
#
# Usage: scripts/inline.sh path/to/source.html > path/to/standalone.html
#        scripts/inline.sh specs/001-auth/spec.html > dist/spec.html

set -euo pipefail
SRC="${1:?usage: inline.sh <source.html>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CSS="$ROOT/assets/spec.css"
JS="$ROOT/assets/spec.js"

[[ -f "$CSS" ]] || { echo "missing $CSS" >&2; exit 1; }
[[ -f "$JS"  ]] || { echo "missing $JS"  >&2; exit 1; }

awk -v css="$CSS" -v js="$JS" '
  /<link[^>]*spec\.css[^>]*>/ {
    print "<style>"; while ((getline line < css) > 0) print line; close(css); print "</style>";
    next
  }
  /<script[^>]*src=[^>]*spec\.js[^>]*><\/script>/ {
    print "<script>"; while ((getline line < js) > 0) print line; close(js); print "</script>";
    next
  }
  { print }
' "$SRC"
