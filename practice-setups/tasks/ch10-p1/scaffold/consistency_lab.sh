#!/usr/bin/env bash
set -euo pipefail

IMAGE=quay.io/coreos/etcd:v3.5.15
PEER_NETWORK=consistency-peer
CLIENT_NETWORK=consistency-client
ISOLATED_CONTAINER=lab-ch10-p1-etcd3

ctl() {
  docker run --rm --network "$CLIENT_NETWORK" "$IMAGE" \
    /usr/local/bin/etcdctl "$@"
}

# TODO: run the consistency experiment and restore etcd3
