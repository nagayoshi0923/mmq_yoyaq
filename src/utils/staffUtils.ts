/**
 * スタッフ判定ユーティリティ
 * 参加者がスタッフかどうかを判定する
 */

import type { Staff } from '@/types'

/**
 * 参加者がスタッフかどうかを判定
 * @param participantName - 参加者名
 * @param participantEmail - 参加者メール（任意）
 * @param staffList - スタッフリスト
 * @returns 一致したスタッフ、またはnull
 */
export function findMatchingStaff(
  participantName: string,
  participantEmail: string | null | undefined,
  staffList: Staff[]
): Staff | null {
  if (!participantName && !participantEmail) return null
  if (!staffList || staffList.length === 0) return null

  const normalizedName = participantName?.trim().toLowerCase()
  const normalizedEmail = participantEmail?.trim().toLowerCase()

  // 名前で完全一致
  const byName = staffList.find(s => {
    const staffName = s.name?.trim().toLowerCase()
    const staffDisplayName = s.display_name?.trim().toLowerCase()
    return staffName === normalizedName || staffDisplayName === normalizedName
  })
  if (byName) return byName

  // メールで一致
  if (normalizedEmail) {
    const byEmail = staffList.find(s => {
      const staffEmail = s.email?.trim().toLowerCase()
      return staffEmail === normalizedEmail
    })
    if (byEmail) return byEmail
  }

  return null
}

/**
 * 参加者がスタッフかどうかを判定（boolean版）
 */
export function isStaffParticipant(
  participantName: string,
  participantEmail: string | null | undefined,
  staffList: Staff[]
): boolean {
  return findMatchingStaff(participantName, participantEmail, staffList) !== null
}

/**
 * 参加者名のリストからスタッフを抽出
 */
export function extractStaffFromParticipants(
  participantNames: string[],
  staffList: Staff[]
): { staffNames: string[]; nonStaffNames: string[] } {
  const staffNames: string[] = []
  const nonStaffNames: string[] = []

  for (const name of participantNames) {
    if (findMatchingStaff(name, null, staffList)) {
      staffNames.push(name)
    } else {
      nonStaffNames.push(name)
    }
  }

  return { staffNames, nonStaffNames }
}

