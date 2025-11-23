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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1">
          <h1>{title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>
        {children && (
          <div className="flex gap-2 flex-shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

