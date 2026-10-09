import ch12_log_queue as lab


lab.ensure_topic()

first = [f"m{i}" for i in range(1, 6)]
later = [f"m{i}" for i in range(6, 9)]

assert lab.produce_all(first) == len(first)
assert lab.consumer_lag(lab.GROUP_ANALYTICS) == len(first)
assert lab.drain_group(lab.GROUP_ANALYTICS) == first
assert lab.consumer_lag(lab.GROUP_ANALYTICS) == 0

assert lab.produce_all(later) == len(later)
assert lab.consumer_lag(lab.GROUP_ANALYTICS) == len(later)
assert lab.drain_group(lab.GROUP_INDEXER) == first + later
assert lab.consumer_lag(lab.GROUP_ANALYTICS) == len(later)
assert lab.drain_group(lab.GROUP_ANALYTICS) == later
assert lab.replay_from_beginning(lab.GROUP_ANALYTICS) == first + later
assert lab.consumer_lag(lab.GROUP_ANALYTICS) == 0

print("all checks passed")
