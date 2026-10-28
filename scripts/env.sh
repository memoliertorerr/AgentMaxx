# Source from the repo root before npm/electron commands on a development machine:
#   source scripts/env.sh
# Keeps every cache, temp file, and the dev app's user-data folder inside the repo.
# CI doesn't need it.

ROOT="$PWD"
if [ ! -f "$ROOT/package.json" ]; then
  echo "scripts/env.sh: run this from the repo root" >&2
  return 1 2>/dev/null || exit 1
fi

export npm_config_cache="$ROOT/.cache/npm"
export npm_config_update_notifier=false
export electron_config_cache="$ROOT/.cache/electron"
export ELECTRON_CACHE="$ROOT/.cache/electron"
export ELECTRON_BUILDER_CACHE="$ROOT/.cache/electron-builder"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export TMPDIR="$ROOT/.cache/tmp"
export AGENTMAXX_USER_DATA="$ROOT/.cache/user-data"

mkdir -p "$npm_config_cache" "$ELECTRON_CACHE" "$ELECTRON_BUILDER_CACHE" "$TMPDIR" "$AGENTMAXX_USER_DATA"
