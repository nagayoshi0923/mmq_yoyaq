#!/usr/bin/env node
/**
 * Supabase Storage の実ファイル (S3 blob) を prod から staging へ全件コピーする。
 *
 * 使い方:
 *   node scripts/clone-storage-blobs.mjs \
 *     --prod-url https://<prod-ref>.supabase.co \
 *     --prod-key <prod service_role key> \
 *     --staging-url https://<staging-ref>.supabase.co \
 *     --staging-key <staging service_role key>
 *
 * 仕様:
 *   - 全 bucket・全 object を順に走査
 *   - 同じ path に既に存在する場合は upsert で上書き
 *   - 失敗したファイルは末尾にまとめて表示 (続行する)
 *   - 並列度 4 (Storage API の rate limit を考慮した安全側)
 */

import { createClient } from '@supabase/supabase-js'

function parseArgs() {
  const args = {}
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i].replace(/^--/, '')
    args[k] = process.argv[i + 1]
  }
  for (const required of ['prod-url', 'prod-key', 'staging-url', 'staging-key']) {
    if (!args[required]) {
      console.error(`❌ --${required} が必要です`)
      process.exit(2)
    }
  }
  return args
}

async function listAllObjects(supabase, bucket) {
  const all = []
  const pageSize = 1000
  let offset = 0
  // 再帰でフォルダ階層も含めて列挙
  async function walk(prefix) {
    let pageOffset = 0
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: pageSize, offset: pageOffset })
      if (error) throw error
      if (!data || data.length === 0) break
      for (const entry of data) {
        if (entry.id === null) {
          // フォルダ
          await walk(prefix ? `${prefix}/${entry.name}` : entry.name)
        } else {
          all.push({ bucket, path: prefix ? `${prefix}/${entry.name}` : entry.name })
        }
      }
      if (data.length < pageSize) break
      pageOffset += pageSize
    }
  }
  await walk('')
  return all
}

async function copyOne(prod, staging, { bucket, path }) {
  // prod から download
  const { data: blob, error: dlErr } = await prod.storage.from(bucket).download(path)
  if (dlErr) throw new Error(`download ${bucket}/${path}: ${dlErr.message}`)

  // staging に upload (upsert)
  const arrayBuf = await blob.arrayBuffer()
  const { error: upErr } = await staging.storage.from(bucket).upload(path, arrayBuf, {
    contentType: blob.type || 'application/octet-stream',
    upsert: true,
  })
  if (upErr) throw new Error(`upload ${bucket}/${path}: ${upErr.message}`)
}

async function ensureStagingBuckets(prod, staging) {
  const { data: prodBuckets, error: prodErr } = await prod.storage.listBuckets()
  if (prodErr) throw prodErr
  const { data: stgBuckets, error: stgErr } = await staging.storage.listBuckets()
  if (stgErr) throw stgErr

  const stgNames = new Set((stgBuckets || []).map(b => b.name))
  for (const b of prodBuckets) {
    if (!stgNames.has(b.name)) {
      console.log(`  📁 staging に bucket 作成: ${b.name} (public=${b.public})`)
      const { error } = await staging.storage.createBucket(b.name, {
        public: b.public,
        fileSizeLimit: b.file_size_limit,
        allowedMimeTypes: b.allowed_mime_types,
      })
      if (error && !error.message.includes('already exists')) throw error
    }
  }
  return prodBuckets
}

async function main() {
  const args = parseArgs()
  const prod = createClient(args['prod-url'], args['prod-key'])
  const staging = createClient(args['staging-url'], args['staging-key'])

  console.log('🪣 bucket 同期...')
  const buckets = await ensureStagingBuckets(prod, staging)
  console.log(`   ${buckets.length} buckets`)

  console.log('\n📋 prod の全 object を列挙...')
  const allObjects = []
  for (const b of buckets) {
    const objs = await listAllObjects(prod, b.name)
    console.log(`   ${b.name}: ${objs.length} 件`)
    allObjects.push(...objs)
  }
  console.log(`   合計: ${allObjects.length} 件`)

  console.log('\n📤 コピー実行 (並列度 4)...')
  let done = 0
  const failures = []
  const concurrency = 4
  const queue = [...allObjects]

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      try {
        await copyOne(prod, staging, item)
      } catch (e) {
        failures.push({ ...item, error: e.message })
      }
      done++
      if (done % 50 === 0 || done === allObjects.length) {
        process.stdout.write(`\r   ${done}/${allObjects.length} (失敗 ${failures.length})`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  process.stdout.write('\n')

  if (failures.length > 0) {
    console.log(`\n⚠️  ${failures.length} 件失敗:`)
    for (const f of failures.slice(0, 20)) {
      console.log(`   ${f.bucket}/${f.path}: ${f.error}`)
    }
    if (failures.length > 20) console.log(`   ... 他 ${failures.length - 20} 件`)
    process.exit(1)
  }

  console.log('\n✅ 全 blob コピー完了')
}

main().catch(err => {
  console.error('❌ エラー:', err.message)
  process.exit(1)
})
