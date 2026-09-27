CREATE OR REPLACE FUNCTION atomic_increment(p_page_id TEXT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
BEGIN
  -- TODO: atomic increment
  RAISE EXCEPTION 'not implemented';
END;
$$;

CREATE OR REPLACE FUNCTION compare_and_set(
  p_page_id TEXT,
  p_expected_version BIGINT,
  p_new_count BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  -- TODO: compare-and-set
  RAISE EXCEPTION 'not implemented';
END;
$$;
