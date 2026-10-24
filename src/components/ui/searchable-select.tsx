import * as React from "react"
import { Check, ChevronsUpDown, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { flexibleMatch } from "@/utils/kanaUtils"

export interface SearchableSelectOption {
  value: string
  label: string
  displayInfo?: string | React.ReactNode
  displayInfoSearchText?: string  // displayInfoがReactNodeの場合の検索用テキスト
  renderContent?: () => React.ReactNode
  searchKeywords?: string[]  // 追加の検索キーワード（読み仮名など）
  group?: string  // 検索後も残る候補のグループ見出し（選択不可）
}

/**
 * 候補の色（親のカテゴリと同じ色相）。指定すると「小型の候補」になる:
 * 題名 12px・ほか 10px・行の上下 5px・角丸 4px、通常行 = bg、選択行 = selected（一段濃い）、灰色は使わない。
 * あわせて、候補の一覧を親ダイアログの中に描画し、候補の領域だけをスクロールさせる。
 */
export interface SearchableSelectTone {
  bg: string
  selected: string
  border: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  emptyText?: string
  onEmptyAction?: () => void
  emptyActionLabel?: string
  allowCustomValue?: boolean  // カスタム値を許可するかどうか
  allowClear?: boolean  // 選択解除を許可するかどうか
  headerContent?: React.ReactNode  // プルダウン上部に表示する固定コンテンツ（凡例など）
  tone?: SearchableSelectTone
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "選択してください",
  searchPlaceholder = "検索...",
  className = "",
  disabled = false,
  emptyText = "見つかりません",
  onEmptyAction,
  emptyActionLabel = "作成",
  allowCustomValue = false,
  allowClear = false,
  headerContent,
  tone,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listId = React.useId()
  const compact = !!tone

  // 小型のときは、開いたときの親ダイアログを描画先・はみ出しの境界にする（ダイアログが無ければ従来どおり body）
  // 開く操作と同じ更新で描画先を決める（開いた後に描画先を切り替えると、中身の作り直しが起きるため）
  const [dialogEl, setDialogEl] = React.useState<HTMLElement | null>(null)
  const handleOpenChange = (next: boolean) => {
    if (next && compact) setDialogEl(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null)
    setOpen(next)
  }

  const selectedOption = options.find((option) => option.value === value)

  // 検索フィルタリング（ひらがな・カタカナ・アルファベット対応）
  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options

    return options.filter(option => {
      // displayInfoがstringの場合はそれを使い、ReactNodeの場合はdisplayInfoSearchTextを使う
      const displayInfoText = typeof option.displayInfo === 'string'
        ? option.displayInfo
        : option.displayInfoSearchText

      const searchTargets = [
        option.label,
        displayInfoText,
        ...(option.searchKeywords || [])
      ].filter(Boolean) as string[]

      return flexibleMatch(searchTerm, searchTargets)
    })
  }, [options, searchTerm])

  const choose = (next: string) => {
    onValueChange(next)
    setOpen(false)
    setSearchTerm("")
  }

  // キーボード: 検索欄で ↓ → 先頭の候補へ、候補で ↑↓ 移動・Enter/Space で選択（Esc で閉じるのは Popover 側）
  const optionEls = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
  const focusOption = (index: number) => {
    const els = optionEls()
    if (!els.length) return
    els[Math.max(0, Math.min(index, els.length - 1))].focus()
  }
  const onOptionKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, optionValue: string) => {
    const els = optionEls()
    const i = els.indexOf(e.currentTarget)
    if (e.key === 'ArrowDown') { e.preventDefault(); focusOption(i + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) inputRef.current?.focus(); else focusOption(i - 1) }
    else if (e.key === 'Home') { e.preventDefault(); focusOption(0) }
    else if (e.key === 'End') { e.preventDefault(); focusOption(els.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(optionValue) }
  }

  const toneVars = tone ? ({ '--opt-bg': tone.bg, '--opt-selected': tone.selected, '--opt-border': tone.border } as React.CSSProperties) : undefined

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={true}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className={cn(
            "w-full justify-between font-normal text-xs",
            className
          )}
          disabled={disabled}
          style={{ backgroundColor: 'var(--input-bg)' }}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center ml-1 shrink-0">
            {allowClear && value && (
              <X
                className="h-3 w-3 opacity-50 hover:opacity-100 mr-1"
                onClick={(e) => {
                  e.stopPropagation()
                  onValueChange("")
                }}
              />
            )}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={compact ? dialogEl : undefined}
        collisionBoundary={compact && dialogEl ? dialogEl : undefined}
        collisionPadding={compact ? 8 : undefined}
        className={cn("p-0 z-[100] flex flex-col", compact && "overflow-hidden")}
        style={{
          width: 'var(--radix-popover-trigger-width)',
          // 小型: ダイアログの中で使える高さに収め、候補の領域だけスクロール
          maxHeight: compact ? 'min(500px, var(--radix-popover-content-available-height, 500px))' : '500px',
          ...(compact ? { backgroundColor: tone!.bg, borderColor: tone!.border } : {}),
          ...toneVars,
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => {
          e.stopPropagation()
        }}
      >
        <div className="p-2 border-b flex-shrink-0" style={compact ? { borderColor: tone!.border } : undefined}>
          <Input
            ref={inputRef}
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); focusOption(0) }
            }}
            aria-controls={listId}
            className={cn("h-8", compact && "text-xs")}
          />
        </div>
        {headerContent && (
          <div
            className={cn("px-2 py-1.5 border-b flex-shrink-0", !compact && "bg-muted/30")}
            style={compact ? { backgroundColor: tone!.selected, borderColor: tone!.border } : undefined}
          >
            {headerContent}
          </div>
        )}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="候補"
          className={cn("scrollable-list", compact && "flex-1 min-h-0")}
          style={compact ? {
            // 承認 Figma: 候補の領域は最大 300px でスクロール（狭いときはダイアログ内で使える高さまで縮む）
            maxHeight: '300px',
            minHeight: '72px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch'
          } : {
            maxHeight: '300px',
            minHeight: '100px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
          onWheel={(e) => {
            const element = e.currentTarget
            const atTop = element.scrollTop === 0
            const atBottom = element.scrollHeight - element.scrollTop === element.clientHeight

            if (!atTop && !atBottom) {
              e.stopPropagation()
            }
          }}
        >
          {filteredOptions.length === 0 ? (
            <div className="py-3 text-center">
              <p className="text-xs text-muted-foreground">{emptyText}</p>
              {allowCustomValue && searchTerm && (
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => choose(searchTerm)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    「{searchTerm}」で追加
                  </Button>
                </div>
              )}
            </div>
          ) : (
            filteredOptions.map((option, index) => {
              const selected = value === option.value
              return (
                <React.Fragment key={option.value}>
                  {option.group && option.group !== filteredOptions[index - 1]?.group && (
                    <div role="presentation" className={cn("font-semibold text-muted-foreground", compact ? "px-2 pb-0.5 ts-10" : "px-2 pt-2 pb-1 ts-caption")} style={compact ? { paddingTop: 5 } : undefined}>{option.group}</div>
                  )}
                  <div
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    className={cn(
                      "flex items-center cursor-pointer",
                      compact
                        ? "rounded-[4px] px-2 [@media(pointer:coarse)]:min-h-[40px] hover:shadow-[inset_0_0_0_1px_var(--opt-border)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--opt-border)]"
                        : "px-2 py-2 hover:bg-muted/50 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      !compact && selected && "bg-muted"
                    )}
                    style={compact ? { paddingTop: 5, paddingBottom: 5, backgroundColor: selected ? 'var(--opt-selected)' : 'var(--opt-bg)' } : undefined}
                    onClick={() => choose(option.value)}
                    onKeyDown={(e) => onOptionKeyDown(e, option.value)}
                  >
                    <Check
                      className={cn(
                        "flex-shrink-0",
                        compact ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4",
                        selected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.renderContent ? (
                      option.renderContent()
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className={cn("truncate", compact && "text-xs font-medium leading-tight")}>{option.label}</div>
                        {option.displayInfo && (
                          <div className={cn(
                            compact ? "ts-10 leading-tight text-muted-foreground mt-0.5" : "text-xs text-muted-foreground",
                            typeof option.displayInfo === 'string' && "truncate"
                          )}>
                            {option.displayInfo}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              )
            })
          )}
        </div>
        {/* 下部に固定表示するアクションボタン */}
        {onEmptyAction && emptyActionLabel && (
          <div
            className={cn("p-2 border-t flex-shrink-0", !compact && "bg-muted/30")}
            style={compact ? { backgroundColor: tone!.selected, borderColor: tone!.border } : undefined}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onEmptyAction()
                setOpen(false)
              }}
              className={cn("w-full", compact && "h-8 text-xs bg-white")}
            >
              <Plus className="h-4 w-4 mr-2" />
              {emptyActionLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
