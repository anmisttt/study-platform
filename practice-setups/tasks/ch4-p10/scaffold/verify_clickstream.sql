SELECT throwIf(count() != 200000, 'events row count is not 200000')
FROM events;

SELECT throwIf(
    countIf(
        (name = 'country' AND type = 'LowCardinality(FixedString(2))') OR
        (name IN ('device_type', 'os', 'browser', 'utm_source', 'utm_campaign')
            AND type = 'LowCardinality(String)')
    ) != 6,
    'required LowCardinality column types are missing'
)
FROM system.columns
WHERE database = currentDatabase() AND table = 'events';

SELECT throwIf(
    engine != 'MergeTree' OR
    partition_key != 'toYYYYMM(event_date)' OR
    sorting_key != 'event_date, country, device_type, user_id',
    'events MergeTree layout does not match the required partition and sort keys'
)
FROM system.tables
WHERE database = currentDatabase() AND name = 'events';

SELECT throwIf(count() = 0, 'daily active-user query returned no groups')
FROM
(
    SELECT toDate(event_time) AS day, country, uniq(user_id) AS dau
    FROM events
    WHERE event_time >= now() - INTERVAL 30 DAY
      AND country IN ('DE', 'US', 'GB', 'FR', 'BR', 'IN', 'JP')
      AND device_type IN ('desktop', 'mobile')
    GROUP BY day, country
);

SELECT throwIf(count() = 0, 'campaign query returned no browser groups')
FROM
(
    SELECT browser, count() AS hits
    FROM events
    WHERE utm_campaign = 'spring_sale_2026'
      AND event_time >= now() - INTERVAL 90 DAY
    GROUP BY browser
);

SELECT 'PASS: MergeTree layout and analytical queries verified';
