/**
 * PerformanceModal 共有定数（親モーダルと子コンポーネントで共用）。
 * 値は元 PerformanceModal.tsx から逐語移設（挙動不変）。
 */

// 30分間隔の時間オプションを生成
const generateTimeOptions = () => {
  const options = []
  for (let hour = 9; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      options.push(timeString)
    }
  }
  return options
}

export const timeOptions = generateTimeOptions()

// 公演カテゴリ別のトーン（bg=ダイアログ背景, section=内側カード/フッター/タブ, border=枠線）
// イベント枠の categoryConfig と同じ系統だが、内側に階調をつけるため 3 段階で持つ
export const CATEGORY_TONE: Record<string, { bg: string; section: string; border: string }> = {
  open:              { bg: '#eff6ff', section: '#dbeafe', border: '#bfdbfe' }, // blue-50/100/200
  private:           { bg: '#faf5ff', section: '#f3e8ff', border: '#e9d5ff' }, // purple
  gmtest:            { bg: '#fff7ed', section: '#ffedd5', border: '#fed7aa' }, // orange
  testplay:          { bg: '#fefce8', section: '#fef9c3', border: '#fef08a' }, // yellow
  offsite:           { bg: '#f0fdf4', section: '#dcfce7', border: '#bbf7d0' }, // green
  venue_rental:      { bg: '#ecfeff', section: '#cffafe', border: '#a5f3fc' }, // cyan
  venue_rental_free: { bg: '#f0fdfa', section: '#ccfbf1', border: '#99f6e4' }, // teal
  package:           { bg: '#fdf2f8', section: '#fce7f3', border: '#fbcfe8' }, // pink
  mtg:               { bg: '#ecfeff', section: '#cffafe', border: '#a5f3fc' }, // cyan
  memo:              { bg: '#f9fafb', section: '#f3f4f6', border: '#e5e7eb' }, // gray
}
