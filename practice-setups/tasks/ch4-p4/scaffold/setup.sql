-- events_setup.sql — clickstream analytics stub
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS events_daily_country_device;

CREATE TABLE events (
  event_time       DateTime,
  event_date       Date DEFAULT toDate(event_time),
  user_id          UInt64,
  session_id       UUID,
  country          String,            -- choose LowCardinality(FixedString(2))
  device_type      String,            -- choose LowCardinality(String)
  os               String,            -- choose LowCardinality(String)
  browser          String,            -- choose LowCardinality(String)
  referrer         String,
  utm_source       String,            -- choose LowCardinality(String)
  utm_campaign     String,            -- choose LowCardinality(String)
  page_path        String,
  page_load_ms     UInt32
)
ENGINE = MergeTree
PARTITION BY tuple()                  -- choose PARTITION BY toYYYYMM(event_date)
ORDER BY tuple()                      -- choose ORDER BY (event_date, country, device_type, user_id)
SETTINGS index_granularity = 8192;

-- optional: bloom_filter skip index on utm_campaign for Q2
-- ALTER TABLE events ADD INDEX idx_utm_campaign utm_campaign TYPE bloom_filter GRANULARITY 4;

-- implement daily-by-country/device MV with SummingMergeTree (optional data-cube)
-- CREATE MATERIALIZED VIEW events_daily_country_device
-- ENGINE = SummingMergeTree
-- PARTITION BY ...
-- ORDER BY ...
-- AS SELECT ... FROM events GROUP BY ...;

-- Laptop-friendly seed (~200k rows across ~90 days). Production would be ~1B.
INSERT INTO events
  (event_time, user_id, session_id, country, device_type, os, browser,
   referrer, utm_source, utm_campaign, page_path, page_load_ms)
SELECT
  now() - toIntervalDay(number % 90) - toIntervalSecond(number % 86400),
  number % 50000,
  generateUUIDv4(),
  ['DE','US','GB','FR','BR','IN','JP','CA','AU','NL'][1 + (number % 10)],
  ['desktop','mobile','tablet'][1 + (number % 3)],
  ['macOS','Windows','iOS','Android','Linux'][1 + (number % 5)],
  ['Chrome','Safari','Firefox','Edge'][1 + (number % 4)],
  if(number % 7 = 0, 'https://news.example/', ''),
  ['google','newsletter','direct','partner'][1 + (number % 4)],
  if(number % 11 = 0, 'spring_sale_2026',
     ['winter_push','brand_always','retarget'][1 + (number % 3)]),
  concat('/page/', toString(number % 200)),
  50 + (number % 950)
FROM numbers(200000);

-- Q1 — DAU per country, last 30 days, desktop + mobile only
-- SELECT toDate(event_time) AS day, country, uniq(user_id) AS dau
-- FROM   events
-- WHERE  event_time >= now() - INTERVAL 30 DAY
--   AND  country IN ('DE','US','GB','FR','BR','IN','JP')
--   AND  device_type IN ('desktop','mobile')
-- GROUP  BY day, country
-- ORDER  BY day, dau DESC
-- LIMIT  20;

-- Q2 — Browser distribution for a single campaign
-- SELECT browser, count() AS hits
-- FROM   events
-- WHERE  utm_campaign = 'spring_sale_2026'
--   AND  event_time >= now() - INTERVAL 90 DAY
-- GROUP  BY browser
-- ORDER  BY hits DESC
-- LIMIT  10;
