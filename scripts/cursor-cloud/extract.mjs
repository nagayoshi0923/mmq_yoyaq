// Cursor Cloud の出力からレビュー結果の JSON を取り出す。
// 最終出力（result）は空のことがあり、また前置きの説明文やコードフェンスが付くことがあるため、
// 会話履歴の文字列も候補にして、条件を満たす最後の JSON オブジェクトを返す。

export function isReview(value) {
  return Boolean(value) && typeof value === 'object' &&
    typeof value.summary === 'string' &&
    ['merge', 'fix', 'discuss'].includes(value.mergeRecommendation) &&
    Array.isArray(value.findings) &&
    value.findings.every((f) => f && typeof f.path === 'string' && Number.isInteger(f.line) && f.line > 0 && typeof f.body === 'string')
}

// 文字列中の、括弧の対応が取れた { ... } をすべて取り出す（文字列リテラル内の括弧は無視する）。
function jsonObjectCandidates(text) {
  const found = []
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          found.push(text.slice(start, i + 1))
          break
        }
      }
    }
  }
  return found
}

export function extractReview(texts) {
  for (const text of [...texts].reverse()) {
    if (typeof text !== 'string' || !text.includes('{')) continue
    const candidates = jsonObjectCandidates(text).reverse()
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate)
        if (isReview(parsed)) return parsed
      } catch {
        // 次の候補へ
      }
    }
  }
  return null
}

// 会話履歴からアシスタントの発言と計画本文（plan モード）を古い順に集める。
export function collectConversationTexts(turns) {
  const texts = []
  const visit = (node, key) => {
    if (typeof node === 'string') {
      if (key === 'text' || key === 'plan' || key === 'content') texts.push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, key))
      return
    }
    if (node && typeof node === 'object') {
      if (node.type === 'userMessage' || key === 'userMessage') return
      for (const [childKey, child] of Object.entries(node)) visit(child, childKey)
    }
  }
  visit(turns, null)
  return texts
}
