from projector import read_events, rebuild_views, snapshot


EXPECTED_EVENT_IDS = ["evt-001", "evt-002", "evt-003", "evt-004", "evt-005"]


def main() -> None:
    events = read_events()
    event_count = len(events)
    assert event_count in (4, 5)
    assert [event["event_id"] for event in events] == EXPECTED_EVENT_IDS[:event_count]

    rebuild_views(events)
    views = snapshot()
    expected_revenue = [
        {"day": "2026-08-01", "net_revenue": 100},
        {"day": "2026-08-02", "net_revenue": 70 if event_count == 4 else 100},
    ]
    expected_orders = [("o1", "placed"), ("o2", "cancelled"), ("o3", "placed")]
    expected_spend = [("alice", 100), ("bob", 70)]
    if event_count == 5:
        expected_orders.append(("o4", "placed"))
        expected_spend[0] = ("alice", 130)

    assert [(row["order_id"], row["status"]) for row in views["orders"]] == expected_orders
    assert views["table_revenue"] == expected_revenue
    assert views["materialized_revenue"] == expected_revenue
    assert [
        (row["customer_id"], row["net_spend"])
        for row in views["customer_spend"]
    ] == expected_spend
    print(f"tests passed for {event_count} events")


if __name__ == "__main__":
    main()
