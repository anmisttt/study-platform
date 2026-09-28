#!/bin/sh
set -eu

token="${1:?usage: fenced-write.sh <token> <payload>}"
payload="${2:?usage: fenced-write.sh <token> <payload>}"
endpoint=http://etcd:2379
lock_key=/coordination/report-lock
resource_key=/coordination/report-result

# TODO: condition the resource write on the current lock revision
