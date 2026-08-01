# 公式サイト向け 公開シナリオ API 設計

queenswaltz.jp（STUDIO・2026-08-05 解約）のシナリオカタログを、MMQ のデータから生成するための公開 API 設計。
STUDIO CMS と MMQ の二重更新を解消することが目的。

- 関連: `.archive-queenswaltz/`（アーカイブ）、Figma 遷移図 `mvlDV4r9VWxO8uAXvWJ2B7`
- 対象組織: クインズワルツ `a0000000-0000-0000-0000-000000000001` / slug `queens-waltz`
- 対象件数: `org_status='available'` 181件（本番実測 2026-08-01）

---

## 0. 決定事項（PO判断済み 2026-08-01）

| 論点 | 決定 |
|---|---|
| 参加費の公開 | **公開する**（現行 HP が既に一覧に料金を出しているため）。ただし通常料金のみ。 |
| HP 掲載シナリオの初期リスト | **`org_status='available'` の181件を全部掲載**扱いにする |

---

## 1. 🚨 先に塞ぐべき本番のセキュリティ欠陥

本番（`cznpcewciwywcqcxktba`）の実測結果:

```
organization_scenarios_with_master | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
organization_scenarios_public      | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

`organization_scenarios_with_master` は anon に **全カラム SELECT** が付いている。ビューは `security_invoker` 未設定（`reloptions = null`）なので基礎テーブルの RLS は**ビュー所有者権限で評価される＝行フィルタが効かない可能性が高い**。

これにより anon キーだけで以下が読める:

- `license_amount` ほかライセンス料 8種
- `production_cost` / `production_costs` / `depreciation_per_performance`（原価・償却）
- `gm_costs` / `gm_count` / `gm_assignments` / `available_gms` / `experienced_staff`（GM報酬と実名）
- `notes`（内部メモ）、`author_email`（作者の連絡先）
- `participation_costs` の `time_slot='gmtest'`（スタッフ向け内部価格）

**この API を作る前に、独立した hotfix として REVOKE する。** 本設計の Phase 1。
（memory `project_prod_anon_grants_hardened_staging_open` の「本番は意図的に厳格」はこのビューには当てはまっていない。）

---

## 2. アーキテクチャ方針

**anon への直接 GRANT は使わず、専用の serverless API を唯一の窓口にする。**

```
queenswaltz.jp (新HP)
        │  fetch (CORS: queenswaltz.jp のみ許可)
        ▼
GET /api/public/scenarios        ← Vercel serverless / 認証なし
        │  service_role
        ▼
public.public_scenarios (VIEW)   ← 公開カラムだけのホワイトリストビュー
        │
        ▼
organization_scenarios × scenario_masters
```

この形にする理由:

| 案 | 採否 | 理由 |
|---|---|---|
| anon に列制限 GRANT + PostgREST 直叩き | ✗ | カラム追加のたびに漏洩リスク。過去に列制限が `20260412110000` で巻き戻された前例あり |
| 専用ビュー + 専用 API（本案） | ✓ | 公開カラムがビュー定義1箇所に集約。CDN キャッシュが効く。CORS で呼び出し元を絞れる |

---

## 3. エンドポイント仕様

### 3-1. `GET /api/public/scenarios` — 一覧

**認証**: なし
**CORS**: `Access-Control-Allow-Origin` は許可リスト方式（`PUBLIC_SITE_ORIGINS` 環境変数、`https://queenswaltz.jp` / `https://www.queenswaltz.jp` / `http://localhost:*`）。`Allow-Credentials` は **付けない**。
**キャッシュ**: `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`

#### クエリパラメータ

| 名前 | 型 | 既定 | 説明 |
|---|---|---|---|
| `org` | string | `queens-waltz` | 組織 slug。未知の slug は 404 |
| `tag` | string（カンマ区切り） | — | `genre` 配列との AND 一致 |
| `players` | int | — | `player_count_min <= players <= player_count_max` |
| `q` | string | — | title / author の部分一致 |
| `sort` | enum | `recommended` | `recommended` \| `newest` \| `title` \| `duration` |
| `limit` | int | 24 | 最大 100 |
| `offset` | int | 0 | |

#### レスポンス

```jsonc
{
  "items": [
    {
      "id": "uuid",                    // org_scenario_id
      "slug": "sorcier",
      "title": "SORCIER～賢者達の物語～",
      "author": "…",
      "key_visual_url": "https://…",
      "description": "…",              // synopsis は本番0件なので description のみ
      "caution": "…",
      "player_count_min": 6,
      "player_count_max": 6,
      "duration": 210,                 // 分
      "weekend_duration": 240,         // 分 / null
      "genre": ["オススメ", "新作"],
      "sensitive_tags": [],
      "has_pre_reading": false,
      "scenario_type": "normal",
      "is_recommended": true,
      "release_date": "2025-04-01",
      "price": {                       // ← §3-3 参照
        "normal": 4500,
        "display": "4,500円"
      }
    }
  ],
  "total": 181,
  "limit": 24,
  "offset": 0
}
```

