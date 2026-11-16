import { describe, expect, it } from 'vitest'
import {
  articleHeadings,
  articleReferences,
  characterMatches,
  featuredWorkIds,
  insertLineAt,
  parseArticleBlocks,
  tagShortcode,
} from './blogArticle'

describe('parseArticleBlocks（特集記事の本文を部品に分ける）', () => {
  it('見出し・文章・作品カード・タグの一覧・キャラ・画像を見分ける', () => {
    const blocks = parseArticleBlocks([
      '## まずはここから',
      '推理が初めての人へ。',
      '[[作品:aaa]]',
      '[[タグ:推理重視|除く:bbb, ccc]]',
      '[[キャラ:ddd:c1]]',
      '![卓のようす](https://example.com/a.png)',
      '- 箇条書き',
      '',
    ].join('\n'))
    expect(blocks).toEqual([
      { kind: 'h2', text: 'まずはここから' },
      { kind: 'paragraph', text: '推理が初めての人へ。' },
      { kind: 'work', scenarioId: 'aaa' },
      { kind: 'tag', tag: '推理重視', excludeIds: ['bbb', 'ccc'] },
      { kind: 'character', scenarioId: 'ddd', characterId: 'c1' },
      { kind: 'image', caption: '卓のようす', url: 'https://example.com/a.png' },
      { kind: 'list_item', text: '箇条書き' },
      { kind: 'spacer' },
    ])
  })

  it('文の途中の [[作品:…]] は部品にしない（1行まるごとのときだけ）', () => {
    expect(parseArticleBlocks('おすすめは [[作品:aaa]] です')).toEqual([{ kind: 'paragraph', text: 'おすすめは [[作品:aaa]] です' }])
  })

  it('読み込む作品ID・タグ・作品カードで出した作品・目次を集める', () => {
    const blocks = parseArticleBlocks('## A\n[[作品:x]]\n[[キャラ:y:1]]\n## B\n[[タグ:泣ける]]\n[[作品:x]]')
    expect(articleReferences(blocks)).toEqual({ scenarioIds: ['x', 'y'], tags: ['泣ける'] })
    expect([...featuredWorkIds(blocks)]).toEqual(['x'])
    expect(articleHeadings(blocks)).toEqual(['A', 'B'])
  })
})

describe('管理画面の差し込み', () => {
  it('外す作品が無ければ除くを付けない', () => {
    expect(tagShortcode('推理重視')).toBe('[[タグ:推理重視]]')
    expect(tagShortcode('推理重視', ['a', 'b'])).toBe('[[タグ:推理重視|除く:a,b]]')
  })

  it('カーソル位置に1行として入れる（前後の改行を補う）', () => {
    expect(insertLineAt('前の文後の文', 3, '[[作品:x]]')).toEqual({ content: '前の文\n[[作品:x]]\n後の文', cursor: 13 })
    expect(insertLineAt('', 0, '## 見出し')).toEqual({ content: '## 見出し\n', cursor: 7 })
  })

  it('メガネは眼鏡・めがねでも見つける', () => {
    expect(characterMatches({ description: '眼鏡をかけた教師' }, 'メガネ')).toBe(true)
    expect(characterMatches({ description: '館に仕えるメイド' }, 'メガネ')).toBe(false)
    expect(characterMatches({ name: 'メイド長' }, 'メイド')).toBe(true)
  })
})
