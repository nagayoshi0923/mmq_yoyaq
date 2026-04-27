/**
 * ブロックレンダラー
 * DB に保存された ManualBlock を React コンポーネントとして描画する
 */
import {
  Info, AlertCircle, AlertTriangle, CheckCircle2,
  Heading2, AlignLeft, ListOrdered, CheckSquare,
  HelpCircle, Table, List, Columns2, MessageSquare,
  Minus,
} from 'lucide-react'
import type { ManualBlock, BlockType } from '@/types/manual'
import type {
  SectionHeaderContent, ParagraphContent, AlertContent,
  StepsContent, CheckListContent, FaqContent, TableContent,
  KeyValueContent, TwoColumnContent, ScriptBoxContent,
} from '@/types/manual'

// ---------------------------------------------------------------------------
// 共通部品
// ---------------------------------------------------------------------------
function SectionHeader({ title, iconName }: { title: string; iconName?: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Heading2 className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 各ブロック種別レンダラー
// ---------------------------------------------------------------------------

function RenderSectionHeader({ content }: { content: SectionHeaderContent }) {
  return <SectionHeader title={content.title} iconName={content.icon_name} />
}

function RenderParagraph({ content }: { content: ParagraphContent }) {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
      {content.text}
    </p>
  )
}

const ALERT_STYLES = {
  info:    { bg: 'bg-blue-50 border-blue-200 text-blue-800',   Icon: Info },
  warning: { bg: 'bg-amber-50 border-amber-200 text-amber-800', Icon: AlertTriangle },
  caution: { bg: 'bg-yellow-50 border-yellow-200 text-yellow-800', Icon: AlertCircle },
  success: { bg: 'bg-green-50 border-green-200 text-green-800',  Icon: CheckCircle2 },
}

function RenderAlert({ content }: { content: AlertContent }) {
  const style = ALERT_STYLES[content.type] ?? ALERT_STYLES.info
  const { Icon } = style
  return (
    <div className={`border rounded-md p-4 flex gap-2 text-sm ${style.bg}`}>
      <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div>
        {content.title && <p className="font-bold mb-1">{content.title}</p>}
        <p className="leading-relaxed whitespace-pre-wrap">{content.body}</p>
      </div>
    </div>
  )
}

function RenderSteps({ content }: { content: StepsContent }) {
  return (
    <div className="space-y-3">
      {content.items.map((item, i) => (
        <div key={i} className="bg-muted/30 rounded-lg p-4 flex gap-3">
          <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <div className="space-y-1 flex-1">
            <p className="font-medium text-sm">{item.title}</p>
            {item.description && (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {item.description}
              </p>
            )}
            {item.sub_note && (
              <div className="mt-2 bg-background rounded-md p-2 text-xs text-muted-foreground">
                {item.sub_note}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function RenderCheckList({ content }: { content: CheckListContent }) {
  return (
    <div className="space-y-2">
      {content.title && <p className="text-sm font-medium">{content.title}</p>}
      <ul className="space-y-1.5">
        {content.items.map((item, i) => (
          <li key={i} className="flex gap-2 items-start text-sm text-gray-700">
            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RenderFaq({ content }: { content: FaqContent }) {
  return (
    <div className="space-y-3">
      {content.items.map((item, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-2">
          <div className="flex gap-2 items-start">
            <HelpCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="font-medium text-sm">{item.question}</p>
          </div>
          <p className="text-sm text-muted-foreground pl-6 leading-relaxed whitespace-pre-wrap">
            {item.answer}
          </p>
        </div>
      ))}
    </div>
  )
}

function RenderTable({ content }: { content: TableContent }) {
  return (
    <div className="overflow-x-auto">
      {content.caption && (
        <p className="text-xs text-muted-foreground mb-1">{content.caption}</p>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50">
            {content.headers.map((h, i) => (
              <th key={i} className="border px-3 py-2 text-left font-semibold text-gray-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {content.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="border px-3 py-2 text-sm">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RenderKeyValue({ content }: { content: KeyValueContent }) {
  return (
    <div className="space-y-1">
      {content.title && <p className="text-sm font-medium mb-2">{content.title}</p>}
      <div className="border rounded-lg overflow-hidden">
        {content.rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[140px_1fr] gap-2 items-start px-4 py-2.5 border-b border-muted last:border-0 text-sm"
          >
            <span className="text-muted-foreground font-medium">{row.label}</span>
            <span className="leading-relaxed">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RenderTwoColumn({ content }: { content: TwoColumnContent }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {[content.left, content.right].map((col, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-2">
          <p className="font-semibold text-sm">{col.title}</p>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{col.body}</p>
        </div>
      ))}
    </div>
  )
}

function RenderScriptBox({ content }: { content: ScriptBoxContent }) {
  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 px-4 py-3 rounded-r-md text-sm text-blue-900">
      {content.label && (
        <span className="font-bold text-xs text-blue-600 block mb-1">{content.label}</span>
      )}
      <p className="leading-relaxed whitespace-pre-wrap">{content.text}</p>
    </div>
  )
}

function RenderDivider() {
  return <hr className="border-muted" />
}

// ---------------------------------------------------------------------------
// メインレンダラー
// ---------------------------------------------------------------------------
export function BlockRenderer({ block }: { block: ManualBlock }) {
  switch (block.block_type as BlockType) {
    case 'section_header':
      return <RenderSectionHeader content={block.content as SectionHeaderContent} />
    case 'paragraph':
      return <RenderParagraph content={block.content as ParagraphContent} />
    case 'alert':
      return <RenderAlert content={block.content as AlertContent} />
    case 'steps':
      return <RenderSteps content={block.content as StepsContent} />
    case 'check_list':
      return <RenderCheckList content={block.content as CheckListContent} />
    case 'faq':
      return <RenderFaq content={block.content as FaqContent} />
    case 'table':
      return <RenderTable content={block.content as TableContent} />
    case 'key_value':
      return <RenderKeyValue content={block.content as KeyValueContent} />
    case 'two_column':
      return <RenderTwoColumn content={block.content as TwoColumnContent} />
    case 'script_box':
      return <RenderScriptBox content={block.content as ScriptBoxContent} />
    case 'divider':
      return <RenderDivider />
    default:
      return (
        <div className="text-xs text-muted-foreground border rounded p-2">
          未知のブロック種別: {block.block_type}
        </div>
      )
  }
}

/** ブロックリストをまとめて描画 */
export function BlockListRenderer({ blocks }: { blocks: ManualBlock[] }) {
  return (
    <div className="space-y-6">
      {blocks.map(block => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  )
}
