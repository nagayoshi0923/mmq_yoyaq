/**
 * ウェブプッシュの暗号化（RFC 8291）と VAPID の署名（RFC 8292）を、受け取る側の手順で戻して確かめる。
 * 本体は Edge Function の共有部品 supabase/functions/_shared/web-push.ts（Web Crypto だけで書いている）。
 */
import { describe, expect, it } from 'vitest'
import { base64UrlDecode, base64UrlEncode, encryptWebPushPayload, groupChannelTopic, importVapidPrivateKey, vapidJwt, PUSH_ENDPOINT_PATTERN } from '../../supabase/functions/_shared/web-push'

const enc = new TextEncoder()
const buf = (u: Uint8Array): ArrayBuffer => u.slice().buffer as ArrayBuffer
const concat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, len * 8))
}

/** 端末（ブラウザ）側の復号。RFC 8291 の手順そのまま */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
  const asKey = await crypto.subtle.importKey('raw', buf(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(cipher)))
  return { rs, idlen, plain }
}

describe('ウェブプッシュの暗号化', () => {
  it('端末の鍵で戻すと元の本文になり、最後に区切り 0x02 が付く', async () => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const p256dh = base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)))
    const text = JSON.stringify({ title: '六人の館', body: 'いちこ: こんにちは', url: '/group/invite/ABC?tab=chat' })
    const body = await encryptWebPushPayload(enc.encode(text), p256dh, base64UrlEncode(auth))
    const { rs, idlen, plain } = await decrypt(body, ua, auth)
    expect(rs).toBe(4096)
    expect(idlen).toBe(65)
    expect(plain[plain.length - 1]).toBe(2)
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(text)
  })
  it('壊れた鍵・大きすぎる本文は送らない', async () => {
    await expect(encryptWebPushPayload(enc.encode('x'), base64UrlEncode(new Uint8Array(10)), base64UrlEncode(new Uint8Array(16)))).rejects.toThrow('invalid_p256dh')
    await expect(encryptWebPushPayload(new Uint8Array(4000), 'x', 'y')).rejects.toThrow('payload_too_large')
  })
})

describe('VAPID', () => {
  it('ES256 の JWT を公開鍵で確かめられ、aud は配信元', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    const key = await importVapidPrivateKey(base64UrlEncode(raw), jwk.d as string)
    const jwt = await vapidJwt('https://fcm.googleapis.com/fcm/send/abc', 'mailto:noreply@mmq.game', key, 1_800_000_000)
    const [h, c, s] = jwt.split('.')
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, buf(base64UrlDecode(s)), buf(enc.encode(`${h}.${c}`)))
    expect(ok).toBe(true)
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(c)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 43200, sub: 'mailto:noreply@mmq.game' })
  })
})

describe('送り先と チャンネル名', () => {
  it('ブラウザの配信元だけ', () => {
    expect(PUSH_ENDPOINT_PATTERN.test('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(PUSH_ENDPOINT_PATTERN.test('https://web.push.apple.com/abc')).toBe(true)
    expect(PUSH_ENDPOINT_PATTERN.test('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(PUSH_ENDPOINT_PATTERN.test('https://example.com/fcm.googleapis.com/')).toBe(false)
    expect(PUSH_ENDPOINT_PATTERN.test('http://fcm.googleapis.com/x')).toBe(false)
    expect(PUSH_ENDPOINT_PATTERN.test('https://fcm.googleapis.com.evil.test/x')).toBe(false)
  })
  it('招待コードのハッシュ（グループ id は使わない・同じコードなら同じ名前）', async () => {
    const a = await groupChannelTopic('ABC123')
    expect(a).toMatch(/^private-group-chat:[0-9a-f]{32}$/)
    expect(a).not.toContain('ABC123')
    expect(await groupChannelTopic('ABC123')).toBe(a)
    expect(await groupChannelTopic('ABC124')).not.toBe(a)
  })
})
