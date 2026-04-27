// =============================================================================
// マニュアルページ・ブロック型定義
// =============================================================================

// ---------------------------------------------------------------------------
// ブロック種別と各コンテンツ型
// ---------------------------------------------------------------------------

/** セクション見出し */
export interface SectionHeaderContent {
  title: string
  icon_name?: string
}

/** 本文テキスト（改行対応） */
export interface ParagraphContent {
  text: string
}

/** アラートボックス */
export interface AlertContent {
  type: 'info' | 'warning' | 'caution' | 'success'
  title?: string
  body: string
}

/** 番号付き手順リスト */
export interface StepsContent {
  items: {
    title: string
    description?: string
    sub_note?: string
  }[]
}

/** チェックリスト */
export interface CheckListContent {
  title?: string
  items: string[]
}

/** FAQ（Q&A リスト） */
export interface FaqContent {
  items: {
    question: string
    answer: string
  }[]
}

/** テーブル */
export interface TableContent {
  caption?: string
  headers: string[]
  rows: string[][]
}

/** キーバリュー行 */
export interface KeyValueContent {
  title?: string
  rows: {
    label: string
    value: string
  }[]
}

/** 2カラムカード */
export interface TwoColumnContent {
  left: { title: string; body: string; icon_name?: string }
  right: { title: string; body: string; icon_name?: string }
}

/** 声がけ例ボックス */
export interface ScriptBoxContent {
  label?: string
  text: string
}

/** 区切り線 */
export type DividerContent = Record<string, never>

// ---------------------------------------------------------------------------
// ブロック種別→コンテンツ型のマップ
// ---------------------------------------------------------------------------
export interface BlockContentMap {
  section_header: SectionHeaderContent
  paragraph:      ParagraphContent
  alert:          AlertContent
  steps:          StepsContent
  check_list:     CheckListContent
  faq:            FaqContent
  table:          TableContent
  key_value:      KeyValueContent
  two_column:     TwoColumnContent
  script_box:     ScriptBoxContent
  divider:        DividerContent
}

export type BlockType = keyof BlockContentMap

// ---------------------------------------------------------------------------
// DB レコード型
// ---------------------------------------------------------------------------
export interface ManualBlock<T extends BlockType = BlockType> {
  id: string
  page_id: string
  block_type: T
  content: BlockContentMap[T]
  display_order: number
  created_at: string
  updated_at: string
}

export interface ManualPage {
  id: string
  organization_id: string
  title: string
  slug: string
  description: string | null
  category: 'staff' | 'admin'
  icon_name: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  page_content?: unknown
}

export interface ManualPageWithBlocks extends ManualPage {
  blocks: ManualBlock[]
}

// ---------------------------------------------------------------------------
// ブロック種別メタデータ（UI 表示用）
// ---------------------------------------------------------------------------
export interface BlockTypeMeta {
  type: BlockType
  label: string
  description: string
  icon: string  // lucide icon name
  defaultContent: BlockContentMap[BlockType]
}

export const BLOCK_TYPE_META: BlockTypeMeta[] = [
  {
    type: 'section_header',
    label: 'セクション見出し',
    description: 'アイコン付きの章タイトル',
    icon: 'Heading2',
    defaultContent: { title: '' } satisfies SectionHeaderContent,
  },
  {
    type: 'paragraph',
    label: '本文テキスト',
    description: '説明文・本文の段落',
    icon: 'AlignLeft',
    defaultContent: { text: '' } satisfies ParagraphContent,
  },
  {
    type: 'alert',
    label: 'アラートボックス',
    description: '注意・情報・警告のハイライトボックス',
    icon: 'AlertCircle',
    defaultContent: { type: 'info', body: '' } satisfies AlertContent,
  },
  {
    type: 'steps',
    label: '手順リスト',
    description: '番号付きの操作手順',
    icon: 'ListOrdered',
    defaultContent: { items: [{ title: '', description: '' }] } satisfies StepsContent,
  },
  {
    type: 'check_list',
    label: 'チェックリスト',
    description: 'チェックマーク付き箇条書き',
    icon: 'CheckSquare',
    defaultContent: { items: [''] } satisfies CheckListContent,
  },
  {
    type: 'faq',
    label: 'FAQ（よくある質問）',
    description: 'Q＆A 形式のリスト',
    icon: 'HelpCircle',
    defaultContent: { items: [{ question: '', answer: '' }] } satisfies FaqContent,
  },
  {
    type: 'table',
    label: 'テーブル',
    description: '行列形式の表',
    icon: 'Table',
    defaultContent: { headers: ['', ''], rows: [['', '']] } satisfies TableContent,
  },
  {
    type: 'key_value',
    label: 'キーバリュー一覧',
    description: 'ラベルと値のペア表示',
    icon: 'List',
    defaultContent: { rows: [{ label: '', value: '' }] } satisfies KeyValueContent,
  },
  {
    type: 'two_column',
    label: '2カラムカード',
    description: '左右2列のカードレイアウト',
    icon: 'Columns2',
    defaultContent: {
      left:  { title: '', body: '' },
      right: { title: '', body: '' },
    } satisfies TwoColumnContent,
  },
  {
    type: 'script_box',
    label: '声がけ例',
    description: '青いボーダー付きのスクリプトボックス',
    icon: 'MessageSquare',
    defaultContent: { label: '声がけ例', text: '' } satisfies ScriptBoxContent,
  },
  {
    type: 'divider',
    label: '区切り線',
    description: 'セクション間の水平線',
    icon: 'Minus',
    defaultContent: {} satisfies DividerContent,
  },
]
