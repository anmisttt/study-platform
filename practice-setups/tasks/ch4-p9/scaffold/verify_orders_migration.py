import mysql.connector


connection = mysql.connector.connect(
    host="mysql", user="root", password="lab", database="ch4_lab"
)
cursor = connection.cursor()

cursor.execute(
    """
    SELECT column_name, column_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'ch4_lab' AND table_name = 'orders'
    """
)
columns = {name: (column_type.lower(), nullable) for name, column_type, nullable in cursor}
assert columns["id"] == ("binary(16)", "NO")
assert "order_id_v7" not in columns

cursor.execute(
    """
    SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index)
    FROM information_schema.statistics
    WHERE table_schema = 'ch4_lab' AND table_name = 'orders'
    GROUP BY index_name
    """
)
indexes = dict(cursor)
assert indexes["PRIMARY"] == "id"
assert indexes["orders_customer_recent_idx"] == "customer_id,created_at"
assert indexes["orders_status_idx"] == "status"

cursor.execute("SELECT HEX(id) FROM orders ORDER BY created_at, id")
ids = [value for (value,) in cursor]
assert len(ids) == 20_000
assert all(value[12] == "7" for value in ids)
assert all(value[16] in "89AB" for value in ids)
assert [value[:12] for value in ids] == sorted(value[:12] for value in ids)

cursor.close()
connection.close()
print("PASS: UUIDv7 primary key, secondary indexes, and loaded rows verified")
