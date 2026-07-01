import * as React from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** 外側 div（幅の調整はこちら。既定 max-w-md） */
  containerClassName?: string
}

/**
 * 検索ボックスの定型（虫眼鏡アイコン + Input）
 *
 * 規格: h-9 / pl-9 / bg-white / max-w-md（デザイン規約 5.1）。
 * ページ毎の「Search 絶対配置 + Input」コピペ（27箇所・12変種）の置き換え先。
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn('relative w-full max-w-md', containerClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input ref={ref} type="search" className={cn('h-9 bg-white pl-9 text-sm', className)} {...props} />
    </div>
  )
)
SearchInput.displayName = 'SearchInput'
