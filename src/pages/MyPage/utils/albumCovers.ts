/**
 * マイページの「アルバム」と貸切グループの写真（グループページ刷新 段階 4）。
 * 体験済みの作品に、その公演のグループの最新の写真 1 枚を重ねて出し、押すとグループの思い出タブへ。
 */
import type { AlbumCover } from '@/lib/privateGroupChat'

/** アルバムの 1 件に対応するグループの写真。予約（主催者）は予約で、手動の履歴（メンバー）は作品と公演日で突き合わせる */
export function findAlbumCover(
  played: { reservation_id?: string; scenario_id?: string; date: string },
  covers: ReadonlyArray<AlbumCover>,
): AlbumCover | null {
  if (played.reservation_id) {
    const byReservation = covers.find(c => c.reservationId === played.reservation_id)
    if (byReservation) return byReservation
  }
  if (!played.scenario_id || !played.date) return null
  return covers.find(c => c.scenarioMasterId === played.scenario_id && c.performanceDate === played.date.slice(0, 10)) ?? null
}

export const memoriesHref = (cover: Pick<AlbumCover, 'inviteCode'>) => `/group/invite/${cover.inviteCode}?tab=memories`
