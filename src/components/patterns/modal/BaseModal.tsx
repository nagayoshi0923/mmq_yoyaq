import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react'
import { ReactNode, memo } from 'react'

type ModalVariant = 'default' | 'danger' | 'success' | 'warning' | 'info'

interface BaseModalProps {
  /**
   * モーダルの表示状態
   */
  open: boolean
  /**
   * モーダルを閉じる際のコールバック
   */
  onClose: () => void
  /**
   * モーダルのタイトル
   */
  title: string
  /**
   * モーダルの説明文
   */
  description?: string
  /**
   * モーダルの種類（色やアイコンが変わる）
   */
  variant?: ModalVariant
  /**
   * モーダルのコンテンツ
   */
  children?: ReactNode
  /**
   * フッターのアクションボタン
   */
  actions?: ReactNode
  /**
   * 最大幅
   */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /**
   * 背景クリックで閉じるか
   */
  closeOnClickOutside?: boolean
}

const variantConfig: Record<ModalVariant, { icon: typeof AlertCircle; iconColor: string; titleColor: string }> = {
  default: {
    icon: Info,
    iconColor: 'text-blue-600',
    titleColor: 'text-foreground'
  },
  danger: {
    icon: AlertCircle,
    iconColor: 'text-red-600',
    titleColor: 'text-red-800'
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-600',
    titleColor: 'text-green-800'
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    titleColor: 'text-yellow-800'
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800'
  }
}

const maxWidthClasses = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  full: 'sm:max-w-full'
}

/**
 * BaseModal - すべてのモーダルの基底コンポーネント
 * 
 * variantによって色やアイコンを切り替えられます。
 * 
 * @example
 * ```tsx
 * <BaseModal
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="確認"
 *   variant="warning"
 *   actions={
 *     <>
 *       <Button onClick={onCancel}>キャンセル</Button>
 *       <Button onClick={onConfirm} variant="destructive">削除</Button>
 *     </>
 *   }
 * >
 *   <p>本当に削除しますか？</p>
 * </BaseModal>
 * ```
 */
export const BaseModal = memo(function BaseModal({
  open,
  onClose,
  title,
  description,
  variant = 'default',
  children,
  actions,
  maxWidth = 'md',
  closeOnClickOutside = true
}: BaseModalProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <Dialog open={open} onOpenChange={closeOnClickOutside ? onClose : undefined}>
      <DialogContent className={maxWidthClasses[maxWidth]}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${config.titleColor}`}>
            <Icon className={`h-5 w-5 ${config.iconColor}`} />
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {children && (
          <div className="py-4">
            {children}
          </div>
        )}

        {actions && (
          <DialogFooter>
            {actions}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
})

