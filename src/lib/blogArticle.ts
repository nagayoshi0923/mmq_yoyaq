/**
 * 特集記事（ブログ記事）の本文を、画面に出す部品（見出し・文章・画像・作品カード・タグの作品一覧・キャラ紹介）に分ける。
 * QW-20261116-001（2026-11-17 社長指示「特集はブログ機能で記事を作るイメージ」）。
 *
 * 本文は今までどおり 1 行ずつの簡単な Markdown。次の 1 行だけの書き方で部品を差し込む。
 *   [[作品:<作品ID>]]                         作品カード（次の公演・空席は表示のたびに最新）
 *   [[タグ:推理重視]]                          そのタグの作品を自動で並べる
 *   [[タグ:推理重視|除く:<作品ID>,<作品ID>]]   自動の一覧から手で外す
 *   [[キャラ:<作品ID>:<キャラID>]]             キャラ紹介（押すと登場作品のページへ）
 *   ![説明](https://...)                       画像
 * 管理画面のボタンが入れるので、書く人がこの形を覚える必要はない。
 */

export type ArticleBlock =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list_item'; text: string }
  | { kind: 'spacer' }
  | { kind: 'image'; url: string; caption: string }
  | { kind: 'work'; scenarioId: string }
  | { kind: 'tag'; tag: string; excludeIds: string[] }
  | { kind: 'character'; scenarioId: string; characterId: string }

const WORK_RE = /^\[\[作品:([^\]|:]+)\]\]$/
const TAG_RE = /^\[\[タグ:([^\]|]+)(?:\|除く:([^\]]*))?\]\]$/
const CHARACTER_RE = /^\[\[キャラ:([^\]:]+):([^\]]+)\]\]$/
const IMAGE_RE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/

export function parseArticleBlocks(content: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line === '') {
      blocks.push({ kind: 'spacer' })
      continue
    }
    let m = line.match(WORK_RE)
    if (m) {
      blocks.push({ kind: 'work', scenarioId: m[1].trim() })
      continue
    }
    m = line.match(TAG_RE)
    if (m) {
      const excludeIds = (m[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      blocks.push({ kind: 'tag', tag: m[1].trim(), excludeIds })
      continue
    }
    m = line.match(CHARACTER_RE)
    if (m) {
      blocks.push({ kind: 'character', scenarioId: m[1].trim(), characterId: m[2].trim() })
      continue
    }
    m = line.match(IMAGE_RE)
    if (m) {
      blocks.push({ kind: 'image', caption: m[1].trim(), url: m[2] })
      continue
    }
    if (line.startsWith('### ')) blocks.push({ kind: 'h3', text: line.slice(4) })
    else if (line.startsWith('## ')) blocks.push({ kind: 'h2', text: line.slice(3) })
    else if (line.startsWith('# ')) blocks.push({ kind: 'h1', text: line.slice(2) })
    else if (line.startsWith('- ')) blocks.push({ kind: 'list_item', text: line.slice(2) })
    else blocks.push({ kind: 'paragraph', text: line })
  }
  return blocks
}

/** 記事が使う作品ID（作品カード・キャラ紹介）とタグ。まとめて 1 回で読むため */
export function articleReferences(blocks: readonly ArticleBlock[]): { scenarioIds: string[]; tags: string[] } {
  const ids = new Set<string>()
  const tags = new Set<string>()
  for (const b of blocks) {
    if (b.kind === 'work' || b.kind === 'character') ids.add(b.scenarioId)
    if (b.kind === 'tag') tags.add(b.tag)
  }
  return { scenarioIds: [...ids], tags: [...tags] }
}

/** 記事の中で作品カードとして出した作品（タグの自動一覧ではもう出さない） */
export function featuredWorkIds(blocks: readonly ArticleBlock[]): Set<string> {
  return new Set(blocks.filter((b): b is Extract<ArticleBlock, { kind: 'work' }> => b.kind === 'work').map((b) => b.scenarioId))
}

/** 目次（## の見出し） */
export function articleHeadings(blocks: readonly ArticleBlock[]): string[] {
  return blocks.filter((b): b is Extract<ArticleBlock, { kind: 'h2' }> => b.kind === 'h2').map((b) => b.text)
}

export const workShortcode = (scenarioId: string) => `[[作品:${scenarioId}]]`
export const characterShortcode = (scenarioId: string, characterId: string) => `[[キャラ:${scenarioId}:${characterId}]]`
export function tagShortcode(tag: string, excludeIds: readonly string[] = []): string {
  return excludeIds.length > 0 ? `[[タグ:${tag}|除く:${excludeIds.join(',')}]]` : `[[タグ:${tag}]]`
}
export const imageMarkdown = (url: string, caption: string) => `![${caption.replace(/[[\]]/g, '')}](${url})`

/** 本文のカーソル位置に、部品を 1 行として差し込む（前後に改行を補う） */
export function insertLineAt(content: string, position: number, line: string): { content: string; cursor: number } {
  const pos = Math.max(0, Math.min(position, content.length))
  const before = content.slice(0, pos)
  const after = content.slice(pos)
  const lead = before === '' || before.endsWith('\n') ? '' : '\n'
  const trail = after.startsWith('\n') ? '' : '\n'
  const next = `${before}${lead}${line}${trail}${after}`
  return { content: next, cursor: before.length + lead.length + line.length + trail.length }
}

/** キャラ紹介の候補を探す（名前・職業・紹介文に言葉を含む） */
export function characterMatches(c: { name?: string | null; occupation?: string | null; description?: string | null }, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  const words = q === 'メガネ' || q === '眼鏡' || q === 'めがね' ? ['メガネ', '眼鏡', 'めがね'] : [q]
  const hay = `${c.name ?? ''} ${c.occupation ?? ''} ${c.description ?? ''}`
  return words.some((w) => hay.includes(w))
}
