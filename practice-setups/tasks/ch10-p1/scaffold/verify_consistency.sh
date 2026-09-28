#!/usr/bin/env bash
set -euo pipefail

expected=$'SERIALIZABLE=free\nLINEARIZABLE_BLOCKED=true\nRECOVERED=pro'
actual="$(bash consistency_lab.sh)"
[[ "$actual" == "$expected" ]]
printf 'verification passed\n'
