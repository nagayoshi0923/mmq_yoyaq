#!/usr/bin/env node
// ウェブプッシュ（VAPID）の鍵を 1 組つくる（貸切グループページ刷新 段階 3）。
// 出力: 公開鍵（画面の VITE_VAPID_PUBLIC_KEY と Supabase secrets の VAPID_PUBLIC_KEY に同じ値）と、
//       秘密鍵（Supabase secrets の VAPID_PRIVATE_KEY だけに入れる。リポジトリ・チャット・報告に書かない）。
// 環境（手元・staging・本番）ごとに別の鍵をつくる。鍵を作り直すと、それまでの端末の購読には届かなくなる（端末で受け取り直しが要る）。
//
//   node scripts/generate-vapid-keys.mjs              # 画面に出す
//   node scripts/generate-vapid-keys.mjs --env FILE   # FILE に VAPID_PUBLIC_KEY= / VAPID_PRIVATE_KEY= を書く（画面には公開鍵だけ出す）
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' })
const priv = privateKey.export({ format: 'jwk' })
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')])
const publicB64 = raw.toString('base64url')

const envIndex = process.argv.indexOf('--env')
if (envIndex > 0 && process.argv[envIndex + 1]) {
  const file = process.argv[envIndex + 1]
  writeFileSync(file, `VAPID_PUBLIC_KEY=${publicB64}\nVAPID_PRIVATE_KEY=${priv.d}\nVAPID_SUBJECT=mailto:noreply@mmq.game\n`, { mode: 0o600 })
  console.log(`${file} に書きました（秘密鍵は表示しません）`)
  console.log(`VAPID_PUBLIC_KEY=${publicB64}`)
} else {
  console.log(`VAPID_PUBLIC_KEY=${publicB64}`)
  console.log(`VAPID_PRIVATE_KEY=${priv.d}`)
}
