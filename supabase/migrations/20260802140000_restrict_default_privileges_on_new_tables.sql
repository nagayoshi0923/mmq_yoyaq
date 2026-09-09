-- 新規テーブル/ビューへの anon/authenticated 自動付与を止める（既定権限の是正）
--
-- 背景（本番実測 2026-08-02, pg_default_acl）:
--   public スキーマでは grantor = postgres / supabase_admin の両方が、
--   新規作成される TABLES（ビュー含む）に anon / authenticated へ
--   INSERT/SELECT/UPDATE/DELETE/REFERENCES/TRIGGER 等を自動付与していた。
--   これが「新規ビューを作ると既定で anon に全公開される」事故
--   （顧客PII 3530件露出）の根本原因。
--
-- 方針:
--   - TABLES: anon / authenticated への既定付与を廃止。
--     今後は必要なテーブル/ビューにだけ明示 GRANT する
--     （公開系は anon SELECT、アプリ系は authenticated に必要最小限）。
--   - SEQUENCES: anon への既定付与のみ廃止（authenticated は serial 採番で
--     必要になるケースがあるため現状維持）。
--   - FUNCTIONS: 変更しない。RPC は既定 EXECUTE に依存しており、
--     剥がすと新規 RPC が全てサイレント失敗するため（別途個別管理）。
--
-- 影響:
--   既定権限は「今後作られるオブジェクト」にのみ効く。既存テーブル/ビューの
--   権限は一切変わらず、アプリの現行動作に影響はない。
--   今後のmigrationでは、公開したいオブジェクトに明示的な GRANT が必要になる。

BEGIN;

-- migration 経由（postgres）で作られるオブジェクト
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

COMMIT;
