# 🚀 クイックスタート: Googleスプレッドシート同期

## 最短5分でセットアップ

### Step 1: Google Apps Scriptを設定（2分）

1. **スプレッドシートを開く**: https://docs.google.com/spreadsheets/d/1BmEqfp9gDYk--nY34H2TQHCr6g1YOEVkveP67fGI5S8/edit
2. **拡張機能** → **Apps Script** をクリック
3. **コードをコピペ**: `scripts/google-apps-script-example.js` の内容を貼り付け
4. 3行目を以下に変更:
   ```javascript
   const SPREADSHEET_ID = '1BmEqfp9gDYk--nY34H2TQHCr6g1YOEVkveP67fGI5S8';
   ```
5. **保存**ボタン（💾）をクリック
6. **デプロイ** → **新しいデプロイ** → **種類の選択** → **ウェブアプリ**
7. 設定:
   - **説明**: `シフト同期`
   - **次のユーザーとして実行**: `自分`
   - **アクセスできるユーザー**: `全員`
8. **デプロイ** をクリック
9. **承認が必要です** → **権限を確認** → **詳細** → **シフト同期（安全ではないページ）に移動** → **許可**
10. **Web アプリの URL をコピー**して保存

### Step 2: Supabase環境変数を設定（1分）

1. Supabase Dashboard: https://supabase.com/dashboard
2. プロジェクト → **Settings** → **Edge Functions** → **Secrets**
3. **New secret**:
   - Name: `GOOGLE_APPS_SCRIPT_URL`
   - Value: Step 1でコピーしたURL
4. **Save** をクリック

### Step 3: Edge Functionをデプロイ（1分）

```bash
npx supabase functions deploy sync-shifts-to-google-sheet
```

### Step 4: 動作確認（1分）

1. アプリでシフトを提出
2. スプレッドシートを確認
3. 「YYYY年MM月」タブにデータが反映されているか確認 ✅

## 🎉 完了！

これで自動同期が有効になりました！

## 📊 結果例

| 日付 | 朝 | 昼 | 夜 |
|------|-------|-------|---------|
| 11/1 | 田中太郎 | 山田花子 | 田中太郎、山田花子 |
| 11/2 | 田中太郎、山田花子 | 田中太郎、山田花子 | 山田花子 |

## 🔧 トラブルシューティング

### データが同期されない
1. Google Apps Scriptのログを確認: 実行 → 実行を調べる
2. Edge Functionのログを確認: Supabase Dashboard → Edge Functions → Logs

### エラー: "GOOGLE_APPS_SCRIPT_URL is not set"
- 環境変数が正しく設定されているか確認
- Edge Functionを再デプロイ

### エラー: "Web app not found"
- Google Apps Scriptのデプロイを確認
- URLが正しいか確認

