import React from 'react'
import { Loader2 } from 'lucide-react'

interface LoadingScreenProps {
  message?: string
}

/**
 * ページローディング用のスクリーン
 * React.lazy のフォールバックコンポーネントとして使用
 */
export function LoadingScreen({ message = '読み込み中...' }: LoadingScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

