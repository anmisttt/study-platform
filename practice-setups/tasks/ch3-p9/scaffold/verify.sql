DO $$
BEGIN
  IF (SELECT count(*) FROM warehouse.fact_order_items) <> 6 THEN
    RAISE EXCEPTION 'unexpected fact row count after repeated load';
  END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(
               d.year, d.month, c.country, p.category, f.revenue)
             ORDER BY d.year, d.month, c.country, p.category, f.revenue)
      FROM warehouse.fact_order_items f
      JOIN warehouse.dim_date d ON d.date_key = f.date_key
      JOIN warehouse.dim_customer c ON c.customer_key = f.customer_key
      JOIN warehouse.dim_product p ON p.product_key = f.product_key)
     IS DISTINCT FROM
     (SELECT jsonb_agg(jsonb_build_array(
               EXTRACT(YEAR FROM o.created_at)::integer,
               EXTRACT(MONTH FROM o.created_at)::integer,
               c.country, p.category, oi.quantity * oi.price)
             ORDER BY EXTRACT(YEAR FROM o.created_at)::integer,
                      EXTRACT(MONTH FROM o.created_at)::integer,
                      c.country, p.category, oi.quantity * oi.price)
      FROM oltp.order_items oi
      JOIN oltp.orders o ON o.id = oi.order_id
      JOIN oltp.customers c ON c.id = o.customer_id
      JOIN oltp.products p ON p.id = oi.product_id) THEN
    RAISE EXCEPTION 'warehouse facts do not match source business rows';
  END IF;

  IF (SELECT sum(f.revenue)
      FROM warehouse.fact_order_items f
      JOIN warehouse.dim_product p ON p.product_key = f.product_key
      JOIN warehouse.dim_date d ON d.date_key = f.date_key
      WHERE p.category = 'Home' AND d.year = 2024 AND d.month = 4)
      IS DISTINCT FROM 25.50 THEN
    RAISE EXCEPTION 'unexpected monthly category revenue';
  END IF;

  IF (SELECT sum(f.revenue)
      FROM warehouse.fact_order_items f
      JOIN warehouse.dim_customer c ON c.customer_key = f.customer_key
      WHERE c.country = 'US') IS DISTINCT FROM 139.50 THEN
    RAISE EXCEPTION 'unexpected country revenue';
  END IF;
END
$$;
