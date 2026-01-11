import React, { Component, ErrorInfo, ReactNode } from 'react'
import { logger } from '@/utils/logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * グローバルエラーバウンダリ
 * 
 * Reactコンポーネントツリー内で発生したエラーをキャッチし、
 * アプリケーション全体がクラッシュするのを防ぎます。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    
    // エラーをログに記録
    logger.error('ErrorBoundary caught an error:', error)
    logger.error('Error info:', errorInfo)
    
    // 将来的にはエラー監視サービス（Sentry等）に送信
    // reportErrorToService(error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleGoHome = (): void => {
    window.location.href = '/'
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // カスタムフォールバックが提供されている場合はそれを表示
      if (this.props.fallback) {
        return this.props.fallback
      }

      // デフォルトのエラー画面
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="space-y-2">
              <div className="text-6xl">😵</div>
              <h1 className="text-2xl font-bold text-foreground">
                エラーが発生しました
              </h1>
              <p className="text-muted-foreground">
                予期しないエラーが発生しました。
                ご不便をおかけして申し訳ございません。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                ページを再読み込み
              </button>
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                トップページに戻る
              </button>
            </div>

            {/* 開発環境でのみエラー詳細を表示 */}
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-left">
                <p className="font-mono text-sm text-destructive break-all">
                  {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

