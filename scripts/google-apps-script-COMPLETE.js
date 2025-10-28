// Google Apps Script: シフト同期用スクリプト（完成版）
// スプレッドシートIDを設定
const SPREADSHEET_ID = '1BmEqfp9gDYk--nY34H2TQHCr6g1YOEVkveP67fGI5S8';

/**
 * Webフックとして公開されるエントリーポイント
 * Supabase Edge Functionから呼び出される
 */
function doPost(e) {
  try {
    console.log('リクエスト受信:', e.postData.contents);
    
    // リクエストボディをパース
    const requestBody = JSON.parse(e.postData.contents);
    
    const { month, year, shifts } = requestBody;
    
    console.log('データを受信:', { month, year, shiftsCount: shifts?.length });
    
    // データを処理
    const result = syncShiftsToSheet(month, year, shifts);
    
    console.log('処理完了:', result);
    
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
        error: error.message,
        stack: error.stack
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * シフトデータをスプレッドシートに同期
 */
function syncShiftsToSheet(month, year, shifts) {
  console.log('シフト同期開始:', { month, year, shiftsCount: shifts?.length });
  
  // シフトがない場合は早期リターン
  if (!shifts || shifts.length === 0) {
    console.log('シフトがありません');
    return { message: 'シフトがありません' };
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  console.log('スプレッドシートを開きました:', ss.getName());
  
  // タブ名を作成（例: 2025年11月）
  const sheetName = `${year}年${String(month).padStart(2, '0')}月`;
  console.log('タブ名:', sheetName);
  
  // タブを取得または作成
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.log('新しいタブを作成:', sheetName);
    sheet = ss.insertSheet(sheetName);
    setupSheet(sheet);
  } else {
    console.log('既存のタブを使用:', sheetName);
  }
  
  // データを変換
  console.log('データ変換開始');
  const transformedData = transformShifts(shifts, month);
  console.log('データ変換完了:', transformedData.length, '行');
  
  // シートに書き込み
  console.log('書き込み開始');
  writeToSheet(sheet, transformedData);
  console.log('書き込み完了');
  
  return {
    sheetName,
    rowsUpdated: transformedData.length
  };
}

/**
 * シートの初期設定
 */
function setupSheet(sheet) {
  console.log('シート初期設定開始');
  
  // ヘッダーを設定
  const headers = [['日付', '朝', '昼', '夜']];
  sheet.getRange(1, 1, 1, 4).setValues(headers);
  console.log('ヘッダーを設定しました');
  
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
  
  console.log('シート初期設定完了');
}

/**
 * シフトデータを変換
 */
function transformShifts(shifts, month) {
  console.log('シフト変換開始:', shifts.length);
  
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
  
  console.log('グループ化完了:', Object.keys(groupedByDate).length, '日');
  
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
  console.log('データ書き込み開始:', data.length);
  
  // 既存のデータをクリア（ヘッダー以外）
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    console.log('既存データを削除:', lastRow - 1, '行');
    sheet.deleteRows(2, lastRow - 1);
  }
  
  // データを書き込み
  if (data.length > 0) {
    console.log('データを書き込み:', data.length, '行');
    const range = sheet.getRange(2, 1, data.length, 4);
    range.setValues(data);
    
    // 条件付き書式を適用（空欄をグレーに）
    [2, 3, 4].forEach(col => {
      const range = sheet.getRange(2, col, data.length, 1);
      const rule = SpreadsheetApp.newConditionalFormatRule()
        .whenCellEmpty()
        .setBackground('#F5F5F5')
        .setRanges([range])
        .build();
      sheet.setConditionalFormatRules([rule]);
    });
    
    // 行の高さを設定
    sheet.setRowHeights(2, data.length, 25);
  }
  
  console.log('データ書き込み完了');
}

