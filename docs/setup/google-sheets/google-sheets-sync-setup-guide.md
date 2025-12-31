# Googleスプレッドシート同期 セットアップガイド

## 📋 概要

スタッフが提出したシフトを、Googleスプレッドシートに自動的に同期する機能です。

## 🚀 セットアップ手順

### Step 1: スプレッドシートを作成

1. Googleスプレッドシートを新規作成
2. スプレッドシートのURLを控える
   - 例: `https://docs.google.com/spreadsheets/d/1BmEqfp9gDYk--nY34H2TQHCr6g1YOEVkveP67fGI5S8/edit`
   - スプレッドシートID: `1BmEqfp9gDYk--nY34H2TQHCr6g1YOEVkveP67fGI5S8`

### Step 2: Google Apps Scriptを設定

1. スプレッドシートを開く
2. **拡張機能** → **Apps Script** をクリック
3. 以下のコードを貼り付ける

```javascript
// スプレッドシートIDを設定
const SPREADSHEET_ID = '1BmEqfp9gDYk--nY34H2TQHCr6g1YOEVkveP67fGI5S8';

function doPost(e) {
  try {
    const requestBody = JSON.parse(e.postData.contents);
    const { month, year, shifts } = requestBody;
    
    const result = syncShiftsToSheet(month, year, shifts);
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function syncShiftsToSheet(month, year, shifts) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = `${year}年${month}月`;
  
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    setupSheet(sheet);
  }
  
  const transformedData = transformShifts(shifts);
  writeToSheet(sheet, transformedData);
  
  return { sheetName, rowsUpdated: transformedData.length };
}

function setupSheet(sheet) {
  const headers = [['日付', '朝', '昼', '夜']];
  sheet.getRange(1, 1, 1, 4).setValues(headers);
  
  const headerRange = sheet.getRange(1, 1, 1, 4);
  headerRange.setBackground('#6B7280');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 200);
  
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
}

function transformShifts(shifts) {
  const groupedByDate = {};
  
  shifts.forEach(shift => {
    const date = shift.date;
    const day = parseInt(date.split('-')[2]);
    
    if (!groupedByDate[day]) {
      groupedByDate[day] = { morning: [], afternoon: [], evening: [] };
    }
    
    if (shift.all_day) {
      groupedByDate[day].morning.push(shift.staff_name);
      groupedByDate[day].afternoon.push(shift.staff_name);
      groupedByDate[day].evening.push(shift.staff_name);
    } else {
      if (shift.morning) groupedByDate[day].morning.push(shift.staff_name);
      if (shift.afternoon) groupedByDate[day].afternoon.push(shift.staff_name);
      if (shift.evening) groupedByDate[day].evening.push(shift.staff_name);
    }
  });
  
  const data = [];
  Object.keys(groupedByDate).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
    const timeSlots = groupedByDate[day];
    data.push([
      `${month}/${day}`,
      timeSlots.morning.join('、'),
      timeSlots.afternoon.join('、'),
      timeSlots.evening.join('、')
    ]);
  });
  
  return data;
}

function writeToSheet(sheet, data) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  if (data.length > 0) {
    const range = sheet.getRange(2, 1, data.length, 4);
    range.setValues(data);
    
    [2, 3, 4].forEach(col => {
      const range = sheet.getRange(2, col, data.length, 1);
      const rule = SpreadsheetApp.newConditionalFormatRule()
        .whenCellEmpty()
        .setBackground('#F5F5F5')
        .setRanges([range])
        .build();
      sheet.setConditionalFormatRules([rule]);
    });
    
    sheet.setRowHeights(2, data.length, 25);
  }
}
```

4. **保存**ボタンをクリック
5. **デプロイ** → **新しいデプロイ** をクリック
6. **種類の選択** → **ウェブアプリ** を選択
7. 設定:
   - **説明**: シフト同期用
   - **次のユーザーとして実行**: 自分
   - **アクセスできるユーザー**: 全員
8. **デプロイ** をクリック
9. **WebアプリのURL**をコピーして保存
   - 例: `https://script.google.com/macros/s/.../exec`

### Step 3: 環境変数を設定

Supabaseダッシュボードで環境変数を設定:

1. Supabase Dashboard → **Settings** → **Edge Functions** → **Secrets**
2. 以下を追加:
   ```
   GOOGLE_APPS_SCRIPT_URL = https://script.google.com/macros/s/.../exec
   ```

### Step 4: Edge Functionをデプロイ

```bash
npx supabase functions deploy sync-shifts-to-google-sheet
```

### Step 5: 動作確認

1. アプリでシフトを提出
2. Googleスプレッドシートを確認
3. 「XXXX年XX月」タブにデータが反映されているか確認

## 📊 データ形式

### Supabaseから送信されるデータ

```json
{
  "year": 2025,
  "month": 11,
  "shifts": [
    {
      "staff_name": "田中太郎",
      "date": "2025-11-01",
      "morning": true,
      "afternoon": false,
      "evening": true,
      "all_day": false
    }
  ]
}
```

### スプレッドシート表示

| 日付 | 朝 | 昼 | 夜 |
|------|-------|-------|---------|
| 11/1 | 田中太郎 | 山田花子 | 田中太郎、山田花子 |

## 🔄 同期のタイミング

- **シフト提出時**: スタッフがシフトを提出した直後
- **シフト更新時**: シフトを修正した時

## 🛠️ トラブルシューティング

### エラー: "GOOGLE_APPS_SCRIPT_URL is not set"
- Supabaseの環境変数を確認
- Edge Functionに環境変数が反映されているか確認

### エラー: "Web app not found"
- Google Apps ScriptのデプロイURLを確認
- デプロイが正しく完了しているか確認

### データが同期されない
- Google Apps Scriptのログを確認（実行 → 実行を調べる）
- エラーメッセージを確認

## 📝 メモ

- スプレッドシートの共有設定で編集権限を制限可能
- 複数スタッフのシフトは自動的に統合される
- 終日シフトは朝・昼・夜すべてに表示される

