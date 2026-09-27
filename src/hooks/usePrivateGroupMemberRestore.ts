import { useEffect, useRef } from 'react'
import type { PrivateGroup, PrivateGroupMember } from '@/types'

/** 初回の本人確認でだけフォームへ復元する。他人の更新で編集中の入力を消さない。 */
export function usePrivateGroupMemberRestore(
  group: PrivateGroup | null,
  inviteCode: string | null | undefined,
  userId: string | undefined,
  memberId: string | null,
  restore: (member: PrivateGroupMember) => void,
) {
  const restored = useRef<string | null>(null)
  useEffect(() => { restored.current = null }, [inviteCode, userId])
  useEffect(() => {
    if (!group || group.invite_code !== inviteCode) return
    const member = group.members?.find(m => m.status === 'joined' && (userId ? m.user_id === userId : memberId && m.id === memberId))
    if (!member) return
    const key = `${group.id}:${member.id}`
    if (restored.current === key) return
    restored.current = key
    restore(member)
  }, [group, inviteCode, userId, memberId, restore])
}
