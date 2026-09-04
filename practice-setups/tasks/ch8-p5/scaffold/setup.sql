-- setup: budget_write_skew.sql — run once before the tasks
DROP TABLE IF EXISTS expense_approvals;
DROP TABLE IF EXISTS project_budgets;

CREATE TABLE project_budgets (
  project_id   INT     PRIMARY KEY,
  total_budget NUMERIC NOT NULL
);

CREATE TABLE expense_approvals (
  id          SERIAL  PRIMARY KEY,
  project_id  INT     NOT NULL REFERENCES project_budgets(project_id),
  description TEXT    NOT NULL,
  amount      NUMERIC NOT NULL CHECK (amount > 0),
  approved    BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO project_budgets VALUES (1, 10000);
INSERT INTO expense_approvals (project_id, description, amount) VALUES
  (1, 'Server hardware', 6000),   -- becomes id = 1
  (1, 'Software licenses', 5000); -- becomes id = 2

-- Demo path for Task 1 (REPEATABLE READ write skew). Use these statements
-- in the two-session interleaving below — do not change isolation yet.
-- Session 1 approves id=1; Session 2 approves id=2.
--
-- BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- SELECT COALESCE(SUM(amount), 0) AS approved_total
-- FROM expense_approvals WHERE project_id = 1 AND approved = true;
-- SELECT amount FROM expense_approvals WHERE id = /* 1 or 2 */;
-- SELECT total_budget FROM project_budgets WHERE project_id = 1;
-- -- if approved_total + this amount <= budget, then:
-- UPDATE expense_approvals SET approved = true WHERE id = /* 1 or 2 */;
-- COMMIT;

-- Stub for Task 2 — replace REPEATABLE READ with SERIALIZABLE and keep the
-- same check-then-approve body (on SQLSTATE 40001, re-run the whole txn in psql):
-- BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- -- TODO: use SERIALIZABLE — same SELECT SUM / budget check / UPDATE / COMMIT
-- -- implement budget check then approve under SERIALIZABLE

-- Stub for Task 3 — lock the budget row before the sum check:
-- BEGIN;
-- -- TODO: SELECT FOR UPDATE on project_budgets
-- SELECT total_budget FROM project_budgets WHERE project_id = 1 FOR UPDATE;
-- -- implement budget check then approve under READ COMMITTED (default)
-- -- after locking: SELECT SUM(...), then UPDATE expense_approvals ...
-- COMMIT;
