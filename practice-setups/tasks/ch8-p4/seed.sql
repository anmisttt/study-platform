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
  (1, 'Software licenses', 5000);
