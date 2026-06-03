/**
 * 組織テーマのカラープリセット定義
 *
 * 各組織は theme_color (HEX) を保存するが、 自由なカラー設定だと
 * 「暗いボタンに暗い文字」 等で UI が崩れる事故が起きやすいため、
 * 事前に検証済みのプリセットから選択させる設計。
 *
 * 各プリセットは:
 *   primary       — ヘッダー帯、 主要ボタン背景 (HEX)
 *   primaryHover  — 主要ボタン hover 背景 (HEX)
 *   primaryLight  — primary の薄い版 (バッジ背景等、 HEX)
 *   onPrimary     — primary 上に乗せる文字色 ('white' | 'black')
 *   accent        — グラデーション/装飾用の「暗い同系色」 (HEX)
 *
 * 注意:
 *   - 警告/エラー表示は常に赤色固定 (テーマカラーに依存しない)
 *   - 貸切リクエスト系は紫色固定 (通常予約と区別)
 *   - accent は primary より暗い同系色 (主張せず装飾的に効かせる目的)
 */

export type ThemePreset = {
  key: string
  label: string
  primary: string
  primaryHover: string
  primaryLight: string
  onPrimary: 'white' | 'black'
  accent: string
}

export const THEME_PRESETS: ThemePreset[] = [
  // === スタンダード ===
  {
    key: 'mmq-red',
    label: 'MMQ レッド',
    primary: '#E60012',
    primaryHover: '#CC0010',
    primaryLight: '#FEE2E2',
    onPrimary: 'white',
    accent: '#7F0007',
  },
  {
    key: 'emerald',
    label: 'エメラルド',
    primary: '#10B981',
    primaryHover: '#0E9F73',
    primaryLight: '#D1FAE5',
    onPrimary: 'white',
    accent: '#064E3B',
  },
  {
    key: 'forest-green',
    label: 'フォレストグリーン',
    primary: '#15803D',
    primaryHover: '#166534',
    primaryLight: '#DCFCE7',
    onPrimary: 'white',
    accent: '#14532D',
  },
  {
    key: 'deep-green',
    label: '深緑 (ふかみどり)',
    primary: '#003437',
    primaryHover: '#002628',
    primaryLight: '#CCE0E2',
    onPrimary: 'white',
    accent: '#001A1D',
  },
  {
    key: 'ocean-blue',
    label: 'オーシャンブルー',
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    primaryLight: '#DBEAFE',
    onPrimary: 'white',
    accent: '#1E3A8A',
  },
  {
    key: 'royal-purple',
    label: 'ロイヤルパープル',
    primary: '#7C3AED',
    primaryHover: '#6D28D9',
    primaryLight: '#EDE9FE',
    onPrimary: 'white',
    accent: '#4C1D95',
  },
  {
    key: 'sunset-orange',
    label: 'サンセットオレンジ',
    primary: '#EA580C',
    primaryHover: '#C2410C',
    primaryLight: '#FFEDD5',
    onPrimary: 'white',
    accent: '#7C2D12',
  },
  {
    key: 'charcoal',
    label: 'チャコールブラック',
    primary: '#1F2937',
    primaryHover: '#111827',
    primaryLight: '#E5E7EB',
    onPrimary: 'white',
    accent: '#0F172A',
  },
  // === ビビッド ===
  {
    key: 'pink',
    label: 'ピンク',
    primary: '#EC4899',
    primaryHover: '#DB2777',
    primaryLight: '#FCE7F3',
    onPrimary: 'white',
    accent: '#831843',
  },
  {
    key: 'rose',
    label: 'ローズ',
    primary: '#F43F5E',
    primaryHover: '#E11D48',
    primaryLight: '#FFE4E6',
    onPrimary: 'white',
    accent: '#881337',
  },
  {
    key: 'amber',
    label: 'アンバー',
    primary: '#D97706',
    primaryHover: '#B45309',
    primaryLight: '#FEF3C7',
    onPrimary: 'white',
    accent: '#78350F',
  },
  {
    key: 'lime',
    label: 'ライム',
    primary: '#65A30D',
    primaryHover: '#4D7C0F',
    primaryLight: '#ECFCCB',
    onPrimary: 'white',
    accent: '#365314',
  },
  {
    key: 'teal',
    label: 'ティール',
    primary: '#0D9488',
    primaryHover: '#0F766E',
    primaryLight: '#CCFBF1',
    onPrimary: 'white',
    accent: '#134E4A',
  },
  {
    key: 'turquoise',
    label: 'ターコイズ',
    primary: '#06B6D4',
    primaryHover: '#0891B2',
    primaryLight: '#CFFAFE',
    onPrimary: 'white',
    accent: '#155E75',
  },
  {
    key: 'indigo',
    label: 'インディゴ',
    primary: '#4F46E5',
    primaryHover: '#4338CA',
    primaryLight: '#E0E7FF',
    onPrimary: 'white',
    accent: '#312E81',
  },
  {
    key: 'bordeaux',
    label: 'ボルドー',
    primary: '#9F1239',
    primaryHover: '#881337',
    primaryLight: '#FFE4E6',
    onPrimary: 'white',
    accent: '#4C0519',
  },
  // === 和テイスト ===
  {
    key: 'wa-momo',
    label: '桃 (もも)',
    primary: '#F8B4C4',
    primaryHover: '#F492A8',
    primaryLight: '#FCE7EE',
    onPrimary: 'black',
    accent: '#9D174D',
  },
  {
    key: 'wa-fuji',
    label: '藤 (ふじ)',
    primary: '#9F86C0',
    primaryHover: '#8B6BAA',
    primaryLight: '#E9E1F1',
    onPrimary: 'white',
    accent: '#5B21B6',
  },
  {
    key: 'wa-ai',
    label: '藍 (あい)',
    primary: '#1E3A8A',
    primaryHover: '#172E6B',
    primaryLight: '#DBEAFE',
    onPrimary: 'white',
    accent: '#172554',
  },
  {
    key: 'wa-asagi',
    label: '浅葱 (あさぎ)',
    primary: '#5A9DA8',
    primaryHover: '#477F8A',
    primaryLight: '#D4E9EC',
    onPrimary: 'white',
    accent: '#1F4E5A',
  },
  {
    key: 'wa-matcha',
    label: '抹茶 (まっちゃ)',
    primary: '#7A8B3F',
    primaryHover: '#606E32',
    primaryLight: '#E1E5C8',
    onPrimary: 'white',
    accent: '#3F4F1A',
  },
  {
    key: 'wa-yamabuki',
    label: '山吹 (やまぶき)',
    primary: '#EAB308',
    primaryHover: '#CA8A04',
    primaryLight: '#FEF9C3',
    onPrimary: 'black',
    accent: '#713F12',
  },
]

/** HEX (theme_color) からプリセットを引く。 一致しなければ null。 */
export function findPresetByPrimary(primaryHex: string | null | undefined): ThemePreset | null {
  if (!primaryHex) return null
  const normalized = primaryHex.trim().toLowerCase()
  return THEME_PRESETS.find((p) => p.primary.toLowerCase() === normalized) ?? null
}

/** デフォルト (MMQ レッド) */
export const DEFAULT_PRESET: ThemePreset = THEME_PRESETS[0]
