import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Images } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'

export function AlbumPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // アルバムデータの取得処理は今後実装
    logger.log('🔍 アルバムページ表示:', user?.email)
  }, [user])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground text-sm">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <Images className="h-4 w-4 sm:h-5 sm:w-5" />
            アルバム
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground text-sm">
            アルバム機能は準備中です。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

