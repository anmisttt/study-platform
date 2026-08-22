-- ch4_orders_diag.sql
USE ch4_lab;

-- Primary signal: table size vs data — large free_mb / gap vs expected row bytes => bloat
SELECT table_name, engine,
       ROUND(data_length / 1024 / 1024, 2) AS data_mb,
       ROUND(index_length / 1024 / 1024, 2) AS index_mb,
       ROUND(data_free / 1024 / 1024, 2) AS free_mb,
       table_rows
FROM information_schema.tables
WHERE table_schema = 'ch4_lab' AND table_name = 'orders';

-- Optional page-split counters (often disabled until you turn the monitors on)
SET GLOBAL innodb_monitor_enable = 'module_index';
SELECT name, count
FROM information_schema.innodb_metrics
WHERE name IN ('index_page_splits', 'index_page_merge_attempts')
ORDER BY name;

SHOW ENGINE INNODB STATUS\G
-- Look under FILE I/O / buffer pool sections and compare insert latency from the harness printout.
