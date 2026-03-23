const TZ = 'Asia/Tokyo';

/** en-US 曜日名 → getDay() 互換（0=日 … 6=土） */
const LONG_WEEKDAY_TO_NUM: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

const SHORT_WEEKDAY_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * YYYY-MM-DD を日本（Asia/Tokyo）の暦としての曜日で返す（0=日 … 6=土）。
 * `Date#getDay()` は端末のローカルTZに依存するため、営業日・公演枠判定にはこちらを使う。
 */
export function getDayOfWeekJST(dateStr: string): number {
  const instant = new Date(`${dateStr}T12:00:00+09:00`)
  const longWd = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: TZ,
  }).format(instant)
  const nLong = LONG_WEEKDAY_TO_NUM[longWd]
  if (nLong !== undefined) return nLong

  const shortWd = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: TZ,
  }).format(instant)
  const nShort = SHORT_WEEKDAY_TO_NUM[shortWd]
  if (nShort !== undefined) return nShort

  return instant.getUTCDay()
}

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
  start.setDate(now.getDate() - days + 1);
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
  
  const start = new Date(year, 0, 1, 0, 0, 0, 0); // 1月1日
  const end = new Date(year, 11, 31, 23, 59, 59, 999); // 12月31日
  
  return {
    start,
    end,
    startDateStr: formatDateJST(start),
    endDateStr: formatDateJST(end),
  };
}

// 昨年の範囲を取得
export function getLastYearRangeJST() {
  const now = getCurrentJST();
  const year = now.getFullYear() - 1;
  
  const start = new Date(year, 0, 1, 0, 0, 0, 0); // 1月1日
  const end = new Date(year, 11, 31, 23, 59, 59, 999); // 12月31日
  
  return {
    start,
    end,
    startDateStr: formatDateJST(start),
    endDateStr: formatDateJST(end),
  };
}
