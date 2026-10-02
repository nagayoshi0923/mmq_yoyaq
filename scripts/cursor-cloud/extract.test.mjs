import assert from 'node:assert/strict'
import test from 'node:test'
import { collectConversationTexts, extractReview } from './extract.mjs'

const review = { summary: '問題なし', mergeRecommendation: 'merge', findings: [] }

test('出力全体が JSON ならそのまま取り出す', () => {
  assert.deepEqual(extractReview([JSON.stringify(review)]), review)
})

test('前置きの説明文やコードフェンスが付いていても取り出す', () => {
  const text = `差分を確認しました。\n\n\`\`\`json\n${JSON.stringify({ ...review, findings: [{ path: 'src/a.ts', line: 3, body: '括弧 { } を含む指摘' }] })}\n\`\`\`\n以上です。`
  const found = extractReview([text])
  assert.equal(found.findings[0].body, '括弧 { } を含む指摘')
})

test('result が空でも会話履歴の最後の発言から取り出す', () => {
  const turns = [{
    type: 'agentConversationTurn',
    turn: {
      userMessage: { text: '出力例: { "summary": "例", "mergeRecommendation": "merge", "findings": [] }' },
      steps: [
        { type: 'assistantMessage', message: { text: '確認します' } },
        { type: 'assistantMessage', message: { text: JSON.stringify({ ...review, mergeRecommendation: 'fix' }) } },
      ],
    },
  }]
  const texts = collectConversationTexts(turns)
  assert.equal(texts.includes('出力例: { "summary": "例", "mergeRecommendation": "merge", "findings": [] }'), false, '依頼文は候補にしない')
  assert.equal(extractReview([...texts, '']).mergeRecommendation, 'fix')
})

test('形の合わない JSON や壊れた JSON はレビューとして扱わない', () => {
  assert.equal(extractReview(['{"summary": "x"}', '{ 壊れた', '']), null)
  assert.equal(extractReview([JSON.stringify({ ...review, findings: [{ path: 'a', line: 0, body: 'x' }] })]), null)
})
