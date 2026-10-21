// ウェブプッシュ（VAPID）の暗号化と署名（貸切グループページ刷新 段階 3、2026-10-10）。
// 外部サービス・外部ライブラリを使わず、Web Crypto だけで書く（Deno・Node のどちらでも動く。単体テストは Node の vitest）。
//   - 本文の暗号化: RFC 8291（Message Encryption for Web Push、aes128gcm）
//   - 送り手の証明: RFC 8292（VAPID。ES256 の JWT）
// 鍵: VAPID_PUBLIC_KEY は 65 バイトの非圧縮点、VAPID_PRIVATE_KEY は 32 バイトの秘密値、どちらも base64url。
// 作り方は scripts/generate-vapid-keys.mjs（docs/development/local-dev.md）。

const enc = new TextEncoder()
/** Web Crypto に渡す形（TypeScript の版で Uint8Array の型が違っても通るよう、ArrayBuffer に写す） */
const buf = (u: Uint8Array): ArrayBuffer => u.slice().buffer as ArrayBuffer

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, length * 8)
  return new Uint8Array(bits)
}

/** 1 レコード（4096 バイト）に収まる本文の上限。送る側で短くしてから渡す */
export const MAX_PLAINTEXT_BYTES = 3000

/**
 * 端末の公開鍵（p256dh）と認証用の値（auth）で本文を暗号化し、送る本体（aes128gcm）を返す。
 * localKeys・salt はテストのときだけ渡す（普段は毎回作る）。
 */
export async function encryptWebPushPayload(
  plaintext: Uint8Array,
  p256dh: string,
  authSecret: string,
  testing?: { localKeys?: CryptoKeyPair; salt?: Uint8Array },
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error('payload_too_large')
  const uaPublic = base64UrlDecode(p256dh)
  const auth = base64UrlDecode(authSecret)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid_p256dh')
  if (auth.length < 16) throw new Error('invalid_auth')
  const localKeys = testing?.localKeys ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, localKeys.privateKey, 256))
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const aesKey = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt'])
  // 最後のレコードの区切り 0x02 を付けて 1 レコードで送る
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aesKey, buf(concat(plaintext, new Uint8Array([2])))))
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, cipher)
}

/** VAPID の秘密鍵（d）と公開鍵（65 バイト）から署名用の鍵を作る */
export async function importVapidPrivateKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = base64UrlDecode(publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('invalid_vapid_public_key')
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256', ext: false,
    x: base64UrlEncode(pub.slice(1, 33)), y: base64UrlEncode(pub.slice(33, 65)), d: privateKey,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** 送り先（endpoint）の配信元ごとの VAPID の JWT（ES256）。有効期限は 12 時間 */
export async function vapidJwt(endpoint: string, subject: string, key: CryptoKey, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = base64UrlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64UrlEncode(enc.encode(JSON.stringify({ aud, exp: nowSeconds + 12 * 3600, sub: subject })))
  const unsigned = `${header}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(unsigned))))
  return `${unsigned}.${base64UrlEncode(sig)}`
}

/** 送ってよい配信元（ブラウザのプッシュ配信元だけ。DB の制約と同じ） */
export const PUSH_ENDPOINT_PATTERN = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//

/**
 * チャットの Realtime チャンネル名（入力中・いま見ている人）。グループの id ではなく招待コードのハッシュにする。
 * 画面（src/lib/groupChannelTopic.ts）もこの関数をそのまま使う（決まりを 1 か所にするため）。
 */
export async function groupChannelTopic(inviteCode: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf(enc.encode(`mmq-private-group:${inviteCode}`))))
  return `private-group-chat:${Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('')}`
}
