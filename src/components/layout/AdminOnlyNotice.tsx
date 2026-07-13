import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

interface AdminOnlyNoticeProps {
  /** サイドバーのハイライト等に使う現在ページ識別子 */
  currentPage: string
}

/**
 * 管理者（admin / license_admin）専用ページに非管理者（staff 等）がアクセスした際の拒否表示。
 * サイドバー等のシェルは維持しつつ、コンテンツを管理者限定メッセージに置き換える。
 * ページ本体をマウントしないため、配下のデータ取得フックも実行されない。
 */
export function AdminOnlyNotice({ currentPage }: AdminOnlyNoticeProps) {
  return (
    <AppLayout
      currentPage={currentPage}
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <Card className="border-red-200 bg-red-50 shadow-none">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-red-800">
            <AlertCircle className="w-6 h-6" />
            <p>この機能は管理者のみ利用可能です。</p>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  )
}