### 3-2. `GET /api/public/scenarios/[slug]` — 詳細

一覧と同じオブジェクトを単体で返す。`org` クエリ必須。存在しない/非公開なら 404。
**一覧と詳細で返すフィールドを完全に同一にする**（カラム追加時に片方だけ漏れる事故を防ぐため、シリアライザを共有する）。

### 3-3. 料金の返し方（重要）

`participation_costs` は以下の構造で、**`time_slot='gmtest'` はスタッフ向け内部価格**:

```json
[{"type":"fixed","amount":4500,"time_slot":"normal"},
 {"type":"fixed","amount":3500,"time_slot":"gmtest"}]
```

- API は **`time_slot='normal'` の要素だけ**を通す。`gmtest` は絶対に含めない。
- `flexible_pricing` / `pricing_patterns` / `use_flexible_pricing` は**生のまま返さない**。
- 返すのは `price.normal`（数値）と `price.display`（表示用文字列）のみ。
- 平日/土日祝で差がある場合は `display` を `"平日4,500円 / 土日祝5,000円"` 形式で組み立てる。

### 3-4. 返さないカラム（ブラックリスト・実装時の確認用）

`license_amount` / `gm_test_license_amount` / `franchise_*` / `external_*` / `fc_*`（ライセンス料 全8種）、
`production_cost` / `production_costs` / `depreciation_per_performance`、
`gm_costs` / `gm_count` / `gm_assignments` / `available_gms` / `experienced_staff`、
`notes`、`author_email`、`author_id`、`survey_url` / `survey_enabled` / `survey_deadline_days`、
`characters`（配役はネタバレになりうるため初期は非公開）、
`available_stores`（店舗 UUID そのままは出さない）、
`booking_start_date` / `booking_end_date` / `individual_notice_template` / `private_booking_*`、
`play_count` / `kit_count` / `master_status` / `report_display_name` / `required_props` / `gm_test_participation_fee`

---

## 4. DB 変更案

### 4-1. `organization_scenarios` へのカラム追加

```sql
ALTER TABLE public.organization_scenarios
  ADD COLUMN IF NOT EXISTS web_published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS web_display_order integer;

COMMENT ON COLUMN public.organization_scenarios.web_published
  IS '公式サイト(queenswaltz.jp)への掲載可否。org_status=available かつ true のものだけ公開APIに出る';
COMMENT ON COLUMN public.organization_scenarios.web_display_order
  IS '公式サイト一覧の表示順。NULL は末尾';

CREATE INDEX IF NOT EXISTS idx_org_scenarios_web_published
  ON public.organization_scenarios (organization_id, web_published)
  WHERE web_published;
```

`DEFAULT true` は PO決定「available 181件を全部掲載」に対応。

### 4-2. 公開ビュー

```sql
CREATE OR REPLACE VIEW public.public_scenarios
WITH (security_invoker = true) AS
SELECT
  os.id, os.organization_id, os.slug,
  COALESCE(os.override_title, sm.title)                        AS title,
  COALESCE(os.override_author, sm.author)                      AS author,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url)        AS key_visual_url,
  COALESCE(os.custom_description, sm.description)              AS description,
  COALESCE(os.custom_caution, sm.caution)                      AS caution,
  COALESCE(os.override_player_count_min, sm.player_count_min)  AS player_count_min,
  COALESCE(os.override_player_count_max, sm.player_count_max)  AS player_count_max,
  COALESCE(os.duration, sm.official_duration)                  AS duration,
  COALESCE(os.weekend_duration, sm.weekend_duration)           AS weekend_duration,
  COALESCE(os.override_genre, sm.genre, '{}')                  AS genre,
  COALESCE(os.custom_sensitive_tags, sm.sensitive_tags, '{}')  AS sensitive_tags,
  COALESCE(os.override_has_pre_reading, sm.has_pre_reading, false) AS has_pre_reading,
  COALESCE(os.scenario_type, 'normal')                         AS scenario_type,
  COALESCE(os.is_recommended, false)                           AS is_recommended,
  sm.release_date,
  os.participation_fee,
  os.participation_costs,
  os.web_display_order,
  os.updated_at
FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id
WHERE os.org_status = 'available' AND os.web_published;

REVOKE ALL ON public.public_scenarios FROM anon, authenticated;
GRANT SELECT ON public.public_scenarios TO service_role;
```

`participation_costs` はビューには残す（API 層で `gmtest` を落とす）が、**anon には GRANT しない**のでビュー経由の漏洩は起きない。

### 4-3. hotfix（Phase 1・API とは独立に先行適用）

