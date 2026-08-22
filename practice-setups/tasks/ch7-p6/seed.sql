-- ch7_rls_projects.sql
DROP SCHEMA IF EXISTS rls_lab CASCADE;
CREATE SCHEMA rls_lab;

CREATE TABLE rls_lab.projects (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, name)
);

INSERT INTO rls_lab.projects (tenant_id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alpha project'),
  ('22222222-2222-2222-2222-222222222222', 'Beta project');
