/**
 * マスターとの相違を示すインジケーター
 * 
 * 🟢 マスターと同じ
 * 🟡 カスタマイズ済み（組織独自の値を設定）
 * 🔴 マスターが更新されている（マスターの方が新しい）
 */
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type DiffStatus = 'same' | 'customized' | 'master_updated'

interface MasterDiffIndicatorProps {
  status: DiffStatus
  masterValue?: any
  currentValue?: any
  fieldLabel?: string
  onSyncFromMaster?: () => void
  className?: string
}

export function MasterDiffIndicator({
  status,
  masterValue,
  currentValue,
  fieldLabel,
  onSyncFromMaster,
  className
}: MasterDiffIndicatorProps) {
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '(未設定)'
    if (typeof value === 'string') {
      return value.length > 30 ? value.substring(0, 30) + '...' : value
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : '(なし)'
    }
    return String(value)
  }

  const config = {
    same: {
      color: 'bg-green-500',
      label: 'マスターと同じ',
      textColor: 'text-green-600'
    },
    customized: {
      color: 'bg-yellow-500',
      label: 'カスタマイズ済み',
      textColor: 'text-yellow-600'
    },
    master_updated: {
      color: 'bg-red-500',
      label: 'マスターが更新されました',
      textColor: 'text-red-600'
    }
  }

  const cfg = config[status]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'w-2.5 h-2.5 rounded-full shrink-0 transition-transform hover:scale-125',
              cfg.color,
              onSyncFromMaster && status !== 'same' && 'cursor-pointer',
              className
            )}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (onSyncFromMaster && status !== 'same') {
                onSyncFromMaster()
              }
            }}
          />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <div className="space-y-1">
            <p className={cn('font-medium text-xs', cfg.textColor)}>{cfg.label}</p>
            {status !== 'same' && (
              <div className="text-xs space-y-0.5">
                {fieldLabel && <p className="text-muted-foreground">{fieldLabel}</p>}
                <p><span className="text-muted-foreground">マスター:</span> {formatValue(masterValue)}</p>
                <p><span className="text-muted-foreground">現在:</span> {formatValue(currentValue)}</p>
                {onSyncFromMaster && (
                  <p className="text-blue-600 mt-1">クリックで同期</p>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * フィールドラベルとインジケーターを組み合わせたラベル
 */
interface LabelWithDiffProps {
  label: string
  status?: DiffStatus
  masterValue?: any
  currentValue?: any
  onSyncFromMaster?: () => void
  required?: boolean
  className?: string
}

export function LabelWithDiff({
  label,
  status,
  masterValue,
  currentValue,
  onSyncFromMaster,
  required,
  className
}: LabelWithDiffProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {status && status !== 'same' && (
        <MasterDiffIndicator
          status={status}
          masterValue={masterValue}
          currentValue={currentValue}
          fieldLabel={label}
          onSyncFromMaster={onSyncFromMaster}
        />
      )}
    </div>
  )
}

