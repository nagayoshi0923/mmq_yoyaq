import { usePrivateGroupSnapshot } from './usePrivateGroupSnapshot'
export function usePrivateGroupData(groupId: string | null) {
  return usePrivateGroupSnapshot(groupId,null)
}
