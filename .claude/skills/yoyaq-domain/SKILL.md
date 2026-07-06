---
name: yoyaq-domain
description: yoyaq/MMQのドメイン知識（シナリオ二層構造、公演枠、予約ライフサイクル、貸切、体験済み判定、キット等）をロードする。企画相談・仕様ドラフト・新機能設計の前提として使う。ユーザーが「ドメイン前提で」「仕様を考えたい」と言ったとき、または予約/公演/シナリオ/貸切/キットに関わる設計を始めるとき使う。
---

# yoyaq ドメイン知識ロード

**知識の本体は `docs/DOMAIN.md`。このskillはロード手順書。**

## 手順

1. `docs/DOMAIN.md` を読む（エンティティ相関・主要概念・環境の要点）
2. 議論対象に応じて深掘りソースを追加で読む:

| 対象 | 追加で読むもの |
|---|---|
| 予約・ステータス | `src/lib/constants.ts` + `src/types/reservation.ts` |
| 公演枠・スケジュール | `supabase/schemas/schedule_events.sql` |
| 貸切 | `docs/private-booking-rules.md` + `src/types/privateGroup.ts` |
| シナリオ | `supabase/schemas/scenario_masters.sql` + `organization_scenarios.sql` |
| キット | `docs/design/kit-transfer-planning.md` |
| マルチテナント/権限 | `docs/MULTI_TENANT_ISSUES.md` |

3. DOMAIN.md と実コードが食い違ったら**実コードが正**。DOMAIN.md の修正を提案する

## メンテナンス

- スキーマ変更・新概念追加のたびに `docs/DOMAIN.md` を更新する（/db-change の完了時に確認）
- claude.ai / Cowork で同じ前提を使いたい場合は DOMAIN.md の内容を
  claude.ai Project のナレッジにコピーする（リポジトリskillはClaude Code専用のため）
