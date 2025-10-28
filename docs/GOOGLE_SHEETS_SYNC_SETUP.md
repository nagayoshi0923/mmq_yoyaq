# Googleスプレッドシートへのシフト自動同期

## 📋 概要

スタッフが提出したシフトを、Googleスプレッドシートに自動的に同期する機能です。

## 🎯 特徴

- ✅ **自動同期**: シフト提出と同時にスプレッドシートに反映
- ✅ **日付別整理**: 各日の出勤可能スタッフが一目でわかる
- ✅ **複数時間帯対応**: 朝・昼・夜・終日を自動変換
- ✅ **リアルタイム更新**: 最新のシフト状況を常に保持

## 📊 スプレッドシートの構成

```
A列: スタッフ名
B列以降: 日付（1日, 2日, 3日...）
セル内: 時間帯（朝/昼/夜/終日）
```

### 例

| スタッフ | 11/1 | 11/2 | 11/3 | 11/4 |
|---------|------|------|------|------|
| 田中GM | 朝・昼 | 終日 | - | 夜 |
| 山田GM | - | 朝・夜 | 終日 | 朝・昼・夜 |

## 🛠️ 実装方法

### 方法1: Google Apps Script（推奨）

#### メリット
- ✅ 実装が簡単
- ✅ 認証が不要（Webアプリとして公開）
- ✅ 無料で利用可能
- ✅ Google側で自動的にホスティング

#### デメリット
- ❌ 実行時間の制限あり（6分/リクエスト）
- ❌ 実行頻度の制限あり（1日1000回）

#### 手順

1. **スプレッドシートを作成**
   - 新しいGoogleスプレッドシートを作成
   - スプレッドシートIDを控える

2. **Google Apps Scriptを作成**
   - スプレッドシートの「拡張機能」→「Apps Script」
   - 以下のコードを貼り付け

```javascript
// Google Apps Scriptで実行される関数
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents)
    const spreadsheetId = 'YOUR_SPREADSHEET_ID'
    
    const ss = SpreadsheetApp.openById(spreadsheetId)
    const sheet = ss.getActiveSheet()
    
    // データを処理してスプレッドシートに書き込み
    // ...実装...
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

// Webアプリとして公開する関数
function initWebApp() {
  // Webアプリとして公開
  // 「公開」→「ウェブアプリとして導入」
}
```

3. **Supabase Edge Functionから呼び出し**
   - `supabase/functions/sync-shifts-to-google-sheet/index.ts` を作成
   - シフト提出時にこのFunctionを呼び出す

### 方法2: Google Sheets API（高度）

#### メリット
- ✅ 実行時間の制限なし
- ✅ 実行頻度の制限なし
- ✅ より柔軟な制御

#### デメリット
- ❌ 実装が複雑
- ❌ 認証設定が必要
- ❌ コストが発生する場合あり

## 📝 データの形式

### Supabaseから送信されるデータ

```json
{
  "staff_name": "田中GM",
  "month": 11,
  "year": 2025,
  "shifts": [
    {
      "date": "2025-11-01",
      "morning": true,
      "afternoon": true,
      "evening": false,
      "all_day": false
    },
    {
      "date": "2025-11-02",
      "morning": false,
      "afternoon": false,
      "evening": false,
      "all_day": true
    }
  ]
}
```

### スプレッドシートに記入される形式

| スタッフ | 11/1 | 11/2 |
|---------|------|------|
| 田中GM | 朝・昼 | 終日 |

## 🔄 同期のタイミング

1. **シフト提出時**: スタッフがシフトを提出した直後
2. **シフト更新時**: シフトを修正した時
3. **手動同期**: 必要に応じて手動で同期

## 📌 注意事項

- ⚠️ スプレッドシートの権限設定に注意
- ⚠️ 大量のデータ更新時のパフォーマンス
- ⚠️ Googleの実行制限に注意

## 🚀 今後の拡張

- ✅ 複数のスプレッドシートへの同期
- ✅ カレンダー形式での表示
- ✅ シフト希望の集計・分析
- ✅ 自動通知機能

