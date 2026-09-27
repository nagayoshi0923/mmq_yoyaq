import { usePrivateGroupSnapshot } from './usePrivateGroupSnapshot'
export function usePrivateGroupByInviteCode(inviteCode: string | null, memberId: string | null = null) {
  return usePrivateGroupSnapshot(null,inviteCode,memberId)
}
