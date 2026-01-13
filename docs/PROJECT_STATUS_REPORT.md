# MMQ Yoyaq プロジェクト状況レポート

**最終更新**: 2026-01-13  
**対象システム**: MMQ Yoyaq（マーダーミステリー店舗管理システム）

---

## 📋 システム概要

| 項目 | 技術 |
|------|------|
| フロントエンド | React + TypeScript (Vite) |
| バックエンド | Supabase (Edge Functions) |
| 認証 | Supabase Auth (メール/パスワード + Magic Link + PKCE) |
| インフラ | Vercel (フロントエンド) + Supabase (バックエンド/DB) |
| データベース | PostgreSQL (Supabase) |
| 決済 | 未実装（現地決済のみ） |

---

## 🔒 セキュリティ対応状況

### ✅ 対応完了

| 項目 | 対応日 | 詳細 |
|------|--------|------|
| セキュリティヘッダー | 2026-01-12 | HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Edge Functions認証 | 2026-01-12 | delete-user, invite-staff に管理者認証必須 |
| CORS制限（全20ファイル） | 2026-01-13 | `Access-Control-Allow-Origin: *` を廃止、`getCorsHeaders()` に統一 |
| send-email認証追加 | 2026-01-13 | `verifyAuth()` でadmin/staffのみ許可 |
| ログマスキング | 2026-01-12 | `maskEmail()`, `maskName()`, `maskPhone()` 実装 |
| RLS設定 | 完了 | 全27テーブルで有効 |
| マルチテナント対応 | 完了 | organization_idフィルタ実装（273箇所） |

### 📋 経過観察

| 項目 | 状況 | 備考 |
|------|------|------|
| 予約確認メール送信 | CORS制限済み | 将来的にDB整合性チェック追加推奨 |
| 貸切予約関連メール | CORS制限済み | 将来的にverifyAuth追加推奨 |

### 🕐 将来対応

| 項目 | 優先度 | 備考 |
|------|--------|------|
| Content-Security-Policy | 低 | Reactアプリとの互換性確認が必要 |
| Rate Limiting | 低 | Supabase Proプランで設定可能 |
| インシデント対応フロー | 低 | 対応手順書の作成 |

---

## ⚠️ 既知の問題

### 🔴 高優先度

#### 1. `as any` の過剰使用（53箇所）

**主な問題ファイル**:
- `src/pages/SalesManagement/hooks/useSalesData.ts` - 6箇所
- `src/components/schedule/TimeSlotCell.tsx` - 4箇所
- `src/pages/ScheduleManager/index.tsx` - 4箇所

**対策**: 適切な型定義を追加

---

### 🟡 中優先度

#### 2. console.log/console.errorの残存（208箇所）

**主な問題ファイル**:
- `src/hooks/useScheduleData.ts` - 18箇所
- `src/pages/ScenarioDetailPage/hooks/usePrivateBooking.ts` - 24箇所

**対策**: `logger` ユーティリティを使用

---

#### 3. 未実装のTODOコメント（17箇所）

**重要なTODO**:
1. `src/contexts/AuthContext.tsx` (603行目) - ロール情報取得
2. `src/pages/CustomerBookingPage.tsx` (286行目) - 予約フォーム遷移
3. `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts` (75行目) - store_id取得

**対策**: Issue化して計画的に実装

---

#### 4. N+1クエリの潜在的リスク

**ファイル**: `src/lib/api.ts` - `scheduleApi.getByMonth()`

```typescript
for (const booking of confirmedPrivateBookings) {
  const { data: gmStaff } = await supabase
    .from('staff')
    .select('id, name')
    .eq('id', booking.gm_staff)
    .maybeSingle()
}
```

**対策**: バッチクエリを使用（`in` オペレータ）

---

#### 5. setTimeoutのメモリリーク可能性（34箇所）

**問題パターン**:
```typescript
useEffect(() => {
  setTimeout(() => { /* 処理 */ }, 1000)
  // cleanup関数なし
}, [])
```

**対策**: `clearTimeout` のクリーンアップを追加

---

#### 6. 大きすぎるファイル

| ファイル | 行数 |
|---------|------|
| `src/lib/api.ts` | 1942行 |
| `src/contexts/AuthContext.tsx` | 720行 |

**対策**: 機能ごとにファイル分割

---

### 🟢 低優先度

#### 7. デバッグコード・alert()の残存

**ファイル**: `src/pages/ScheduleManager/index.tsx` (366, 425行目など)

**対策**: Toastライブラリを使用

---

#### 8. tsconfig.jsonでstrict: false

**対策**: 段階的に `strict: true` に移行

---

#### 9. 重複コード

**例**: 時間帯判定ロジックが複数ファイルで重複

**対策**: `src/utils/dateUtils.ts` に統一

---

## 📂 関連ドキュメント

| ファイル | 説明 |
|----------|------|
| `docs/development/multi-tenant-security.md` | マルチテナントセキュリティガイド |
| `docs/development/edge-functions-security.md` | Edge Functionsセキュリティガイド |
| `supabase/functions/_shared/security.ts` | 共通セキュリティヘルパー |

---

## 📊 対応履歴

### 2026-01-13

- ✅ send-email認証追加
- ✅ CORS制限を全20ファイルに適用
- ✅ 脆弱性調査レポート作成

### 2026-01-12

- ✅ セキュリティヘッダー設定
- ✅ Edge Functions認証チェック追加（delete-user, invite-staff）
- ✅ ログマスキング実装

---

## 🎯 次のアクション

### 即座に対応すべき項目
- なし（クリティカル問題は対応済み）

### 今週中に対応すべき項目
- 重要なAPIファイルの `as any` を型安全に修正
- setTimeoutのクリーンアップ追加

### 今月中に対応すべき項目
- console.logの整理
- 大きいファイルの分割
- TODOの整理とIssue化

### 継続的に改善すべき項目
- ESLintルールの追加と適用
- テストカバレッジの向上

---

**次回レビュー推奨日**: 1ヶ月後（または重大な変更後）

