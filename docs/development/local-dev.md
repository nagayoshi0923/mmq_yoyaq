# 手元の開発環境（画面・API・DB を全部手元で動かす）

**最終更新**: 2026-10-10

`npm run dev:full` 一発で、画面（vite）・API（`api/*.ts`）・DB（ローカル Supabase）が全部手元で動く。
API や DB を直しても staging に取り込まずにその場で試せる。データは壊してよい試験データ。
本番・staging には一切接続しない（メール・Discord も飛ばない）。

## 必要なもの

- Docker Desktop（起動しておく）
- Node 22 以上（`npm ci` 済み）
- Supabase CLI は `npx supabase` で使う（別途インストール不要）

## 起動と停止

```bash
npm run dev:full        # 起動（初回は DB 作成と試験データ投入で 1〜2 分）
# Ctrl+C で画面と API が止まる（Supabase は動いたまま。次の起動が速い）
npm run dev:full:stop   # Supabase も含めて全部止める（DB の中身は残る）
```

`dev:full` がやること:

1. `.env.local` / `.env.api.local` が無ければ例ファイル（`.env.local.example` / `.env.api.local.example`）から作る
2. ローカル Supabase を起動（`scripts/local-dev/supabase.sh start`）。初回は DB を作り、構造と試験データを入れる
3. API サーバー（`scripts/dev-api-server.mjs`）と画面（vite）を並べて起動（`concurrently`）

Supabase の接続先は `.env.local` の中身に関わらず手元に固定する（起動時に環境変数で上書き）。
API サーバーは接続先が手元（localhost / 127.0.0.1）でなければ起動を拒否する。

## ポート

| 番号 | 中身 |
|---|---|
| http://localhost:5173 | 画面（vite）。`/api` と `/sitemap.xml` は 3000 番へ転送 |
| http://localhost:3000 | API サーバー（`api/*.ts` を直接実行。ファイルを保存すると自動で再起動） |
| http://localhost:54321 | ローカル Supabase（API・認証） |
| localhost:54322 | ローカル Supabase の Postgres（`postgresql://postgres:postgres@127.0.0.1:54322/postgres`） |
| http://localhost:54323 | Supabase Studio（DB の中身を見る・直す） |
| http://localhost:54324 | Mailpit（認証メールなど、手元で送ったメールが届く） |

## 試験アカウント

パスワードは全員 **`mmq-local-2026`**（手元の試験値。本番とは無関係）。

| メール | 役割 | 用途 |
|---|---|---|
| `staff-admin@mmq.test` | 管理者（スタッフ「試験 管理者」、GM も兼ねる） | スタッフ画面 `/queens-waltz/schedule`、貸切承認 |
| `customer1@mmq.test` | お客様「試験 一子」（ニックネーム いちこ） | 貸切グループの主催者。登録クーポン 1 枚所持 |
| `customer2@mmq.test` | お客様「試験 二郎」（**ニックネーム無し**） | 一般公演の予約・取消（予約は 0 件から始まる）。貸切グループのメンバー |

新規登録も試せる。確認メールは Mailpit（http://localhost:54324）に届く。

## 試験データ（`supabase/seed.sql`）

組織 slug は本番と同じ `queens-waltz`（URL が本番と同じ形になる。名前は「Queens Waltz（手元試験）」）。

- 店舗: 試験 本店・試験 二号店（ほかに組織作成時に自動で作られる臨時会場 1〜5）
- 作品:
  - 試験作品・六人の館（6 名固定、`/queens-waltz/scenario/test-six-fixed`）
  - 試験作品・揺れる人数（5〜8 名、`test-flex-5-8`）
  - 試験作品・事前の手紙（4〜5 名、事前読み込み〔読み合わせ〕あり、`test-pre-reading`）
- 一般公演（今日から 14 日以内に 6 本）: **満席**（2 日後・六人の館）、**残り 1**（3 日後・揺れる人数）、空きあり 4 本
- 貸切グループ（すべて customer1 が主催）: **人集め中**／**申込済み・店舗確認待ち**／**確定**（16 日後・二号店）／**取り下げ**（申込中に取り下げ）／**却下**（店舗が却下。グループは日程調整に戻る）
  - customer2 は「人集め中」（日程に未回答）と「確定」にメンバーとして参加。「人集め中」にはゲスト「ゲスト三郎」も参加（主催者の引き継ぎはゲストに出ないことの確認用）
  - 組織設定に架空の貸切キャンセル共有チャンネル。メンバーが外れた・抜けた・申込者が変わったときの店舗への知らせは `discord_notification_queue` に積まれるだけ（手元では送られない）
  - 「確定」の作品（事前の手紙）は公演前アンケートが有効。customer1・customer2 とも未回答
