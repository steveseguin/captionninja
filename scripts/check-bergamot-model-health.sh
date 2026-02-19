#!/usr/bin/env bash
set -euo pipefail

# Validate translation model hosting for a deployed Caption Ninja instance.
# Usage:
#   ./scripts/check-bergamot-model-health.sh https://caption.ninja pten

BASE_URL="${1:-https://caption.ninja}"
PAIR="${2:-pten}"
BASE_URL="${BASE_URL%/}"
MODELS_BASE="${BASE_URL}/models"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

http_get_200() {
  local url="$1"
  local code
  code="$(curl -sS -L -o /dev/null -w "%{http_code}" "${url}")"
  if [[ "${code}" != "200" ]]; then
    echo "FAIL ${url} (HTTP ${code})" >&2
    exit 1
  fi
}

http_head_ok() {
  local url="$1"
  local code
  code="$(curl -sS -L -I -o /dev/null -w "%{http_code}" "${url}")"
  if [[ "${code}" != "200" && "${code}" != "206" ]]; then
    # Fallback for servers that reject HEAD
    code="$(curl -sS -L -r 0-0 -o /dev/null -w "%{http_code}" "${url}")"
    if [[ "${code}" != "200" && "${code}" != "206" ]]; then
      echo "FAIL ${url} (HTTP ${code})" >&2
      exit 1
    fi
  fi
}

read_header() {
  local url="$1"
  local key="$2"
  curl -sS -L -D - -o /dev/null "${url}" \
    | tr -d '\r' \
    | awk -v k="${key}" 'BEGIN{IGNORECASE=1} tolower($1)==tolower(k ":"){sub(/^[^:]*:[[:space:]]*/,"",$0); print; exit}'
}

latest_url="${MODELS_BASE}/latest.txt"
http_get_200 "${latest_url}"
version="$(curl -sS -L "${latest_url}" | tr -d '\r\n')"
if [[ -z "${version}" ]]; then
  echo "FAIL ${latest_url} is empty" >&2
  exit 1
fi

registry_url="${MODELS_BASE}/${version}/registry.json"
http_get_200 "${registry_url}"
registry_file="${tmp_dir}/registry.json"
curl -sS -L "${registry_url}" -o "${registry_file}"

if ! jq -e --arg pair "${PAIR}" 'has($pair)' "${registry_file}" >/dev/null; then
  echo "FAIL pair '${PAIR}' is missing from ${registry_url}" >&2
  exit 1
fi

mapfile -t assets < <(jq -r --arg pair "${PAIR}" '
  .[$pair] as $p
  | [
      $p.model.name,
      $p.lex.name,
      ($p.vocab.name // empty),
      ($p.srcvocab.name // empty),
      ($p.trgvocab.name // empty)
    ]
  | unique
  | .[]
  | select(length > 0)
' "${registry_file}")

if [[ "${#assets[@]}" -eq 0 ]]; then
  echo "FAIL no assets found in registry for pair '${PAIR}'" >&2
  exit 1
fi

echo "Model host health check"
echo "site=${BASE_URL}"
echo "models_base=${MODELS_BASE}"
echo "version=${version}"
echo "pair=${PAIR}"
echo "asset_count=${#assets[@]}"

echo
echo "Reachability checks"
echo "OK  ${latest_url}"
echo "OK  ${registry_url}"
for asset in "${assets[@]}"; do
  asset_url="${MODELS_BASE}/${version}/${PAIR}/${asset}"
  http_head_ok "${asset_url}"
  echo "OK  ${asset_url}"
done

latest_cache="$(read_header "${latest_url}" "cache-control")"
registry_cache="$(read_header "${registry_url}" "cache-control")"
asset_sample_url="${MODELS_BASE}/${version}/${PAIR}/${assets[0]}"
asset_cache="$(read_header "${asset_sample_url}" "cache-control")"

echo
echo "Cache headers (sample)"
echo "latest.txt: ${latest_cache:-<missing>}"
echo "registry.json: ${registry_cache:-<missing>}"
echo "asset (${assets[0]}): ${asset_cache:-<missing>}"

echo
echo "Recommended"
echo "/models/latest.txt => Cache-Control: no-cache"
echo "/models/<version>/registry.json => Cache-Control: max-age=300, must-revalidate"
echo "/models/<version>/*.{bin,spm} => Cache-Control: public, max-age=31536000, immutable"
