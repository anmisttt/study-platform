#!/usr/bin/env bash
# Keep chapter image references, Bake entries, and task directories in sync.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

refs="$(grep -rhoE 'ghcr\.io/anmisttt/lab:ch[0-9]+-p[0-9]+' backend/src/data \
  | sed 's/.*://' | sort -u)"
configured="$(sed -nE 's/.*tag = "(ch[0-9]+-p[0-9]+)".*/\1/p' \
  practice-setups/docker-bake.hcl | sort -u)"
directories="$(find practice-setups/tasks -mindepth 1 -maxdepth 1 -type d \
  -exec basename {} \; | sort -u)"
legacy_refs="$(
  for chapter_file in backend/src/data/*.json; do
    jq -r --arg file "$chapter_file" '
      def chapters: if type == "array" then .[] else . end;
      chapters
      | .practice
      | to_entries[]
      | select([.value.task, .value.question] | join("\n") | contains("ddia-practice"))
      | "\($file): practice \(.key + 1)"
    ' "$chapter_file"
  done | sort -u
)"
index_mismatches="$(
  for chapter_file in backend/src/data/*.json; do
    jq -r --arg file "$chapter_file" '
      def chapters: if type == "array" then .[] else . end;
      chapters
      | .number as $chapter
      | .practice
      | to_entries[]
      | .key as $practice_index
      | ($practice_index + 1) as $expected_suffix
      | (.value | tostring | scan("ghcr\\.io/anmisttt/lab:ch[0-9]+-p[0-9]+")) as $tag
      | ($tag | capture("lab:ch(?<chapter>[0-9]+)-p(?<practice>[0-9]+)")) as $ref
      | select(($ref.chapter | tonumber) != $chapter or ($ref.practice | tonumber) != $expected_suffix)
      | "\($file): practice \($practice_index + 1) references \($tag); expected ch\($chapter)-p\($expected_suffix)"
    ' "$chapter_file"
  done | sort -u
)"

if [[ -n "$legacy_refs" ]]; then
  echo "practice descriptions still reference the legacy ddia-practice package" >&2
  printf '%s\n' "$legacy_refs" >&2
  exit 1
fi

if [[ "$refs" != "$configured" || "$refs" != "$directories" ]]; then
  echo "practice image tags are out of sync" >&2
  diff -u <(printf '%s\n' "$refs") <(printf '%s\n' "$configured") >&2 || true
  diff -u <(printf '%s\n' "$refs") <(printf '%s\n' "$directories") >&2 || true
  exit 1
fi

if [[ -n "$index_mismatches" ]]; then
  echo "practice image tags do not use one-based practice ordinals" >&2
  printf '%s\n' "$index_mismatches" >&2
  exit 1
fi

count="$(printf '%s\n' "$refs" | grep -c . || true)"
echo "drift check ok (${count} tags)"
