/**
 * 貸切グループのチャットの写真（グループページ刷新 段階 2）。
 *
 * 写真は非公開バケット private-group-photos に置き、ブラウザからは直接読めない（Storage のポリシーを作っていない）。
 * この API は、呼び出した人の資格（会員はログインの JWT、ゲストは PIN で発行した印）のまま
 * RPC private_group_chat_action を呼んで「このグループに参加中の本人」であることを DB に確かめさせ、
 * DB が返した場所に対してだけ service_role で次を行う:
 *   - prepare: 署名付きのアップロード先（{organization_id}/{group_id}/{message_id}/{n}.jpg と小さい版 {n}_thumb.jpg）を発行
 *   - urls:    期限付き（1 時間）の署名付き URL を発行（小さい版があればその URL も）
 *   - delete:  本人の発言を削除し、写真の実体（小さい版も）を Storage から消す
 *   - covers:  マイページのアルバム用に、ログイン中の会員が参加しているグループごとの最新の 1 枚（段階 4。RPC private_group_album_covers）
 * スタッフ・招待リンクを開いただけの人は RPC で弾かれる。組織の範囲は DB が返す場所（organization_id から始まる）で決まる。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { db, getMissingEnvError } from './_lib/db.js'

const BUCKET = 'private-group-photos'
const URL_TTL_SECONDS = 60 * 60
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

/** 呼び出した人の資格のままの Supabase（ログインなら JWT、ゲストは anon。auth.uid() と PIN の印を RPC が確かめる） */
function callerClient(req: VercelRequest): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY が設定されていません')
  const auth = req.headers.authorization
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(typeof auth === 'string' && auth.startsWith('Bearer ') ? { global: { headers: { Authorization: auth } } } : {}),
  })
}

interface Body {
  action?: string
  groupId?: string
  memberId?: string
  guestToken?: string | null
  count?: number
  messageIds?: string[]
  messageId?: string
}

const isUuid = (v: unknown): v is string => typeof v === 'string' && new RegExp(`^${UUID}$`, 'i').test(v)

/** DB が返した場所がこのグループの写真（または小さい版 _thumb）の場所か（念のため形を確かめる） */
function isGroupPhotoPath(path: unknown, groupId: string): path is string {
  return typeof path === 'string' && new RegExp(`^${UUID}/${groupId}/${UUID}/([1-9]|10)(_thumb)?\\.jpg$`, 'i').test(path)
}

