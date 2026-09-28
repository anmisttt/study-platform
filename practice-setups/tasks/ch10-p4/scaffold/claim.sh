#!/bin/sh
set -eu

username="${1:?usage: claim.sh <username> <participant>}"
participant="${2:?usage: claim.sh <username> <participant>}"
key="/claims/$username"

# TODO: claim the key and report the winner
