## 🚀 GMアサインメント クイックスタート

### 最速3ステップ！

#### ステップ1: テーブル拡張
```sql
-- database/redesign_gm_system_v3.sql をSupabaseで実行
```

#### ステップ2: UNIQUE制約追加（スタッフ用）
```sql
-- database/add_staff_name_unique.sql をSupabaseで実行
```

#### ステップ3: GMアサインメントをインポート（6パート）

```sql
-- database/import_all_gm_assignments.sql         （パート1）
-- database/import_all_gm_assignments_part2.sql   （パート2）
-- database/import_all_gm_assignments_part3.sql   （パート3）
-- database/import_all_gm_assignments_part4.sql   （パート4）
-- database/import_all_gm_assignments_part5.sql   （パート5）
-- database/import_all_gm_assignments_part6.sql   （パート6）
```

各パートを順番に実行してください。

### 確認

```sql
SELECT 
  COUNT(*) as 総アサイン数,
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(DISTINCT staff_id) as スタッフ数
FROM staff_scenario_assignments;
```

### 詳細

詳しい説明は `IMPORT_ALL_GM_ASSIGNMENTS_MASTER.md` を参照してください。

---

## 📊 登録されるデータ

- **100以上のシナリオ** × **25名のスタッフ**
- **数千件のGMアサインメント**
- **メインGM/サブGM/体験済みの詳細な習熟度管理**

---

## ⚠️ 注意事項

1. **必ず順番通りに実行してください**
2. **各パート実行後、エラーがないか確認してください**
3. **大量のデータなので、実行に時間がかかる場合があります**

---

## 🎯 完了後にできること

- シナリオごとのGM可能スタッフを検索
- スタッフごとのGM可能シナリオを検索
- GM配置の最適化
- スケジュール作成時のGM候補提案

