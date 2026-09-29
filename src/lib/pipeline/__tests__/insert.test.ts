import { describe, expect, it } from 'vitest'
import { insertAfter } from '../insert'
import { flowchartParser } from '../flowchart'
import { classParser } from '../class'

function parse(parser: { parse(s: string): { ok: boolean; doc?: unknown } }, source: string) {
  const result = parser.parse(source) as { ok: boolean; doc: import('../document').SourceDocument }
  if (!result.ok) throw new Error('parse failed')
  return result.doc
}

describe('insertAfter 内核（architecture-deepening 工单 02）', () => {
  const CLASS_SRC = `classDiagram
  class Alpha
  class Beta
`

  it('afterElementId 缺省 → 锚点取文档最后一个元素', () => {
    const doc = parse(classParser, CLASS_SRC)
    const result = insertAfter(doc, { render: (indent) => indentLines(indent, ['class Gamma']) })
    expect(result).not.toBeNull()
    const rewritten = [...result!.values()][0]
    expect(rewritten).toBe('class Beta\n  class Gamma')
  })

  it("anchor: 'line-end' → 链式语句锚点推到该行 span 最靠后的元素", () => {
    const doc = parse(flowchartParser, 'flowchart TD\n  A --> B --> C\n')
    const result = insertAfter(doc, {
      afterElementId: 'node:A',
      anchor: 'line-end',
      render: (indent) => indentLines(indent, ['D --> E']),
    })
    expect(result).not.toBeNull()
    // 新行必须落在行末节点 C 之后，而不是链中间（插到链中间会产生语法错误）
    const keys = [...result!.keys()]
    const cId = keys.find((k) => k.startsWith('node:') && k.includes('C'))
    expect(result!.has(cId ?? '')).toBe(true)
    const rewritten = result!.get(cId ?? '')
    expect(rewritten).toContain('C\n  D --> E')
  })

  it('锚点不存在且文档有元素 → 回落到最后一个元素；文档无元素 → null', () => {
    const doc = parse(classParser, CLASS_SRC)
    expect(insertAfter(doc, { afterElementId: 'nonexistent', render: () => 'x' })).not.toBeNull()
    const empty = { ...parse(classParser, 'classDiagram\n'), elements: [] }
    expect(insertAfter(empty, { render: () => 'x' })).toBeNull()
  })

  it.each([
    ['空缩进', 'classDiagram\nclass Alpha\n', ''],
    ['空格缩进', 'classDiagram\n    class Alpha\n', '    '],
    ['Tab 缩进', 'classDiagram\n\tclass Alpha\n', '\t'],
  ])('缩进跟随锚点行（%s）', (_name, source, expectedIndent) => {
    const doc = parse(classParser, source)
    const result = insertAfter(doc, { render: (indent) => indentLines(indent, ['class Beta']) })
    const rewritten = [...result!.values()][0]
    expect(rewritten).toContain(expectedIndent + 'class Beta')
  })

  it('mindmap 形态：锚点原文已带行尾换行时不重复补（render 的 original 参数）', () => {
    const doc = parse(classParser, CLASS_SRC)
    const result = insertAfter(doc, {
      afterElementId: [...doc.elements][doc.elements.length - 1].id,
      render: (_indent, original) => (/[\n\r]$/.test(original) ? '' : '\n') + 'root\n',
    })
    const rewritten = [...result!.values()][0]
    expect(rewritten).not.toMatch(/\n\nroot/)
  })

  it('逐字保留：重写值 = 锚点原文 + 插入文本，原文一字不动', () => {
    const doc = parse(classParser, CLASS_SRC)
    const result = insertAfter(doc, { render: (indent) => indentLines(indent, ['class Gamma']) })
    const rewritten = [...result!.values()][0]
    expect(rewritten).toBe('class Beta\n  class Gamma')
  })
})

function indentLines(indent: string, lines: string[]): string {
  return lines.map((l) => '\n' + indent + l).join('')
}
