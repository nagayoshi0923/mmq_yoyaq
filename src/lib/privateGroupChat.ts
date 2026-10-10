/**
 * 貸切グループのチャット（段階 2: 返信・リアクション・既読・ピン留め・削除・写真）の読み書き。
 * 書き込みはすべて参加者本人を確かめる RPC（private_group_chat_action）。写真の保存先と表示用 URL は
 * /api/private-group-photos が同じ RPC で本人を確かめてから発行する（写真のバケットは非公開）。
 */
import { supabase } from '@/lib/supabase'
import { apiClient } from '@/lib/apiClient'
import { clearPrivateGroupGuestToken, getPrivateGroupGuestToken } from '@/lib/privateGroupGuestSession'

export const PRIVATE_GROUP_PHOTO_BUCKET = 'private-group-photos'

export type ChatAction = 'message' | 'read' | 'react' | 'pin' | 'remind_unanswered' | 'photo_message'

export async function privateGroupChatAction<T = unknown>(groupId: string, memberId: string, action: ChatAction, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc('private_group_chat_action', {
    p_group_id: groupId,
    p_member_id: memberId,
    p_action: action,
    p_payload: payload,
    p_guest_token: getPrivateGroupGuestToken(groupId),
  })
  if (error) {
    if (error.code === '42501' && /本人確認が必要|参加情報が見つかりません/.test(error.message)) {
      clearPrivateGroupGuestToken(groupId)
      window.dispatchEvent(new CustomEvent('private-group-auth-expired', { detail: { groupId } }))
    }
    throw error
  }
  return data as T
}

export interface ChatReactionRow {
  message_id: string
  emoji: string
  count: number
  mine: boolean
}

export interface ChatStateSnapshot {
  my_last_read_at: string | null
  /** 自分以外の参加者の「最後に読んだ時刻」（誰のものかは返らない） */
  read_times: string[]
  reactions: ChatReactionRow[]
}

export async function readPrivateGroupChatState(groupId: string, memberId: string): Promise<ChatStateSnapshot> {
  const { data, error } = await supabase.rpc('private_group_chat_state', {
    p_group_id: groupId, p_member_id: memberId, p_guest_token: getPrivateGroupGuestToken(groupId),
  })
  if (error) throw error
  const d = (data ?? {}) as Partial<ChatStateSnapshot>
  return { my_last_read_at: d.my_last_read_at ?? null, read_times: d.read_times ?? [], reactions: d.reactions ?? [] }
}

export interface GroupPhoto {
  messageId: string
  position: number
  url: string
  /** 小さい版（長辺 400px）。段階 4 より前の写真は null（元画像を縮めて出す） */
  thumbUrl: string | null
  createdAt: string
  memberId: string | null
  width: number | null
  height: number | null
}

type PhotoApiBody = { action: 'prepare'; count: number } | { action: 'urls'; messageIds?: string[] } | { action: 'delete'; messageId: string }

function photoApi<T>(groupId: string, memberId: string, body: PhotoApiBody): Promise<T> {
  return apiClient.post<T>('/api/private-group-photos', { ...body, groupId, memberId, guestToken: getPrivateGroupGuestToken(groupId) }, { allowAnon: true })
}

/** 表示用の写真 URL（1 時間有効）。messageIds を省くとグループの写真すべて（新しい順・500 枚まで） */
export async function fetchGroupPhotoUrls(groupId: string, memberId: string, messageIds?: string[]): Promise<{ photos: GroupPhoto[]; expiresIn: number }> {
  return photoApi(groupId, memberId, { action: 'urls', messageIds })
}

/** 発言を削除する（写真があれば実体も消える） */
export async function deleteGroupMessage(groupId: string, memberId: string, messageId: string): Promise<void> {
  await photoApi(groupId, memberId, { action: 'delete', messageId })
}

/** 縮小済みの写真（と小さい版）を上げてから、写真の発言として送る */
export async function sendGroupPhotos(args: {
  groupId: string
  memberId: string
  photos: Array<{ blob: Blob; width: number; height: number; thumb?: Blob | null }>
  caption?: string
  replyTo?: string | null
}): Promise<string> {
  const { groupId, memberId, photos } = args
  type Upload = { path: string; token: string }
  const prepared = await photoApi<{ messageId: string; uploads: Upload[]; thumbUploads?: Array<Upload | null> }>(groupId, memberId, { action: 'prepare', count: photos.length })
  const upload = (target: Upload, blob: Blob) => supabase.storage.from(PRIVATE_GROUP_PHOTO_BUCKET).uploadToSignedUrl(target.path, target.token, blob, { contentType: 'image/jpeg', upsert: false })
  await Promise.all(prepared.uploads.map(async (target, i) => {
    const { error } = await upload(target, photos[i].blob)
    if (error) throw error
    // 小さい版は失敗しても送る（一覧では元画像を縮めて出す）
    const thumbTarget = prepared.thumbUploads?.[i]
    const thumb = photos[i].thumb
    if (thumbTarget && thumb) await upload(thumbTarget, thumb).catch(() => undefined)
  }))
  await privateGroupChatAction(groupId, memberId, 'photo_message', {
    message_id: prepared.messageId,
    count: photos.length,
    message: args.caption ?? '',
    reply_to: args.replyTo ?? null,
    sizes: photos.map(p => ({ w: p.width, h: p.height })),
  })
  return prepared.messageId
}

export interface AlbumCover {
  groupId: string
  inviteCode: string
  reservationId: string | null
  scenarioMasterId: string | null
  /** 確定した公演日（YYYY-MM-DD）。確定していなければ null */
  performanceDate: string | null
  photoCount: number
  url: string
}

/** マイページのアルバム用: 参加しているグループごとの最新の写真 1 枚（会員だけ。URL は 1 時間有効） */
export async function fetchAlbumCovers(): Promise<AlbumCover[]> {
  const res = await apiClient.post<{ covers: AlbumCover[] }>('/api/private-group-photos', { action: 'covers' })
  return res.covers ?? []
}

// ─── 公演後（段階 4） ──────────────────────────────────

export interface GroupAfterInfo {
  performance: {
    date: string
    start_time: string | null
    end_time: string | null
    store_name: string | null
    participant_count: number | null
    ended: boolean
  } | null
  joined_count: number
  my_feedback: { rating: number; comment: string; updated_at: string } | null
  /** 店舗が外部のアンケートを設定していればその URL */
  post_survey_url: string | null
}

type AfterAction = 'read' | 'save_feedback' | 'announce_next_group'

async function afterAction<T>(groupId: string, memberId: string, action: AfterAction, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc('private_group_after_action', {
    p_group_id: groupId, p_member_id: memberId, p_action: action, p_payload: payload, p_guest_token: getPrivateGroupGuestToken(groupId),
  })
  if (error) throw error
  return data as T
}

export const readGroupAfter = (groupId: string, memberId: string) => afterAction<GroupAfterInfo>(groupId, memberId, 'read')

export const saveGroupFeedback = (groupId: string, memberId: string, rating: number, comment: string) =>
  afterAction<{ saved: boolean }>(groupId, memberId, 'save_feedback', { rating, comment })

/** 「同じメンバーで次の貸切」: 作った新しいグループの招待を、もとのグループのチャットに流す */
export const announceNextGroup = (groupId: string, memberId: string, newGroupId: string) =>
  afterAction<{ id: string; replayed: boolean }>(groupId, memberId, 'announce_next_group', { new_group_id: newGroupId })
