#!/bin/sh
set -eu

owner="${1:?usage: acquire.sh <owner>}"
endpoint=http://etcd:2379
lock_key=/coordination/report-lock

# TODO: acquire the leased lock and print its fencing token
