# 不具合再現環境（ローカル専用）

不具合申請を、テストアカウントで「申請 → 承認 → 画面確認」まで手元で再現するための環境。
本番・ステージングのデータには触れず、メール・Discord・外部APIも送らない。

- DB: ローカル Supabase（Docker）。構造はステージングのスキーマダンプ（データなし）から作る
- 画面: Vite（`http://127.0.0.1:5176`）
- `/api`: `scripts/local-repro/api-server.ts` が `api/*.ts` をローカル DB につないで実行する
- Edge Functions / cron は動かさない（通知・メール送信は失敗扱いになるのが正常）

## 使い方

```bash
scripts/local-repro/db.sh start      # 初回はステージングの構造を取得してから起動
scripts/local-repro/web.sh           # 画面と /api を起動
```

- テストデータの入れ直し: `scripts/local-repro/db.sh reset`
- ステージングの最新構造を取り直す: `scripts/local-repro/db.sh refresh`
- 停止: `scripts/local-repro/db.sh stop`
- DB の中身を見る: `http://127.0.0.1:55323`（Supabase Studio）

未反映の修正 migration を試すときは、`db.sh reset` のあとに
`docker exec -i supabase_db_mmq-local-repro psql -U postgres -d postgres < supabase/migrations/<file>.sql` で当てる。

## テストデータ（`supabase/seed.sql`）

組織「テスト劇団」（slug: `repro-org`）、店舗 A/B、作品「テスト作品」（4〜7名・240分・貸切可）。

| アカウント | 役割 |
|---|---|
| admin@repro.test | 管理者（スタッフ画面・貸切承認） |
| gm@repro.test | GM |
| customer1@repro.test | お客さん（幹事役） |
| customer2@repro.test | お客さん（参加者役） |

パスワードは全員 `repro-local-2026`（このローカル環境専用）。

## よく使う入口

- 貸切グループ作成: `/group/create?scenarioId=00000000-0000-4000-a000-000000000201&org=repro-org`
- 貸切予約管理（スタッフ）: `/private-booking-management`
