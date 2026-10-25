/**
 * 2026-10-24に公開作品ページから読み取った表示見本（HO・顧客情報を含まない）。
 * https://mmq.game/queens-waltz/scenario/hoshizora-malice
 * 実作品ID・公演・店舗・受付には接続しない。画像も公開ストレージの読取りだけ。
 */
import type { ScenarioCharacter } from '@/pages/ScenarioDetailPage/utils/types'
import { DEFAULT_PRESET } from '@/lib/themePresets'

export const DETAIL_PREVIEW_THEME = { ...DEFAULT_PRESET, primary: '#003437', primaryHover: '#002629', accent: '#002629' }
const IMAGE_BASE = 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/characters/'
const characters: Array<[string, 'male' | 'female', string, string]> = [
  ['ヘリオス', 'male', '1773765607446-svamf.png', '星空屋ヒコボシの弟。おおらかで優しい男性。'],
  ['サン', 'male', '1773765610051-p9nvu.png', 'ヘリオスの弟子として太陽屋で働いている。天才肌で何でもこなすが自信なさげな男の子。'],
  ['ミスタ', 'male', '1773765618855-f3v7qb.png', 'ヒコボシの弟子として星空屋で働いている。真面目で妹思いな男の子。'],
  ['スタリー', 'female', '1773765622235-o6shne.png', 'ミスタの妹。パン屋で働いている。優しくて料理が上手な女の子。'],
  ['アルテ', 'female', '1773765625228-cq9vgm.png', '太陽屋・星空屋の道具のメンテナンスをしている。純粋で可憐な女の子。'],
  ['グラ', 'male', '1773765628464-h0kbfn.png', 'スタリーが働くパン屋の息子。幼馴染のアルテに連れられてよく星空と太陽に遊びに来る。しっかり者で面倒見が良い男の子。'],
  ['パティ', 'female', '1773765631611-1dwwti.png', '近くに住む少女。学校帰りによく星空と太陽に遊びに来る。弱気な女の子。'],
]
export const PUBLIC_PREVIEW_CHARACTERS: ScenarioCharacter[] = characters.map(([name, gender, image, description], i) => ({
  id: `proto-public-character-${i}`, name, gender, image_url: `${IMAGE_BASE}${image}`, description, sort_order: i,
}))
