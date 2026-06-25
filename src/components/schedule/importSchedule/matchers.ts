/**
 * ImportScheduleModal のスタッフ/シナリオ名 ファジーマッチ（純関数・テスト対象）
 *
 * ImportScheduleModal 本体から抽出（Phase 5-2b・挙動不変）。
 * メモ化キャッシュは呼び出し側（コンポーネント）のラッパに残し、ここはアルゴリズムのみ。
 * かな変換は kanaUtils に集約（旧コンポーネント内 toHiragana/toKatakana の重複を解消）。
 */
import { hiraganaToKatakana, katakanaToHiragana } from '@/utils/kanaUtils'

interface StaffNameOption {
  name: string
}
interface ScenarioTitleOption {
  title: string
}

/**
 * スタッフ名のファジーマッチ。
 * 1.動的マッピング完全一致 → 2.かな変換して完全一致 → 3.リスト完全一致(かな含む)
 * → 4.前方一致/部分一致(かな含む) の順。見つからなければ null。
 */
export function matchStaffName(
  input: string,
  staffList: StaffNameOption[],
  dynamicMapping: Record<string, string>,
): string | null {
  if (!input || input.length === 0) return null

  const normalizedInput = input.trim()

  // 1. 完全一致チェック（動的マッピング）
  if (dynamicMapping[normalizedInput]) {
    return dynamicMapping[normalizedInput]
  }

  // 2. ひらがな/カタカナ変換して完全一致チェック
  const hiraganaInput = katakanaToHiragana(normalizedInput)
  const katakanaInput = hiraganaToKatakana(normalizedInput)

  if (dynamicMapping[hiraganaInput]) {
    return dynamicMapping[hiraganaInput]
  }
  if (dynamicMapping[katakanaInput]) {
    return dynamicMapping[katakanaInput]
  }

  // 3. スタッフリストから完全一致チェック
  for (const staff of staffList) {
    if (staff.name === normalizedInput) {
      return staff.name
    }
    // ひらがな/カタカナで一致
    const staffHiragana = katakanaToHiragana(staff.name)
    const staffKatakana = hiraganaToKatakana(staff.name)
    if (staffHiragana === hiraganaInput || staffKatakana === katakanaInput) {
      return staff.name
    }
  }

  // 4. 前方一致・部分一致チェック
  for (const staff of staffList) {
    const staffHiragana = katakanaToHiragana(staff.name)
    const staffKatakana = hiraganaToKatakana(staff.name)

    // 入力がスタッフ名で始まる
    if (normalizedInput.startsWith(staff.name) && staff.name.length >= 2) {
      return staff.name
    }
    // スタッフ名が入力で始まる
    if (staff.name.startsWith(normalizedInput) && normalizedInput.length >= 2) {
      return staff.name
    }
    // ひらがな/カタカナで前方一致
    if (hiraganaInput.startsWith(staffHiragana) && staffHiragana.length >= 2) {
      return staff.name
    }
    if (staffHiragana.startsWith(hiraganaInput) && hiraganaInput.length >= 2) {
      return staff.name
    }
    if (katakanaInput.startsWith(staffKatakana) && staffKatakana.length >= 2) {
      return staff.name
    }
    if (staffKatakana.startsWith(katakanaInput) && katakanaInput.length >= 2) {
      return staff.name
    }
    // 入力がスタッフ名を含む
    if (normalizedInput.includes(staff.name) && staff.name.length >= 2) {
      return staff.name
    }
    // スタッフ名が入力を含む（逆方向）
    if (staff.name.includes(normalizedInput) && normalizedInput.length >= 2) {
      return staff.name
    }
    // ひらがな/カタカナで部分一致
    if (hiraganaInput.includes(staffHiragana) && staffHiragana.length >= 2) {
      return staff.name
    }
    if (staffHiragana.includes(hiraganaInput) && hiraganaInput.length >= 2) {
      return staff.name
    }
  }

  return null
}

/**
 * シナリオ名のファジーマッチ。
 * 1.エイリアス → 2.完全一致 → 3.部分一致 → 4.「季節」プレフィックス除去リトライ
 * → 5.逆引き(含む) の順。見つからなければ null。
 */
export function matchScenarioName(
  input: string,
  scenarioList: ScenarioTitleOption[],
  aliasMap: Record<string, string>,
): string | null {
  if (!input || input.length === 0) return null

  const normalizedInput = input.trim()

  // 1. エイリアスマップチェック（DB取得済み、フォールバックはハードコード）
  if (aliasMap[normalizedInput]) {
    return aliasMap[normalizedInput]
  }

  // 2. シナリオリストから完全一致チェック
  for (const scenario of scenarioList) {
    if (scenario.title === normalizedInput) {
      return scenario.title
    }
  }

  // 3. 部分一致チェック（入力がシナリオ名を含む、またはシナリオ名が入力を含む）
  for (const scenario of scenarioList) {
    const scenarioName = scenario.title
    // 入力がシナリオ名で始まる
    if (normalizedInput.startsWith(scenarioName)) {
      return scenarioName
    }
    // シナリオ名が入力で始まる（短い入力でも長いシナリオ名にマッチ）
    if (scenarioName.startsWith(normalizedInput) && normalizedInput.length >= 3) {
      return scenarioName
    }
    // 入力がシナリオ名を含む
    if (normalizedInput.includes(scenarioName) && scenarioName.length >= 3) {
      return scenarioName
    }
  }

  // 4. 「季節」プレフィックスを除去してリトライ
  const seasonStripped = normalizedInput.replace(/^季節(マーダー)?[／/・]?/, '')
  if (seasonStripped !== normalizedInput && seasonStripped.length >= 2) {
    if (aliasMap[seasonStripped]) {
      return aliasMap[seasonStripped]
    }
    for (const scenario of scenarioList) {
      if (scenario.title.includes(seasonStripped)) {
        return scenario.title
      }
    }
  }

  // 5. シナリオ名に入力が含まれる（逆引き）
  for (const scenario of scenarioList) {
    const scenarioName = scenario.title
    if (scenarioName.includes(normalizedInput) && normalizedInput.length >= 3) {
      return scenarioName
    }
  }

  return null
}
