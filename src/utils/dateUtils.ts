const TZ = 'Asia/Tokyo';

// YYYY-MM のような指定からJSTの月範囲を返す
export function getMonthRangeJST(year: number, month1to12: number) {
  // JSのmonthは0始まりなので-1
  const startLocal = new Date(year, month1to12 - 1, 1, 0, 0, 0, 0);
  // 次月の0日=当月末日
  const endLocal = new Date(year, month1to12, 0, 23, 59, 59, 999);

  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const startStr = fmt.format(startLocal); // 例: "2025-09-01"
  const endStr = fmt.format(endLocal);   // 例: "2025-09-30"

  return {
    start: startLocal, // Date（ローカル=JST）
    end: endLocal,     // Date（ローカル=JST）
    startDateStr: startStr, // "YYYY-MM-DD"（JSTでの表記）
    endDateStr: endStr,
  };
}

// 現在のJST日時を取得
export function getCurrentJST() {
  const now = new Date();
  const jstOffset = 9 * 60; // JSTはUTC+9
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (jstOffset * 60000));
}

// 日付をJST文字列に変換
export function formatDateJST(date: Date): string {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

// 期間の日数を計算
export function getDaysDiff(startDate: Date, endDate: Date): number {
  return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

// 今月の範囲を取得
export function getThisMonthRangeJST() {
  const now = getCurrentJST();
  return getMonthRangeJST(now.getFullYear(), now.getMonth() + 1);
}

// 先月の範囲を取得
export function getLastMonthRangeJST() {
  const now = getCurrentJST();
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return getMonthRangeJST(lastYear, lastMonth);
}

// 今週の範囲を取得（月曜日〜日曜日）
export function getThisWeekRangeJST() {
  const now = getCurrentJST();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 日曜日は-6、月曜日は0
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return {
    start: monday,
    end: sunday,
    startDateStr: formatDateJST(monday),
    endDateStr: formatDateJST(sunday),
  };
}

// 先週の範囲を取得
export function getLastWeekRangeJST() {
  const thisWeek = getThisWeekRangeJST();
  const lastWeekStart = new Date(thisWeek.start);
  lastWeekStart.setDate(thisWeek.start.getDate() - 7);
  
  const lastWeekEnd = new Date(thisWeek.end);
  lastWeekEnd.setDate(thisWeek.end.getDate() - 7);
  
  return {
    start: lastWeekStart,
    end: lastWeekEnd,
    startDateStr: formatDateJST(lastWeekStart),
    endDateStr: formatDateJST(lastWeekEnd),
  };
}

// 過去N日間の範囲を取得
export function getPastDaysRangeJST(days: number) {
  const now = getCurrentJST();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  
  const start = new Date(now);
  start.setDate(now.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  
  return {
    start,
    end,
    startDateStr: formatDateJST(start),
    endDateStr: formatDateJST(end),
  };
}

// 今年の範囲を取得
export function getThisYearRangeJST() {
  const now = getCurrentJST();
  const year = now.getFullYear();
  return getMonthRangeJST(year, 1); // 1月1日
}

// 昨年の範囲を取得
export function getLastYearRangeJST() {
  const now = getCurrentJST();
  const year = now.getFullYear() - 1;
  return getMonthRangeJST(year, 1); // 1月1日
}
