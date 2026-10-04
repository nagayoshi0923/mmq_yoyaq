/**
 * 貸切グループにゲストがメールアドレスと PIN で入る。index.tsx の handlePinAuth から中身を変えずに移したもの。
 * PIN やメールアドレスはログに残さない。
 */
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { savePrivateGroupGuestToken } from '@/lib/privateGroupGuestSession'
import type { DateResponse } from '@/types'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
type ResponseValue = DateResponse | null

export async function authenticateGroupGuestByPin({ group, pinEmail, pinCode, setPinError, setExistingMemberId, setGuestName, setGuestEmail, saveGuestSession, setResponses, closeSheetReplace }: {
  group: GroupType | null
  pinEmail: string
  pinCode: string
  setPinError: (message: string | null) => void
  setExistingMemberId: (id: string | null) => void
  setGuestName: (name: string) => void
  setGuestEmail: (email: string) => void
  saveGuestSession: (memberId: string, name: string, email: string) => void
  setResponses: (responses: Record<string, ResponseValue>) => void
  closeSheetReplace: () => void
}): Promise<void> {
  if (!group || !pinEmail || !pinCode) {
    setPinError('メールアドレスとPINを入力してください')
    return
  }

  setPinError(null)

  try {
    // RPCでPIN認証
    // PINやメールアドレスをログへ残さない。
    
    const { data: authResult, error: authError } = await privateGroupRpcApi.authenticateGuestByPin({
      p_group_id: group.id,
      p_email: pinEmail,
      p_pin: pinCode,
    })


    if (authError) {
      logger.error('PIN認証エラー:', authError)
      setPinError('認証に失敗しました')
      return
    }

    if (authResult?.[0]?.locked) {
      setPinError('PINの入力に繰り返し失敗したため、15分間お待ちいただいてから再度お試しください。')
      return
    }

    if (authResult?.[0]?.member_id) {
      const authMember = authResult[0]
      savePrivateGroupGuestToken(group.id, authMember.guest_token)
      setExistingMemberId(authMember.member_id)
      setGuestName(authMember.guest_name || '')
      setGuestEmail(authMember.guest_email || '')
      
      // セッションを保存（リロード後も維持）
      saveGuestSession(authMember.member_id, authMember.guest_name || '', authMember.guest_email || '')
      
      // メンバーのdate_responsesを取得
      const matchingMember = group.members?.find(m => m.id === authMember.member_id)
      if (matchingMember) {
        const existingResponses: Record<string, ResponseValue> = {}
        matchingMember.date_responses?.forEach(r => {
          existingResponses[r.candidate_date_id] = r.response
        })
        setResponses(existingResponses)
      }
      
      closeSheetReplace()
      toast.success('認証しました')
    } else {
      setPinError('メールアドレスまたはPINが正しくありません')
    }
  } catch (err) {
    logger.error('PIN認証エラー:', err)
    setPinError('認証に失敗しました')
  }
}
