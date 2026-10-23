-- Execute only against an isolated acceptance database. Fixtures always roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject_sql(command text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE %, but statement succeeded: %', expected_state, command;
END;
$$;
DO $$
DECLARE
  c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  partner uuid := gen_random_uuid(); p uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  m uuid := gen_random_uuid(); b uuid := gen_random_uuid(); b2 uuid := gen_random_uuid();
  cost uuid := gen_random_uuid(); draft uuid := gen_random_uuid();
BEGIN
  INSERT INTO companies(id,company_code,company_name,updated_at) VALUES
    (c,'TEST_0006','Acceptance fixture',now()),(c2,'TEST_0006_OTHER','Other tenant',now());
  INSERT INTO partners(id,company_id,partner_code,legal_name,partner_type,updated_at)
    VALUES(partner,c,'TEST','Fixture','CUSTOMER',now());
  INSERT INTO projects(id,company_id,project_code,project_name,partner_id,updated_at) VALUES
    (p,c,'P1','Fixture one',partner,now()),(p2,c,'P2','Fixture two',partner,now());
  INSERT INTO project_milestones(id,company_id,project_id,milestone_code,name,updated_at)
    VALUES(m,c,p,'M1','Delivery',now());
  INSERT INTO project_cost_budgets(id,company_id,project_id,currency,amount,approved_at)
    VALUES(b,c,p,'USD',1000,now());
  INSERT INTO project_cost_entries(id,company_id,project_id,milestone_id,budget_id,cost_code,cost_date,category,description,currency,amount,updated_at)
    VALUES(cost,c,p,m,b,'C1',current_date,'LABOR','Fixture','USD',125.1250,now());

  PERFORM pg_temp.reject_sql(format('UPDATE project_milestones SET progress_percent=1.01 WHERE id=%L',m),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_milestones SET planned_start=''2026-10-08'', planned_end=''2026-10-07'' WHERE id=%L',m),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_milestones SET actual_start=''2026-10-08'', actual_end=''2026-10-07'' WHERE id=%L',m),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_milestones SET status=''ACCEPTED'' WHERE id=%L',m),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_milestones SET company_id=%L WHERE id=%L',c2,m),'23503');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET project_id=%L WHERE id=%L',p2,cost),'23503');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET company_id=%L WHERE id=%L',c2,cost),'23503');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET currency=''VND'' WHERE id=%L',cost),'23503');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET amount=-1 WHERE id=%L',cost),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET currency=''usd'', budget_id=NULL WHERE id=%L',cost),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET status=''APPROVED'' WHERE id=%L',cost),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_budgets SET amount=2000 WHERE id=%L',b),'23514');
  PERFORM pg_temp.reject_sql(format('DELETE FROM project_cost_budgets WHERE id=%L',b),'23514');
  PERFORM pg_temp.reject_sql(format('INSERT INTO project_cost_budgets(id,company_id,project_id,currency,amount,approved_at,revision_no) VALUES(gen_random_uuid(),%L,%L,''USD'',2000,now(),2)',c,p),'23505');
  PERFORM pg_temp.reject_sql(format('INSERT INTO project_cost_budgets(id,company_id,project_id,currency,amount,approved_at) VALUES(gen_random_uuid(),%L,%L,''VND'',-1,now())',c,p),'23514');

  UPDATE project_milestones SET status='ACCEPTED',progress_percent=1,actual_end=current_date,
    accepted_at=now(),acceptance_ref='TEST-ACCEPTANCE' WHERE id=m;
  UPDATE project_cost_budgets SET is_current=false WHERE id=b;
  INSERT INTO project_cost_budgets(id,company_id,project_id,currency,amount,approved_at,revision_no)
    VALUES(b2,c,p,'USD',2000,now(),2);
  UPDATE project_cost_entries SET status='APPROVED',approved_at=now() WHERE id=cost;
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET amount=126 WHERE id=%L',cost),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET budget_id=%L WHERE id=%L',b2,cost),'23514');
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET status=''DRAFT'' WHERE id=%L',cost),'23514');
  PERFORM pg_temp.reject_sql(format('DELETE FROM project_cost_entries WHERE id=%L',cost),'23514');
  UPDATE project_cost_entries SET status='CANCELLED' WHERE id=cost;
  PERFORM pg_temp.reject_sql(format('UPDATE project_cost_entries SET status=''APPROVED'' WHERE id=%L',cost),'23514');
  IF (SELECT amount FROM project_cost_entries WHERE id=cost) <> 125.1250 THEN
    RAISE EXCEPTION 'Decimal precision or historical amount changed';
  END IF;
  INSERT INTO project_cost_entries(id,company_id,project_id,cost_code,cost_date,category,description,currency,amount,updated_at)
    VALUES(draft,c,p,'DRAFT',current_date,'OTHER','Draft deletion test','USD',0,now());
  DELETE FROM project_cost_entries WHERE id=draft;
  IF EXISTS(SELECT 1 FROM project_cost_entries WHERE id=draft) THEN RAISE EXCEPTION 'Draft delete failed'; END IF;
  RAISE NOTICE '0006 PASS: 20 rejected invalid writes; acceptance, budget revision, decimal precision, cancellation and draft deletion verified';
END;
$$;
ROLLBACK;
