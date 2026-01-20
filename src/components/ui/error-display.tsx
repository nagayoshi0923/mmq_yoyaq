/**
 * APIエラー表示コンポーネント
 * 
 * ネットワークエラーやAPIエラー時に、ユーザーフレンドリーなメッセージと
 * リトライボタンを表示する
 */
import { AlertCircle, RefreshCw, WifiOff, ShieldAlert, FileQuestion, ServerCrash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ApiErrorType } from '@/lib/apiErrorHandler'

interface ErrorDisplayProps {
  /** エラータイプ（ApiErrorType） */
  type?: ApiErrorType
  /** 表示するメッセージ（省略時はtypeに応じたデフォルトメッセージ） */
  message?: string
  /** リトライボタンクリック時のコールバック */
  onRetry?: () => void
  /** リトライ中かどうか */
  isRetrying?: boolean
  /** コンパクト表示 */
  compact?: boolean
  /** クラス名 */
  className?: string
}

/**
 * エラータイプに応じたアイコンを取得
 */
function getErrorIcon(type?: ApiErrorType) {
  switch (type) {
    case ApiErrorType.NETWORK:
      return WifiOff
    case ApiErrorType.UNAUTHORIZED:
    case ApiErrorType.FORBIDDEN:
      return ShieldAlert
    case ApiErrorType.NOT_FOUND:
      return FileQuestion
    case ApiErrorType.SERVER:
      return ServerCrash
    default:
      return AlertCircle
  }
}

/**
 * エラータイプに応じたデフォルトメッセージを取得
 */
function getDefaultMessage(type?: ApiErrorType): { title: string; description: string } {
  switch (type) {
    case ApiErrorType.NETWORK:
      return {
        title: 'ネットワークエラー',
        description: 'インターネット接続を確認してください'
      }
    case ApiErrorType.UNAUTHORIZED:
      return {
        title: 'ログインが必要です',
        description: '再度ログインしてください'
      }
    case ApiErrorType.FORBIDDEN:
      return {
        title: 'アクセス権限がありません',
        description: 'この操作を行う権限がありません'
      }
    case ApiErrorType.NOT_FOUND:
      return {
        title: 'データが見つかりません',
        description: '指定されたデータは存在しないか、削除されています'
      }
    case ApiErrorType.VALIDATION:
      return {
        title: '入力エラー',
        description: '入力内容を確認してください'
      }
    case ApiErrorType.CONFLICT:
      return {
        title: 'データの競合',
        description: '他のユーザーが同時に更新しました。ページを再読み込みしてください'
      }
    case ApiErrorType.SERVER:
      return {
        title: 'サーバーエラー',
        description: 'しばらくしてから再試行してください'
      }
    default:
      return {
        title: 'エラーが発生しました',
        description: '予期しないエラーが発生しました'
      }
  }
}

/**
 * APIエラー表示コンポーネント
 */
export function ErrorDisplay({
  type,
  message,
  onRetry,
  isRetrying = false,
  compact = false,
  className = ''
}: ErrorDisplayProps) {
  const Icon = getErrorIcon(type)
  const defaultMsg = getDefaultMessage(type)
  const displayMessage = message || defaultMsg.description

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg ${className}`}>
        <Icon className="h-5 w-5 text-destructive flex-shrink-0" />
        <span className="text-sm text-destructive flex-1">{displayMessage}</span>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="h-8 px-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    )
  }

  return (
    <Alert variant="destructive" className={className}>
      <Icon className="h-5 w-5" />
      <AlertTitle>{defaultMsg.title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p>{displayMessage}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-3"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? '読み込み中...' : '再試行'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * 全画面エラー表示（ページ読み込み失敗時など）
 */
export function FullPageError({
  type,
  message,
  onRetry,
  isRetrying = false
}: ErrorDisplayProps) {
  const Icon = getErrorIcon(type)
  const defaultMsg = getDefaultMessage(type)
  const displayMessage = message || defaultMsg.description

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Icon className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {defaultMsg.title}
          </h2>
          <p className="text-muted-foreground">
            {displayMessage}
          </p>
        </div>

        {onRetry && (
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="min-w-[140px]"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? '読み込み中...' : '再試行する'}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * インラインエラー表示（フォームフィールド横など）
 */
export function InlineError({
  message,
  className = ''
}: {
  message: string
  className?: string
}) {
  return (
    <p className={`text-sm text-destructive flex items-center gap-1 ${className}`}>
      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
      {message}
    </p>
  )
}

