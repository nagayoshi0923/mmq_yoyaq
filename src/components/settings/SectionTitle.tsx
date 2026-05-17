import type { LucideIcon } from 'lucide-react'

interface SectionTitleProps {
  icon: LucideIcon
  label: string
  description?: string
}

/**
 * 設定ページ共通のセクションヘッダー
 * マニュアルページと同じトンマナ（bg-primary/10 rounded-full アイコン）
 */
export function SectionTitle({ icon: Icon, label, description }: SectionTitleProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-base font-semibold">{label}</h3>
      </div>
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed mt-2 ml-11">{description}</p>
      )}
    </div>
  )
}
