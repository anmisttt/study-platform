db = db.getSiblingDB("shop");

db.customers.insertMany([
  { _id: 1, name: "Alice", tier: "gold" },
  { _id: 2, name: "Bob", tier: "silver" },
  { _id: 3, name: "Carol", tier: "bronze" }
]);

db.orders.insertMany([
  { _id: 1001, customer_id: 1, status: "paid", total: 120 },
  { _id: 1002, customer_id: 2, status: "pending", total: 90 },
  { _id: 1003, customer_id: 1, status: "paid", total: 75 },
  { _id: 1004, customer_id: 3, status: "paid", total: 50 },
  { _id: 1005, customer_id: 99, status: "paid", total: 60 }
]);

db.orders.createIndex({ status: 1, total: 1 });
