import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { applySetTheme, frontmatterEnd, isMermaidTheme, readTheme } from '../frontmatter'
import { flowchartParser } from '../flowchart'
import { sequenceParser } from '../sequence'
import { classParser } from '../class'
import { mindmapParser } from '../mindmap'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'

/**
 * 工单 11：frontmatter 主题配置的手术式落码语义。
 * - 无 frontmatter → 文首插入 `---\nconfig:\n  theme: xxx\n---\n`
 * - 已有 frontmatter → 只新增/改写主题项，其余配置项逐字保留
 * - frontmatter 块被全部四个图种解析器 verbatim 保留
 * - 金样：产物能被 mermaid v12 实际 parse 通过
 */

const FLOWCHART_SRC = `flowchart TD
    A[开始] --> B(处理)
`

describe('applySetTheme：插入与更新语义', () => {
  it('无 frontmatter 时在文首插入', () => {
    expect(applySetTheme(FLOWCHART_SRC, 'dark')).toBe(
      `---\nconfig:\n  theme: dark\n---\n` + FLOWCHART_SRC,
    )
  })

  it('已有 frontmatter 但无 config：追加 config 块，原有项逐字保留', () => {
    const src = `---
title: 我的图
---
${FLOWCHART_SRC}`
    expect(applySetTheme(src, 'forest')).toBe(
      `---\ntitle: 我的图\nconfig:\n  theme: forest\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('已有 config 但无 theme：在 config 下插入，其余配置项逐字保留', () => {
    const src = `---
title: 我的图
config:
  fontFamily: monospace
  themeVariables:
    fontSize: 16px
---
${FLOWCHART_SRC}`
    expect(applySetTheme(src, 'neutral')).toBe(
      `---\ntitle: 我的图\nconfig:\n  theme: neutral\n  fontFamily: monospace\n  themeVariables:\n    fontSize: 16px\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('已有 theme：只改主题项的值，其余逐字保留', () => {
    const src = `---
title: 我的图
config:
  theme: dark
  fontFamily: monospace
---
${FLOWCHART_SRC}`
    expect(applySetTheme(src, 'base')).toBe(
      `---\ntitle: 我的图\nconfig:\n  theme: base\n  fontFamily: monospace\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('config 块后的顶层键不被误认为 config 子项', () => {
    const src = `---
config:
anotherTop: 1
---
${FLOWCHART_SRC}`
    expect(applySetTheme(src, 'dark')).toBe(
      `---\nconfig:\n  theme: dark\nanotherTop: 1\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('readTheme / frontmatterEnd', () => {
    expect(readTheme(FLOWCHART_SRC)).toBe(null)
    expect(readTheme(applySetTheme(FLOWCHART_SRC, 'forest'))).toBe('forest')
    expect(readTheme(`---\nconfig:\n  theme: neutral\n---\nflowchart TD\n`)).toBe('neutral')
    expect(frontmatterEnd(FLOWCHART_SRC)).toBe(0)
    expect(frontmatterEnd(`---\nconfig:\n  theme: dark\n---\nflowchart TD\n`)).toBe('---\nconfig:\n  theme: dark\n---\n'.length)
    expect(isMermaidTheme('dark')).toBe(true)
    expect(isMermaidTheme('nope')).toBe(false)
  })

  it('连续切换主题是幂等重写且正文逐字不变', () => {
    const step1 = applySetTheme(FLOWCHART_SRC, 'dark')
    const step2 = applySetTheme(step1, 'neutral')
    expect(step2).toBe(applySetTheme(FLOWCHART_SRC, 'neutral'))
    expect(step2.endsWith(FLOWCHART_SRC)).toBe(true)
  })
})

describe('frontmatter 被各图种解析器 verbatim 保留', () => {
  const FM = `---\nconfig:\n  theme: dark\n  fontFamily: monospace\n---\n`
  const SEQ_SRC = FM + `sequenceDiagram\n    A->>B: 你好\n`
  const CLASS_SRC = FM + `classDiagram\n    class A\n    A : +x\n`
  const MINDMAP_SRC = FM + `mindmap\n  root((根))\n    子\n`

  const parsers = [
    ['flowchart', flowchartParser, FM + FLOWCHART_SRC],
    ['sequence', sequenceParser, SEQ_SRC],
    ['class', classParser, CLASS_SRC],
    ['mindmap', mindmapParser, MINDMAP_SRC],
  ] as const

  for (const [name, parser, src] of parsers) {
    it(`${name}：带 frontmatter 解析不报错且 verbatim identity`, () => {
      const result = parser.parse(src)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      // frontmatter 块整体为 verbatim（不在任何元素 span 内）
      for (const part of result.doc.parts) {
        if (part.kind === 'element') {
          expect(part.span.start).toBeGreaterThanOrEqual(frontmatterEnd(src))
        }
      }
      // verbatim identity：解析后不做修改再重组装，输出逐字等于输入
      expect(reassemble(result.doc)).toBe(src)
    })

    it(`${name}：正常编辑意图不触碰 frontmatter`, () => {
      const intents = {
        flowchart: { type: 'set-direction', direction: 'LR' },
        sequence: { type: 'add-participant', actorId: 'C' },
        class: { type: 'add-class', name: 'Z' },
        mindmap: { type: 'add-child', parentElementId: 'mindmap-node:1', text: '新叶' },
      } as const
      const intent = intents[name as keyof typeof intents]
      const result = applyEdit(src, parser, intent as never)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.source.startsWith(FM)).toBe(true)
      expect(result.source.slice(0, frontmatterEnd(src))).toBe(src.slice(0, frontmatterEnd(src)))
    })
  }

  it('带 frontmatter 的 mindmap 源码类型识别不受影响', async () => {
    const { detectDiagramType } = await import('../../diagram-registry')
    expect(detectDiagramType(MINDMAP_SRC).id).toBe('mindmap')
    expect(detectDiagramType(SEQ_SRC).id).toBe('sequence')
    expect(detectDiagramType(CLASS_SRC).id).toBe('class')
    expect(detectDiagramType(FM + FLOWCHART_SRC).id).toBe('flowchart')
  })
})

describe('金样合法性：主题产物被 mermaid v12 parse 通过', () => {
  for (const theme of ['default', 'neutral', 'dark', 'forest', 'base'] as const) {
    it(`插入 theme: ${theme} 后 parse 通过`, async () => {
      const source = applySetTheme(FLOWCHART_SRC, theme)
      expect(readTheme(source)).toBe(theme)
      await expect(mermaid.parse(source)).resolves.toBeTruthy()
    })
  }

  it('四种图种 + 已有 frontmatter 更新主题后 parse 通过', async () => {
    const sources = [
      applySetTheme(`---\ntitle: 混合\n---\nflowchart TD\n    A --> B\n`, 'dark'),
      applySetTheme(`---\ntitle: 混合\n---\nsequenceDiagram\n    A->>B: 嗨\n`, 'forest'),
      applySetTheme(`---\ntitle: 混合\n---\nclassDiagram\n    class A\n`, 'neutral'),
      applySetTheme(`---\ntitle: 混合\n---\nmindmap\n  root((根))\n`, 'base'),
    ]
    for (const source of sources) {
      await expect(mermaid.parse(source)).resolves.toBeTruthy()
    }
  })

  it('已有 theme 更新为另一主题后 parse 通过', async () => {
    const source = applySetTheme(`---\nconfig:\n  theme: dark\n---\nflowchart TD\n    A --> B\n`, 'default')
    expect(source).toContain('theme: default')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })
})
