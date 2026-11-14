import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loginUrlWithIntent } from '@/lib/authReturn'
import { privateGroupCreatePath } from '@/pages/PrivateBookingStart/paths'

interface PrivateBookingEntryChoiceProps {
  scenarioMasterId: string
  scenarioTitle: string
  organizationSlug?: string
  /** グループ作成へ引き継ぐ希望店舗（貸切タブでいま選んでいる店舗） */
  preferredStoreIds: string[]
  isLoggedIn: boolean
}

/**
 * 貸切タブの一番上の入口（2026-11-14 段階1）。「日程が決まっている → 下で空いている日を選んで申し込む」と
 * 「まだ決まっていない → メンバーを招待して日程を相談」の 2 つに分けて出す（以前は同じグループ作成ボタンが 2 か所にあった）。
 */
export const PrivateBookingEntryChoice = memo(function PrivateBookingEntryChoice({
  scenarioMasterId,
  scenarioTitle,
  organizationSlug,
  preferredStoreIds,
  isLoggedIn,
}: PrivateBookingEntryChoiceProps) {
  const navigate = useNavigate()
  const createGroup = () => {
    const groupCreateUrl = privateGroupCreatePath({ scenarioMasterId, organizationSlug, storeIds: preferredStoreIds, noDates: true })
    if (!isLoggedIn) {
      navigate(loginUrlWithIntent('login', groupCreateUrl, `「${scenarioTitle}」の貸切グループ作成`))
      return
    }
    navigate(groupCreateUrl)
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="private-booking-entry-choice">
      <div className="rounded-lg border border-purple-300 bg-white p-3">
        <p className="flex items-center gap-1.5 ts-body font-medium text-purple-800">
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          日程が決まっている
        </p>
        <p className="ts-caption mt-1">
          このまま下で空いている日を選び、貸切リクエストを送ります{isLoggedIn ? '' : '（送るときにログインします）'}。
        </p>
      </div>
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
        <p className="flex items-center gap-1.5 ts-body font-medium text-purple-800">
          <Users className="h-4 w-4" aria-hidden="true" />
          まだ決まっていない
        </p>
        <p className="ts-caption mt-1">メンバーを招待して、日程をグループで相談できます。</p>
        <Button variant="outline" className="mt-2 w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-100" onClick={createGroup}>
          まずはメンバーを招待して貸切グループを作成
        </Button>
      </div>
    </div>
  )
})
