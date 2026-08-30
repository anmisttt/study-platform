db = db.getSiblingDB('order_views');
db.createCollection('customer_spend_view');
db.customer_spend_view.createIndex({ customer_id: 1 }, { unique: true });