- customer1 の一般公演の予約: 5 日後の「事前の手紙」に 2 名
- customer1 の遊びたいリスト: 六人の館（直近は満席なので次の空き公演が出る）・揺れる人数
- クーポン: 登録クーポンのキャンペーン「新規登録 500円引き」

日付は投入した日からの相対。日が経ったら入れ直す:

```bash
npm run supabase:reset   # DB を作り直して試験データを入れ直す（手元のデータは消える）
```

貸切グループは画面と同じ RPC（`create_private_group_atomic` → `create_private_booking_request` → `approve_private_booking`）を
お客様・管理者としてログインした扱いで呼んで作るので、制約・トリガー・権限確認を通った本物と同じ形になる。

## DB の作り方（なぜ supabase/ をそのまま使わないか）

`supabase/migrations` の古い migration は本番で画面操作により作られた表（`authors` など）を前提にしており、
空の DB に最初から流すと途中で止まる（`20260211100001` で `relation "public.authors" does not exist`）。
そこで整備 1 で作った本番構造の基準 `supabase/baseline/<版>_prod.sql` と、それより新しい migration だけを
作業フォルダ `.local-supabase/supabase/`（git 管理外、起動のたびに作り直す）に並べて起動する。
`scripts/check-db-baseline.sh` と同じ組み立て方で、本番と同じ構造になる。

- `npm run supabase:start` / `supabase:reset` はこの作業フォルダを使う（`scripts/local-dev/supabase.sh`）
- `config.toml` と `seed.sql` は `supabase/` のものを写す（認証メールのリンク先 `site_url` だけ http://localhost:5173 に変える）
- 新しい migration を作ったら `npm run supabase:reset` で反映を確かめられる
- `npm run supabase:status` / `supabase:stop` / `supabase:functions:serve` はそのまま使える（`project_id = "mmq-local"` で同じ Supabase を指す）

## staging 転送との使い分け

| コマンド | 画面 | API | DB | 向いている作業 |
|---|---|---|---|---|
| `npm run dev:full` | 手元 | 手元（3000） | 手元（試験データ） | API・DB・画面の変更、予約などの書き込みを試す |
| `npm run dev:vercel` | 手元 | staging の Vercel | staging（本番の写し） | 画面だけの変更を本番に近いデータで見る |
| `npm run dev:staging` | 手元 | staging の Vercel | staging | 同上（`.env.staging` を使う） |

staging は本番の写しで、翌朝消える・実在スタッフの名前がある。書き込みを伴う確認はまず `dev:full` で行う。

## 単体で動かす

```bash
npm run supabase:start   # DB だけ
npm run dev:api          # API だけ（tsx watch。.env.local → .env.api.local の順に読む）
VITE_API_TARGET=http://127.0.0.1:3000 npm run dev   # 画面だけ（API は手元）
```

API サーバーは `vercel.json` の rewrites も同じ規則で再現する（`/sitemap.xml` → `/api/sitemap`、`/guide` → `/api/seo?kind=guide` など）。
3000 番で SEO 用 HTML（`/`、`/queens-waltz` など）を見るときは先に `npm run build:fast`（`dist/app.html` を使うため）。

## プッシュ通知（ウェブプッシュ）を試す（貸切グループ 段階 3）

外部サービスを使わない Web Push（VAPID）。鍵は環境（手元・staging・本番）ごとに別に作る。
**秘密鍵はリポジトリ・チャット・報告に書かない**（公開鍵は画面に配るので秘密ではないが、作り直すと端末の受け取り直しが要る）。

### 鍵を作る

```bash
node scripts/generate-vapid-keys.mjs --env /path/to/vapid.env   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT を書く（権限 600）
```

