from unittest.mock import patch

import fault_client


for attempt, upper, chosen in ((0, 0.1, 0.03), (3, 0.8, 0.4), (10, 5.0, 4.2)):
    with (
        patch.object(fault_client.random, "uniform", return_value=chosen) as uniform,
        patch.object(fault_client.time, "sleep") as sleep,
    ):
        fault_client.sleep_before_retry(attempt)

    uniform.assert_called_once_with(0, upper)
    sleep.assert_called_once_with(chosen)

print("backoff checks passed")
