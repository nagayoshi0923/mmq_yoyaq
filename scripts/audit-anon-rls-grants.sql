-- anonが読めるテーブルのRLSが、参照先の必要列を読めず42501になる経路を検出。
-- SQL文字列の表名検索ではなく、PostgreSQLが記録したポリシーの依存列で判定する。
-- 列単位SELECTを許可した公開テーブルを、全列GRANTがないだけで誤検知しない。
WITH accessible_policies AS (
  SELECT p.oid, p.polrelid, p.polname, c.relname AS host_table
  FROM pg_policy p
  JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND p.polcmd IN ('r','*')
    AND has_any_column_privilege('anon',c.oid,'SELECT')
    AND (0=ANY(p.polroles) OR EXISTS (
      SELECT 1 FROM pg_roles r
      WHERE r.oid=ANY(p.polroles) AND pg_has_role('anon',r.oid,'USAGE')
    ))
), blocked_dependencies AS (
  SELECT DISTINCT p.host_table,p.polname,
    c.relname || CASE WHEN d.refobjsubid>0 THEN '.' || a.attname ELSE '' END AS blocked_ref
  FROM accessible_policies p
  JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid
    AND d.refclassid='pg_class'::regclass AND d.refobjid<>p.polrelid
  JOIN pg_class c ON c.oid=d.refobjid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
    AND NOT CASE WHEN d.refobjsubid>0
      THEN has_column_privilege('anon',c.oid,a.attname,'SELECT')
      ELSE has_any_column_privilege('anon',c.oid,'SELECT') END
)
SELECT host_table,polname,string_agg(blocked_ref,', ' ORDER BY blocked_ref) AS refs_anon_blocked
FROM blocked_dependencies
GROUP BY host_table,polname
ORDER BY host_table,polname;