| 置き場所 | 名前 | 値 |
|---|---|---|
| 画面（vite の環境変数。手元は `.env.local`、staging・本番は Vercel の環境変数） | `VITE_VAPID_PUBLIC_KEY` | 公開鍵 |
| Supabase の secrets（Edge Function `send-web-push`） | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`（`mailto:` で始まる連絡先） | 同じ組の公開鍵・秘密鍵 |
| Supabase の secrets | `WEB_PUSH_CRON_SECRET` | DB の `app_config` の `trigger_secret` と同じ値（DB からの呼び出しの確認。無ければ `CRON_SECRET` を見る。staging は `CRON_SECRET` と `trigger_secret` が違うので必須） |

staging の鍵は 2026-10-10 に作って secrets に入れた（Keychain の `mmq-vapid-staging`、アカウント `public` / `private`）。

### 手元で通す

1. 上の鍵を作り、公開鍵を `.env.local` の `VITE_VAPID_PUBLIC_KEY` に入れる（`npm run dev:full` を起動し直す）
2. 鍵のファイルに `CRON_SECRET=<適当な長い文字列>` を足し、関数を起動する（別の端末）:
   `npx supabase functions serve --workdir .local-supabase --env-file /path/to/vapid.env --no-verify-jwt`
3. DB が関数を呼べるよう、手元の `app_config` に接続先を入れる（`supabase:reset` で消えるので、そのたびに）:
   ```sql
   insert into app_config(key,value) values
     ('supabase_url','http://supabase_kong_mmq-local:8000'),   -- DB のコンテナから見た Supabase
     ('supabase_anon_key','<npm run supabase:status の anon key>'),
     ('trigger_secret','<2 の CRON_SECRET と同じ値>')
   on conflict (key) do update set value = excluded.value;
   ```
4. Chrome で会員 2 人を別のプロフィール（またはシークレットウィンドウと通常ウィンドウ）で開き、グループで初めて発言 →「受け取る」。
   もう 1 人が発言すると通知が届く（Chrome の通知は Google の配信元を通る。手元の画面からでも届く）。
   送った記録は `web_push_outbox`（送った・送らなかった理由 `skip_reason`）、端末の購読は `web_push_subscriptions`。
   Claude のブラウザペインは通知の許可が「ブロック」固定のため、受け取りの確認は Chrome（Playwright の `channel: 'chrome'` でも可）で行う。

- 同じグループで 30 秒以内に続いた発言は 1 通（「○○さんほか N 件の新着」）。チャットを開いて見ている人・既読の人には送らない。
- 毎分の取りこぼし拾い（定期実行 `process-web-push`）は `app_config` が本番・staging の形（`https://<ref>.supabase.co`）のときだけ登録される。手元では DB のトリガーからの呼び出しだけで動く。

## 手元で動かないもの

- Edge Functions（メール送信・Discord 通知など）は既定で起動しない。画面から呼ぶと 503 になり、
  「確認メールの送信を確認できませんでした」などと出るのが正常。試すときは別の端末で `npm run supabase:functions:serve`
  （送信先の API キーは設定しないので外部には送られない）
- 定時実行（cron）の通知は、接続設定（`app_config`）が空なので何もしない。
  cron の記録（`cron.job_run_details`）に「募集判定の接続設定がありません」「null value in column "url"」の失敗が残るが無害
- freee 連携・キャンセル料請求など、`FREEE_*` / `CANCELLATION_BILLING_*` を使う機能は「未設定」として動く

## よくある詰まり

| 症状 | 対処 |
|---|---|
| `Docker が起動していません` | Docker Desktop を起動してからやり直す |
| `port 3000（5173）が使用中です` | `npm run dev:full:stop`（または `npm run dev:stop`）。他の worktree で起動していないかも確認 |
| Supabase のポート（54321 など）が使用中 | 別の worktree や別名のプロジェクトで Supabase が動いている。`docker ps` で確認し、そちらで `npx supabase stop` |
| 公演が出ない・日付が古い | `npm run supabase:reset` で試験データを入れ直す |
| ログインできない | パスワードは `mmq-local-2026`。`supabase:reset` 後はブラウザの古いログイン状態が残るので一度ログアウトする |
| `/api` が 401 / 403 | 正常（ログインしていない・権限が無い）。スタッフ用 API は `staff-admin@mmq.test` で |
| `/api` が 500 で `dev-api: handler error` | `npm run dev:full` の `[api]` の行にエラー内容が出る |
| API を直したのに変わらない | `[api]` の行で再起動したか確認（`tsx watch` は import されたファイルの保存で再起動する） |
| `SUPABASE_URL が手元ではありません` | `.env.api.local` に staging などの URL が書かれている。例ファイルから作り直す |
| migration を足したら起動に失敗する | `.local-supabase/` は毎回作り直すので、migration 自体を直して `npm run supabase:reset` |
