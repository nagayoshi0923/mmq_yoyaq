# 今回の修正箇所チェックポイント

## ✅ 今回修正したAPIファイル（優先確認）

### 1. scenarioApi.ts
**修正箇所:**
- `getPerformanceCount()` - 行589-601
- `getScenarioStats()` - 行606-915（複数箇所）
- `getAllScenarioStats()` - 行792-857
- `delete()` - 行509-572

**確認方法:**
```bash
# 該当行を確認
grep -n "getPerformanceCount\|getScenarioStats\|getAllScenarioStats" src/lib/api/scenarioApi.ts -A 10
```

**チェック項目:**
- [ ] `getPerformanceCount()`に`organization_id`フィルタがあるか
- [ ] `getScenarioStats()`の全クエリに`organization_id`フィルタがあるか
- [ ] `getAllScenarioStats()`に`organization_id`フィルタがあるか
- [ ] `delete()`の関連データ更新に`organization_id`フィルタがあるか

### 2. scheduleApi.ts
**修正箇所:**
- `addDemoParticipantsToAllActiveEvents()` - 行896-1033
- `getByMonth()` - 行346-360（reservationsクエリ）
- `getByScenarioId()` - 行611-616（reservationsクエリ）

**確認方法:**
```bash
grep -n "addDemoParticipantsToAllActiveEvents\|getByMonth\|getByScenarioId" src/lib/api/scheduleApi.ts -A 15
```

**チェック項目:**
- [ ] `addDemoParticipantsToAllActiveEvents()`に`organization_id`フィルタがあるか
- [ ] `getByMonth()`のreservationsクエリに`organization_id`フィルタがあるか
- [ ] `getByScenarioId()`のreservationsクエリに`organization_id`フィルタがあるか

### 3. salesApi.ts
**修正箇所:**
- `getSalesByPeriod()` - 行87-95（reservationsクエリ）

**確認方法:**
```bash
grep -n "getSalesByPeriod" src/lib/api/salesApi.ts -A 10
```

**チェック項目:**
- [ ] reservationsクエリに`organization_id`フィルタがあるか

### 4. staffApi.ts
**修正箇所:**
- `delete()` - 行171-259（複数箇所）

**確認方法:**
```bash
grep -n "async delete" src/lib/api/staffApi.ts -A 90
```

**チェック項目:**
- [ ] shift_submissions削除に`organization_id`フィルタがあるか
- [ ] staff_scenario_assignments削除に`organization_id`フィルタがあるか
- [ ] schedule_events更新に`organization_id`フィルタがあるか
- [ ] reservations更新に`organization_id`フィルタがあるか

### 5. memoApi.ts
**修正箇所:**
- `getByMonth()` - 行10-31
- `delete()` - 行59-67

**確認方法:**
```bash
cat src/lib/api/memoApi.ts
```

**チェック項目:**
- [ ] `getByMonth()`に`organization_id`フィルタがあるか
- [ ] `delete()`に`organization_id`フィルタがあるか

### 6. eventHistoryApi.ts
**修正箇所:**
- `getEventHistory()` - 行226-243

**確認方法:**
```bash
grep -n "getEventHistory" src/lib/api/eventHistoryApi.ts -A 20
```

**チェック項目:**
- [ ] scheduleEventId指定時に`organization_id`フィルタがあるか

### 7. shiftApi.ts
**修正箇所:**
- `upsert()` / `upsertMultiple()` - 行91-111
- `submitMonthly()` - 行119-136
- `approveShift()` / `rejectShift()` - 行187-204

**確認方法:**
```bash
grep -n "upsert\|submitMonthly\|approveShift\|rejectShift" src/lib/shiftApi.ts -A 10
```

**チェック項目:**
- [ ] `upsert()`で`organization_id`が自動設定されるか
- [ ] `submitMonthly()`に`organization_id`フィルタがあるか
- [ ] `approveShift()`/`rejectShift()`に`organization_id`フィルタがあるか

### 8. customers INSERT
**修正箇所:**
- `LoginForm.tsx` - 行240-264
- `useFavorites.ts` - 行76-84

**確認方法:**
```bash
grep -n "from('customers')" src/components/auth/LoginForm.tsx src/hooks/useFavorites.ts -A 5
```

**チェック項目:**
- [ ] INSERT時に`organization_id`が設定されているか

## 🔍 動作確認方法

### 1. 型チェック
```bash
npm run typecheck
```

### 2. ビルド確認
```bash
npm run build
```

### 3. 実際の動作確認（推奨）
1. **複数組織のアカウントでログイン**
   - 組織Aのアカウントでログイン
   - 組織Bのアカウントでログイン

2. **データ分離の確認**
   - 各組織のデータが正しく表示されるか
   - 他組織のデータが表示されないか

3. **主要機能の確認**
   - シナリオ一覧（組織フィルタ）
   - 公演一覧（組織フィルタ）
   - 予約一覧（組織フィルタ）
   - スタッフ一覧（組織フィルタ）

## ⚠️ スクリプトの検出結果について

自動チェックスクリプトが228件検出しましたが、これには以下が含まれる可能性があります：

1. **誤検出**: 実際には`organization_id`フィルタがあるが、スクリプトが検出できていない
2. **既に修正済み**: 今回修正したAPIファイルも含まれている
3. **本当の問題**: まだ修正されていない箇所

**推奨アプローチ:**
1. まず上記の修正済みAPIファイルを確認
2. 動作確認で問題がないか確認
3. 問題があれば、スクリプトの検出結果から優先度の高い箇所を修正

## 📋 優先度の高い未修正箇所（スクリプト検出結果から）

### P0（緊急）: データ漏洩リスク
- `reservationApi.ts` - 全クエリ
- `assignmentApi.ts` - 全クエリ
- `participantUtils.ts` - 全クエリ

### P1（高）: ユーザー向け機能
- `useEventOperations.ts` - スケジュール操作
- `useScheduleData.ts` - スケジュール取得
- `ReservationList.tsx` - 予約一覧

### P2（中）: 内部機能
- `ImportScheduleModal.tsx` - インポート機能
- `MyPage`関連 - ユーザー個人ページ

## 🎯 次のステップ

1. ✅ 修正済みAPIファイルの確認（上記リスト）
2. ⏭️ 動作確認（複数組織でテスト）
3. ⏭️ 問題があれば、P0→P1→P2の順で修正

