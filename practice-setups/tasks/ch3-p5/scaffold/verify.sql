\set ON_ERROR_STOP on

DO $verify$
DECLARE
  relational_sms_count integer;
  relational_normal_count integer;
  relational_projection jsonb;
  document_priority_projection jsonb;
  document_ttl_projection jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notif_relational'
      AND column_name = 'priority'
      AND data_type = 'text'
      AND is_nullable = 'NO'
      AND column_default = '''normal''::text'
  ) THEN
    RAISE EXCEPTION 'relational priority must be TEXT NOT NULL DEFAULT normal';
  END IF;

  SELECT count(*) FILTER (WHERE type = 'sms' AND priority = 'high'),
         count(*) FILTER (WHERE type <> 'sms' AND priority = 'normal')
  INTO relational_sms_count, relational_normal_count
  FROM notif_relational;

  IF relational_sms_count <> 1 OR relational_normal_count <> 3 THEN
    RAISE EXCEPTION 'relational priorities do not match the seeded notifications';
  END IF;

  SELECT jsonb_agg(
           to_jsonb(projected)
           || jsonb_build_object('created_at', projected.created_at IS NOT NULL)
           ORDER BY projected.id
         )
  INTO relational_projection
  FROM (
    SELECT id, user_id, type, message, priority, created_at
    FROM notif_relational
  ) AS projected;

  IF relational_projection <> '[
    {"id": 1, "user_id": 1, "type": "email", "message": "Your order #1042 has shipped", "priority": "normal", "created_at": true},
    {"id": 2, "user_id": 2, "type": "push", "message": "Flash sale: 40% off electronics", "priority": "normal", "created_at": true},
    {"id": 3, "user_id": 3, "type": "sms", "message": "Your verification code is 8271", "priority": "high", "created_at": true},
    {"id": 4, "user_id": 1, "type": "push", "message": "Your package was delivered", "priority": "normal", "created_at": true}
  ]'::jsonb THEN
    RAISE EXCEPTION 'relational priority projection does not match the required columns and rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notif_document'
      AND column_name IN ('priority', 'ttl_seconds')
  ) THEN
    RAISE EXCEPTION 'document attributes must remain inside payload';
  END IF;

  IF (SELECT count(*) FROM notif_document
      WHERE type = 'push' AND payload @> '{"ttl_seconds": 86400}'::jsonb) <> 2
     OR (SELECT count(*) FROM notif_document
         WHERE user_id = 2 AND type = 'push'
           AND payload @> '{"message": "New message from Sarah", "device_token": "tok_xyz", "badge": 3, "ttl_seconds": 3600}'::jsonb) <> 1
     OR EXISTS (SELECT 1 FROM notif_document
                WHERE type IN ('email', 'sms') AND payload ? 'ttl_seconds') THEN
    RAISE EXCEPTION 'document TTL outcomes do not match the required evolution';
  END IF;

  SELECT jsonb_agg(to_jsonb(projected) ORDER BY projected.id)
  INTO document_priority_projection
  FROM (
    SELECT id,
           type,
           payload ->> 'message' AS message,
           COALESCE(payload ->> 'priority', 'normal') AS priority
    FROM notif_document
  ) AS projected;

  IF document_priority_projection <> '[
    {"id": 1, "type": "email", "message": "Your order #1042 has shipped", "priority": "normal"},
    {"id": 2, "type": "push", "message": "Flash sale: 40% off electronics", "priority": "normal"},
    {"id": 3, "type": "sms", "message": "Your verification code is 8271", "priority": "high"},
    {"id": 4, "type": "push", "message": "Your package was delivered", "priority": "normal"},
    {"id": 5, "type": "push", "message": "New message from Sarah", "priority": "normal"}
  ]'::jsonb THEN
    RAISE EXCEPTION 'document priority projection does not match the required columns and rows';
  END IF;

  SELECT jsonb_agg(
           to_jsonb(projected)
           ORDER BY projected.type COLLATE "C", projected.message COLLATE "C"
         )
  INTO document_ttl_projection
  FROM (
    SELECT type,
           payload ->> 'message' AS message,
           payload ->> 'ttl_seconds' AS ttl
    FROM notif_document
  ) AS projected;

  IF document_ttl_projection <> '[
    {"type": "email", "message": "Your order #1042 has shipped", "ttl": null},
    {"type": "push", "message": "Flash sale: 40% off electronics", "ttl": "86400"},
    {"type": "push", "message": "New message from Sarah", "ttl": "3600"},
    {"type": "push", "message": "Your package was delivered", "ttl": "86400"},
    {"type": "sms", "message": "Your verification code is 8271", "ttl": null}
  ]'::jsonb THEN
    RAISE EXCEPTION 'document TTL projection does not match the required columns and rows';
  END IF;
END
$verify$;

SELECT 'verification passed' AS result;
