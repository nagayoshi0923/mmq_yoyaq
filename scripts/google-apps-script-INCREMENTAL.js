// Google Apps Script: シフト差分同期用スクリプト
// スプレッドシートIDを設定
const SPREADSHEET_ID = '1BmEqfp9gDYk--nY34H2TQHCr6g1YOEVkveP67fGI5S8';

/**
 * Webフックとして公開されるエントリーポイント
 * Supabase Edge Functionから呼び出される
 */
function doPost(e) {
  try {
    // eがundefinedまたはnullの場合（手動実行など）
    if (!e || !e.postData) {
      console.log('リクエストデータなし（手動実行の可能性）');
      return ContentService
        .createTextOutput(JSON.stringify({ 
          success: false, 
          error: 'リクエストデータがありません',
          hint: 'このスクリプトはSupabase Edge Functionから呼び出されることを想定しています'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    console.log('=== リクエスト開始 ===');
    console.log('リクエスト全体:', JSON.stringify(e, null, 2));
    
    // リクエストボディをパース
    const requestBody = JSON.parse(e.postData.contents);
    console.log('パースしたリクエスト:', JSON.stringify(requestBody, null, 2));
    
    const { year, month, shifts } = requestBody;
    console.log('データを受信:', { year, month, shiftsCount: shifts?.length });
    
    // データがない場合はエラーを返す
    if (!shifts || shifts.length === 0) {
      console.error('シフトデータがありません');
      return ContentService
        .createTextOutput(JSON.stringify({ 
          success: false, 
          error: 'シフトデータがありません',
          receivedData: requestBody
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // データを処理（差分更新）
    const result = updateShiftsIncremental(month, year, shifts);
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
    console.error('=== エラー発生 ===');
    console.error('エラー:', error);
    console.error('スタック:', error.stack);
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
 * シフトデータを差分更新
 */
function updateShiftsIncremental(month, year, shifts) {
  console.log('シフト差分更新開始:', { month, year, shiftsCount: shifts?.length });
  
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
    setupSheet(sheet, year, month);
  } else {
    console.log('既存のタブを使用:', sheetName);
  }
  
  // 差分更新を実行
  console.log('差分更新開始');
  const result = applyIncrementalUpdate(sheet, shifts, month);
  console.log('差分更新完了:', result);
  
  return {
    sheetName,
    added: result.added,
    removed: result.removed,
    unchanged: result.unchanged
  };
}

/**
 * シートの初期設定
 */
function setupSheet(sheet, year, month) {
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
  
  // その月の全日付を初期化
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateData = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dateData.push([`${month}/${day}`, '', '', '']);
  }
  
  if (dateData.length > 0) {
    sheet.getRange(2, 1, dateData.length, 4).setValues(dateData);
  }
  
  console.log('シート初期設定完了');
}

/**
 * 差分更新を適用
 */
function applyIncrementalUpdate(sheet, shifts, month) {
  console.log('差分更新処理開始');
  
  // 既存データを読み込み
  const lastRow = sheet.getLastRow();
  let existingData = {};
  
  if (lastRow > 1) {
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 4);
    const values = dataRange.getValues();
    
    values.forEach((row, index) => {
      const dateStr = row[0]; // 例: "11/1"
      const day = parseInt(dateStr.split('/')[1]);
      existingData[day] = {
        rowIndex: index + 2, // シート上の行番号（1始まり、ヘッダー考慮）
        morning: row[1] ? row[1].split('、') : [],
        afternoon: row[2] ? row[2].split('、') : [],
        evening: row[3] ? row[3].split('、') : []
      };
    });
  }
  
  console.log('既存データ読み込み完了:', Object.keys(existingData).length, '日');
  
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;
  
  // 各シフトデータを処理
  shifts.forEach(shift => {
    const date = shift.date;
    const day = parseInt(date.split('-')[2]);
    const staffName = shift.staff_name;
    
    console.log(`処理中: ${day}日 - ${staffName}`);
    
    // その日のデータがまだない場合は初期化
    if (!existingData[day]) {
      console.log(`  ${day}日のデータを新規作成`);
      
      // 新しい行を追加
      const newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 1).setValue(`${month}/${day}`);
      
      existingData[day] = {
        rowIndex: newRow,
        morning: [],
        afternoon: [],
        evening: []
      };
    }
    
    const dayData = existingData[day];
    
    // 全ての時間帯（朝・昼・夜）を処理（追加・削除両方に対応）
    const allTimeSlots = ['morning', 'afternoon', 'evening'];
    
    // 各時間帯を更新
    allTimeSlots.forEach(slot => {
      const slotIndex = { morning: 2, afternoon: 3, evening: 4 }[slot];
      const currentStaff = dayData[slot];
      
      // スタッフ名が既に存在するかチェック
      const existingIndex = currentStaff.indexOf(staffName);
      
      // この時間帯が有効かどうかを判定（終日 or 個別チェック）
      const isSlotEnabled = shift.all_day || shift[slot];
      
      if (isSlotEnabled) {
        // 追加処理
        if (existingIndex === -1) {
          console.log(`  追加: ${day}日 ${slot} - ${staffName}`);
          currentStaff.push(staffName);
          addedCount++;
        } else {
          console.log(`  変更なし: ${day}日 ${slot} - ${staffName} (既に存在)`);
          unchangedCount++;
        }
      } else {
        // 削除処理（時間帯がfalseの場合）
        if (existingIndex !== -1) {
          console.log(`  削除: ${day}日 ${slot} - ${staffName}`);
          currentStaff.splice(existingIndex, 1);
          removedCount++;
        }
      }
      
      // シートに書き込み
      const newValue = currentStaff.join('、');
      sheet.getRange(dayData.rowIndex, slotIndex).setValue(newValue);
    });
  });
  
  console.log('差分更新処理完了');
  
  return {
    added: addedCount,
    removed: removedCount,
    unchanged: unchangedCount
  };
}

