#!/usr/bin/env bash
set -euo pipefail

# Download Mozilla/Bergamot translation models into a local mirror.
# Output layout:
#   models/latest.txt
#   models/<version>/registry.json
#   models/<version>/<pair>/<asset files>

SOURCE_ROOT="${SOURCE_ROOT:-https://storage.googleapis.com/bergamot-models-sandbox}"
OUT_DIR="${1:-models}"
REQUESTED_VERSION="${2:-latest}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed." >&2
  exit 1
fi

if [[ "${REQUESTED_VERSION}" == "latest" ]]; then
  VERSION="$(curl -fsSL "${SOURCE_ROOT}/latest.txt" | tr -d '\r\n')"
else
  VERSION="${REQUESTED_VERSION}"
fi

if [[ -z "${VERSION}" ]]; then
  echo "Could not resolve model version." >&2
  exit 1
fi

VERSION_ROOT="${SOURCE_ROOT}/${VERSION}"
TARGET_ROOT="${OUT_DIR}/${VERSION}"
mkdir -p "${TARGET_ROOT}"
printf "%s\n" "${VERSION}" > "${OUT_DIR}/latest.txt"

echo "Downloading registry for version ${VERSION}..."
curl -fsSL "${VERSION_ROOT}/registry.json" -o "${TARGET_ROOT}/registry.json"

manifest="$(mktemp)"
trap 'rm -f "${manifest}"' EXIT

jq -r '
  to_entries[] | .key as $pair | [
    .value.model.name,
    .value.lex.name,
    (.value.vocab.name // empty),
    (.value.srcvocab.name // empty),
    (.value.trgvocab.name // empty)
  ] | unique | .[] | "\($pair)/\(.)"
' "${TARGET_ROOT}/registry.json" | sort -u > "${manifest}"

count=0
while IFS= read -r rel; do
  target="${TARGET_ROOT}/${rel}"
  mkdir -p "$(dirname "${target}")"
  if [[ -s "${target}" ]]; then
    continue
  fi
  curl -fsSL "${VERSION_ROOT}/${rel}" -o "${target}"
  count=$((count + 1))
done < "${manifest}"

total_files="$(wc -l < "${manifest}" | tr -d ' ')"
echo "Done. version=${VERSION} downloaded_new=${count} tracked_assets=${total_files}"
du -sh "${OUT_DIR}"
