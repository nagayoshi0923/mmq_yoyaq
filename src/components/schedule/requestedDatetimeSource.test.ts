// 予約の requested_datetime には公演の日時を入れる。保存した時刻（new Date() / Date.now()）を入れると、
// クーポンの公演当日の判定や一覧の日付がずれる（staging で 31 件。20261020220000）。
// 旧 ensureStaffReservation（#640 で削除）と公演の詳細画面の「保存後に追加」の参加者で起きていた。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path)
  }
}
;['src', 'api'].forEach(walk)

describe('予約の requested_datetime', () => {
  it('保存した時刻を入れない（公演の日付と開始時刻から作る）', () => {
    const offenders = files.filter(file => /requested_datetime\s*:\s*(new Date\(\s*\)|Date\.now\(\))/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