/** マイページのアルバム用: 参加しているグループごとの最新の 1 枚（小さい版があればそれ）。会員のログインが要る */
async function albumCovers(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'ログインしてください' })
  try {
    const { data, error } = await callerClient(req).rpc('private_group_album_covers')
    if (error) return res.status(error.code === '42501' ? 403 : 500).json({ error: error.message })
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
    const picked = rows.flatMap(r => {
      const groupId = r.group_id
      if (!isUuid(groupId)) return []
      const path = isGroupPhotoPath(r.thumb_path, groupId) ? r.thumb_path : isGroupPhotoPath(r.path, groupId) ? r.path : null
      return path ? [{ row: r, path }] : []
    })
    if (picked.length === 0) return res.status(200).json({ covers: [], expiresIn: URL_TTL_SECONDS })
    const { data: signed, error: signError } = await db!.storage.from(BUCKET).createSignedUrls(picked.map(p => p.path), URL_TTL_SECONDS)
    if (signError || !signed) return res.status(500).json({ error: '写真を読み込めませんでした' })
    const urlByPath = new Map(signed.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
    const covers = picked.flatMap(({ row, path }) => {
      const url = urlByPath.get(path)
      return url ? [{
        groupId: row.group_id, inviteCode: row.invite_code, reservationId: row.reservation_id ?? null, scenarioMasterId: row.scenario_master_id ?? null,
        performanceDate: row.performance_date ?? null, photoCount: row.photo_count ?? 1, url,
      }] : []
    })
    return res.status(200).json({ covers, expiresIn: URL_TTL_SECONDS })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : '処理できませんでした' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST だけ受け付けます' })
  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Body
  const { action, groupId, memberId } = body
  if (action === 'covers') return albumCovers(req, res)
  if (!isUuid(groupId) || !isUuid(memberId)) return res.status(400).json({ error: 'グループと参加者の指定が正しくありません' })
  const guestToken = typeof body.guestToken === 'string' && /^[0-9a-f]{64}$/.test(body.guestToken) ? body.guestToken : null

  const caller = callerClient(req)
  const rpc = async (rpcAction: string, payload: Record<string, unknown>) => {
    const { data, error } = await caller.rpc('private_group_chat_action', {
      p_group_id: groupId, p_member_id: memberId, p_action: rpcAction, p_payload: payload, p_guest_token: guestToken,
    })
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500
      throw Object.assign(new Error(error.message), { status })
    }
    return data as Record<string, unknown> | Array<Record<string, unknown>>
  }

  try {
    if (action === 'prepare') {
      const count = Number(body.count)
      if (!Number.isInteger(count) || count < 1 || count > 10) return res.status(400).json({ error: '写真は1回10枚までです' })
      const prepared = await rpc('photo_prepare', { count }) as { message_id: string; paths: unknown[]; thumb_paths?: unknown[] }
      const sign = async (path: unknown) => {
        if (!isGroupPhotoPath(path, groupId)) return null
        const { data, error } = await db!.storage.from(BUCKET).createSignedUploadUrl(path)
        return error || !data ? null : { path, token: data.token }
      }
      const uploads = []
      for (const path of prepared.paths) {
        const signed = await sign(path)
        if (!signed) return res.status(500).json({ error: '写真の保存先を用意できませんでした' })
        uploads.push(signed)
      }
      // 小さい版（無くても送れる。用意できなかった分は null）
      const thumbUploads = await Promise.all((prepared.thumb_paths ?? []).map(sign))
      return res.status(200).json({ messageId: prepared.message_id, uploads, thumbUploads })
    }

    if (action === 'urls') {
      const messageIds = Array.isArray(body.messageIds) ? body.messageIds.filter(isUuid).slice(0, 200) : null
      const rows = await rpc('photo_paths', messageIds ? { message_ids: messageIds } : {}) as Array<Record<string, unknown>>
      const valid = rows.filter(r => isGroupPhotoPath(r.path, groupId))
      if (valid.length === 0) return res.status(200).json({ photos: [], expiresIn: URL_TTL_SECONDS })
      const thumbs = valid.map(r => r.thumb_path).filter((p): p is string => isGroupPhotoPath(p, groupId))
      const { data, error } = await db.storage.from(BUCKET).createSignedUrls([...valid.map(r => r.path as string), ...thumbs], URL_TTL_SECONDS)
      if (error || !data) return res.status(500).json({ error: '写真を読み込めませんでした' })
      const urlByPath = new Map(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
      const photos = valid.flatMap(r => {
        const url = urlByPath.get(r.path as string)
        const thumbUrl = typeof r.thumb_path === 'string' ? urlByPath.get(r.thumb_path) ?? null : null
        return url ? [{ messageId: r.message_id, position: r.position, url, thumbUrl, createdAt: r.created_at, memberId: r.member_id, width: r.width, height: r.height }] : []
      })
      return res.status(200).json({ photos, expiresIn: URL_TTL_SECONDS })
    }

    if (action === 'delete') {
      if (!isUuid(body.messageId)) return res.status(400).json({ error: '削除するメッセージの指定が正しくありません' })
      const result = await rpc('delete_message', { message_id: body.messageId }) as { photo_paths?: unknown[] }
      const paths = (result.photo_paths ?? []).filter((p): p is string => isGroupPhotoPath(p, groupId))
      if (paths.length > 0) {
        const { error } = await db.storage.from(BUCKET).remove(paths)
        // 発言の削除は確定済み。実体が消せなかったら記録だけ残す（記録が無いので誰も読めない）
        if (error) console.error('[private-group-photos] 写真の実体を消せませんでした', { groupId, messageId: body.messageId, error: error.message })
      }
      return res.status(200).json({ ok: true, removedPhotos: paths.length })
    }

    return res.status(400).json({ error: '未対応の操作です' })
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500
    return res.status(status).json({ error: err instanceof Error ? err.message : '処理できませんでした' })
  }
}
