/**
 * ScenarioEditModal で使用する定数
 */

export const statusOptions = [
  { value: 'available', label: '利用可能' },
  { value: 'maintenance', label: 'メンテナンス中' },
  { value: 'retired', label: '引退済み' }
]

export const genreOptions = [
  'ホラー',
  'ミステリー',
  'クラシック',
  'コメディ',
  'SF',
  'ファンタジー',
  'サスペンス',
  'アクション',
  'ドラマ',
  'ロマンス'
].map(genre => ({ id: genre, name: genre }))

export const TIME_SLOTS = [
  '平日昼',
  '平日夜',
  '休日昼',
  '休日夜'
]

export const GM_ROLES = [
  'main',
  'sub'
]

