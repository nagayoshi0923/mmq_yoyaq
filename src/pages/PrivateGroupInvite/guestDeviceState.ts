/**
 * ゲストがこの端末で入力・保持している情報（公開前検証 P2）。
 * 「この端末から退出」やグループから抜けたときに、名前・メール・回答・PIN 入力をまとめて空に戻し、
 * 端末の保存（localStorage / sessionStorage）からも名前・メール・本人確認の印を消す。
 * 「参加した印」（名前もメールも含まない）は、次に開いたとき「PIN で入る」を大きく出すために残す（点検 53・57）。
 */
import { useCallback, useState } from 'react'
import type { DateResponse } from '@/types'
import { clearPrivateGroupGuestToken, guestStorage } from '@/lib/privateGroupGuestSession'
import { clearNextGroupSource, loadNextGroupSource } from '@/lib/nextPrivateGroup'

export type GuestResponseValue = DateResponse | null

/** ゲストの参加情報（名前・メール・memberId）の保存キー */
export const guestSessionStorageKey = (inviteCode: string) => `guest_session_${inviteCode}`

/**
 * 端末に残るゲスト情報を消す: 参加情報（名前・メール）、本人確認の印（トークン）、
 * このグループを元にした「同じメンバーで次の貸切」の記憶（memberId を含む）。
 */
export function clearGuestDeviceStorage(inviteCode: string | null | undefined, groupId: string | null | undefined) {
  if (inviteCode) guestStorage.removeItem(guestSessionStorageKey(inviteCode))
  if (groupId) {
    clearPrivateGroupGuestToken(groupId)
    if (loadNextGroupSource()?.groupId === groupId) clearNextGroupSource()
  }
}

/** ゲスト由来の画面の state。reset() で全部初期値に戻す */
export function useGuestDeviceState() {
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [responses, setResponses] = useState<Record<string, GuestResponseValue>>({})
  const [pinEmail, setPinEmail] = useState('')
  const [pinCode, setPinCode] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [generatedPin, setGeneratedPin] = useState<string | null>(null)
  const [joinedAsNewMember, setJoinedAsNewMember] = useState(false)

  const reset = useCallback(() => {
    setGuestName('')
    setGuestEmail('')
    setGuestPhone('')
    setResponses({})
    setPinEmail('')
    setPinCode('')
    setPinError(null)
    setGeneratedPin(null)
    setJoinedAsNewMember(false)
  }, [])

  return {
    guestName, setGuestName,
    guestEmail, setGuestEmail,
    guestPhone, setGuestPhone,
    responses, setResponses,
    pinEmail, setPinEmail,
    pinCode, setPinCode,
    pinError, setPinError,
    generatedPin, setGeneratedPin,
    joinedAsNewMember, setJoinedAsNewMember,
    reset,
  }
}
