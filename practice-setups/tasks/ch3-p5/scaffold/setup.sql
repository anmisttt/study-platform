-- PostgreSQL
-- implement: relational priority migration
-- implement: relational priority update
-- implement: relational priority projection

-- implement: document priority projection

-- implement: document TTL update
-- implement: push notification insert
-- implement: document TTL projection

SELECT type, payload->>'message' AS message, payload->>'ttl_seconds' AS ttl
FROM   ch2_notif_document;
