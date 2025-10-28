// Google Apps Script: シフト同期用スクリプト
// スプレッドシートIDとスプレッドシート名を設定
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ここにスプレッドシートIDを入れる

/**
 * Webフックとして公開されるエントリーポイント
 * Supabase Edge Functionから呼び出される
 */
function doPost(e) {
  try {
    // リクエストボディをパース
    const requestBody = JSON.parse(e.postData.contents);
    
    const { month, year, shifts } = requestBody;
    
    // データを処理
    const result = syncShiftsToSheet(month, year, shifts);
    
    // 成功レスポンスを返す
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: true, 
        message: 'シフトを同期しました',
        result 
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('エラー:', error);
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        error: error.message 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * シフトデータをスプレッドシートに同期
 */
function syncShiftsToSheet(month, year, shifts) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // タブ名を作成（例: 2025年11月）
  const sheetName = `${year}年${month}月`;
  
  // タブを取得または作成
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    setupSheet(sheet);
  }
  
  // データを変換
  const transformedData = transformShifts(shifts);
  
  // シートに書き込み
  writeToSheet(sheet, transformedData);
  
  return {
    sheetName,
    rowsUpdated: transformedData.length
  };
}

/**
 * シートの初期設定
 */
function setupSheet(sheet) {
  // ヘッダーを設定
  const headers = [['日付', '朝', '昼', '夜']];
  sheet.getRange(1, 1, 1, 4).setValues(headers);
  
  // ヘッダーのスタイル
  const headerRange = sheet.getRange(1, 1, 1, 4);
  headerRange.setBackground('#6B7280');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  // 列幅を設定
  sheet.setColumnWidth(1, 80);  // 日付
  sheet.setColumnWidth(2, 200); // 朝
  sheet.setColumnWidth(3, 200); // 昼
  sheet.setColumnWidth(4, 200); // 夜
  
  // ヘッダー行を固定
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
}

/**
 * シフトデータを変換
 */
function transformShifts(shifts) {
  // 日付ごとにグループ化
  const groupedByDate = {};
  
  shifts.forEach(shift => {
    const date = shift.date;
    const day = parseInt(date.split('-')[2]);
    
    if (!groupedByDate[day]) {
      groupedByDate[day] = {
        morning: [],
        afternoon: [],
        evening: []
      };
    }
    
    // 終日チェック
    if (shift.all_day) {
      groupedByDate[day].morning.push(shift.staff_name);
      groupedByDate[day].afternoon.push(shift.staff_name);
      groupedByDate[day].evening.push(shift.staff_name);
    } else {
      // 個別の時間帯チェック
      if (shift.morning) {
        groupedByDate[day].morning.push(shift.staff_name);
      }
      if (shift.afternoon) {
        groupedByDate[day].afternoon.push(shift.staff_name);
      }
      if (shift.evening) {
        groupedByDate[day].evening.push(shift.staff_name);
      }
    }
  });
  
  // データ配列に変換
  const data = [];
  Object.keys(groupedByDate).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
    const timeSlots = groupedByDate[day];
    const morningStr = timeSlots.morning.join('、');
    const afternoonStr = timeSlots.afternoon.join('、');
    const eveningStr = timeSlots.evening.join('、');
    
    data.push([`${month}/${day}`, morningStr, afternoonStr, eveningStr]);
  });
  
  return data;
}

/**
 * シートにデータを書き込み
 */
function writeToSheet(sheet, data) {
  // 既存のデータをクリア（ヘッダー以外）
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  // データを書き込み
  if (data.length > 0) {
    const range = sheet.getRange(2, 1, data.length, 4);
    range.setValues(data);
    
    // 条件付き書式を適用（空欄をグレーに）
    const morningRange = sheet.getRange(2, 2, data.length, 1);
    const afternoonRange = sheet.getRange(2, 3, data.length, 1);
    const eveningRange = sheet.getRange(2, 4, data.length, 1);
    
    [morningRange, afternoonRange, eveningRange].forEach(range => {
      const rule = SpreadsheetApp.newConditionalFormatRule()
        .whenCellEmpty()
        .setBackground('#F5F5F5')
        .setRanges([range])
        .build();
      
      sheet.setConditionalFormatRules([rule]);
    });
  }
  
  // 行の高さを設定
  if (data.length > 0) {
    sheet.setRowHeights(2, data.length, 25);
  }
}

/**
 * テスト用関数
 */
function testSync() {
  const testData = {
    month: 11,
    year: 2025,
    shifts: [
      {
        staff_name: "田中太郎",
        date: "2025-11-01",
        morning: true,
        afternoon: false,
        evening: true,
        all_day: false
      },
      {
        staff_name: "山田花子",
        date: "2025-11-01",
        morning: false,
        afternoon: true,
        evening: true,
        all_day: false
      }
    ]
  };
  
  const result = syncShiftsToSheet(testData.month, testData.year, testData.shifts);
  console.log('テスト結果:', result);
}