```sql
REVOKE ALL ON public.organization_scenarios_with_master FROM anon;
REVOKE ALL ON public.organization_scenarios_public      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.organization_scenarios_with_master, public.organization_scenarios_public
  FROM authenticated;
GRANT SELECT ON public.organization_scenarios_with_master TO authenticated;
GRANT SELECT ON public.organization_scenarios_public      TO authenticated;
```

⚠️ **適用前に必ず確認**: 予約サイト（顧客向け画面）が anon のまま `organization_scenarios_with_master` を読んでいないか。読んでいる場合は先に `organization_scenarios_public` 相当の安全なビューに差し替えてから REVOKE する。

---

## 5. MMQ に無い項目の判定

| 候補項目 | 要否 | 判断根拠 |
|---|---|---|
| **HP掲載フラグ** | **追加する** | `available` 181件と HP 掲載数は一致しない可能性。将来 HP から外す運用のために必要。初期値 true |
| **表示順** | **追加する** | 現行 HP は STUDIO 側で並べ替えていた。MMQ 側に順序を持つ手段がない |
| カタログ分類 | **不要** | 既存 `genre` が HP のタグ体系とほぼ一致（オススメ / 新作 / ロングセラー / ミステリー / デスゲーム / 和風 / ロールプレイ重視 / 情報量多め / 駆け引き重視 / ストーリープレイング / 初心者におすすめ）。新規カラムは作らず genre をそのまま使う |
| URL slug | **既存で足りる**（要データ補完） | 181件中 173件に slug あり。**8件が NULL** → §6 |
| SEO meta（title/description） | **不要** | 現行 HP は全ページ共通 title・description 空。API の title / description から新HP側で自動生成すれば現状より改善 |
| OGP画像 | **不要** | `key_visual_url` を流用。178/181 に画像あり |
| PV動画URL | **見送り** | 現行 HP に PV 掲載なし。必要になった時点で `pv_url` を追加 |
| キャッチコピー（一覧用短文） | **見送り** | `description` の冒頭で代用。運用してから必要性を判断 |
| 難易度 | **公開しない** | 181件中 174件が `"3"` で実質未運用。出しても情報にならない |
| あらすじ（synopsis） | **公開しない** | 本番で **0件**。`description`（172件）を使う |

---

## 6. データ整備タスク（実装と並行）

本番実測での欠損:

| 症状 | 件数 | 対象 |
|---|---|---|
| `slug` が NULL | 8 | REDRUM05 目醒めゆくフローライト / 這い寄る化身 / ANOMIA：異象観測 / 肩仏署の柔らかな事件簿 / マネージャー業務 / 北原千夜のすべて / 君が為の殺人 / リアルマダミス・TRPG - モフモフ邪神会議 |
| `description` が空 | 9 | ナナイロの迷宮"青" / 日蝕に捧げる鎮魂歌 / 殺神罪 / SORCIER / ホロロジストが告げる時 / 墜灯 / WANTEDz / 這い寄る化身 / マネージャー業務 |
| `key_visual_url` が空 | 3 | 這い寄る化身 / マネージャー業務 / 墜灯 |

⚠️ **「マネージャー業務」は公演シナリオではなく業務枠**と思われる。「這い寄る化身」も slug・画像・説明すべて欠損。
「available 181件を全部掲載」の決定どおりに進めると **この2件が公式サイトに出る**。公開前に PO 目視で `web_published=false` にすること（Phase 4 のチェックリストに入れる）。

slug は `organization_scenarios(organization_id, slug)` に既存インデックスがあるが **UNIQUE 制約がない**。URL の一意性を保証するため、補完と同時に部分 UNIQUE インデックスを張る:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_scenarios_slug
  ON public.organization_scenarios (organization_id, slug)
  WHERE slug IS NOT NULL;
```

---

## 7. 実装フェーズ

| Phase | 内容 | 担当 | 依存 |
|---|---|---|---|
| **1** | 🚨 anon GRANT の REVOKE hotfix（§4-3）。事前に anon 読み取り箇所を全数調査 | Codex | なし・最優先 |
| **2** | マイグレーション: `web_published` / `web_display_order` 追加、`public_scenarios` ビュー作成、slug UNIQUE index（§4-1/4-2/6） | Codex | 1 |
| **3** | `api/public/scenarios.ts` + `api/public/scenarios/[slug].ts` 実装（§3） | Codex | 2 |
| **4** | 管理画面にHP掲載トグル・表示順UI、slug/description/画像の欠損補完 | Codex + PO | 2 |
| **5** | 新HP側でこの API を叩くカタログ画面を実装 | 別リポジトリ | 3 |

Phase 1 は本番の情報漏洩を塞ぐもので、HP 移植とは独立に価値がある。**8/5 の STUDIO 解約期限とは無関係に今すぐ着手する。**
