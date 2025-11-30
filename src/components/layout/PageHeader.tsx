import { ReactNode } from 'react'

interface PageHeaderProps {
  /**
   * ページタイトル（h1に表示）
   * 文字列またはReactNode（更新中インジケーターなど）
   */
  title: ReactNode
  /**
   * ページの説明文
   */
  description: string
  /**
   * ヘッダー右側に配置する要素（ボタンなど）
   */
  children?: ReactNode
  /**
   * カスタムクラス名
   */
  className?: string
}

/**
 * 統一されたページヘッダーコンポーネント
 * 
 * 全ページで共通のヘッダーデザインを提供します。
 * 
 * @example
 * ```tsx
 * <PageHeader
 *   title="シナリオ管理"
 *   description="全100本のシナリオを管理"
 * >
 *   <Button>新規追加</Button>
 * </PageHeader>
 * ```
 */
export function PageHeader({
  title,
  description,
  children,
  className = ''
}: PageHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight break-words flex items-center gap-2">{title}</h1>
          <p className="text-xs text-muted-foreground mt-1.5 break-words leading-normal">
            {description}
          </p>
        </div>
        {children && (
          <div className="flex gap-2 flex-shrink-0 items-start">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
