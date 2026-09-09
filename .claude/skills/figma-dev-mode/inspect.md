# Dev Mode 数値ダンプ（use_figma）

`skillNames` に `figma-use` を付ける。対象フレーム ID を `ROOT` に入れる。

```js
function hex(c) {
  if (!c) return null
  const n = (x) => Math.round(x * 255)
  const h = (x) => n(x).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}
function paints(p) {
  if (!p || p === figma.mixed) return []
  return p.filter((x) => x.type === 'SOLID' && x.visible !== false).map((x) => hex(x.color))
}
function dump(n, depth) {
  const o = {
    id: n.id,
    name: n.name,
    type: n.type,
    w: Math.round(n.width),
    h: Math.round(n.height),
    layout: n.layoutMode,
    gap: n.itemSpacing,
    pad: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft],
    radius: n.cornerRadius,
    fills: paints(n.fills),
    strokes: paints(n.strokes),
    strokeWeight: n.strokeWeight,
  }
  if (n.type === 'TEXT') {
    o.chars = n.characters.slice(0, 80)
    o.font = n.fontName
    o.size = n.fontSize
    o.weight = n.fontName && n.fontName.style
    o.line = n.lineHeight
    o.color = paints(n.fills)[0]
  }
  if (depth < 2 && n.children) {
    o.kids = n.children.map((c) => dump(c, depth + 1))
  }
  return o
}
const root = await figma.getNodeByIdAsync('ROOT')
return dump(root, 0)
```

子を個別に測るときは、返ってきた `kids[].id` で同じ関数を `depth: 1` で再実行する。
