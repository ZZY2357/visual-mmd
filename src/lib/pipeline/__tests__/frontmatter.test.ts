import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { MERMAID_THEMES, applySetTheme, frontmatterEnd, isMermaidTheme, readTheme } from '../frontmatter'
import { flowchartParser } from '../flowchart'
import { sequenceParser } from '../sequence'
import { classParser } from '../class'
import { mindmapParser } from '../mindmap'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'

/**
 * 工单 01：frontmatter 主题配置的手术式落码语义。
 * - 无 frontmatter → 文首插入 `---\nconfig:\n  theme: xxx\n---\n`
 * - 已有 frontmatter → 只新增/改写主题项，其余配置项逐字保留
 * - theme = null（「跟随 Mermaid 默认」）→ 清除主题键，连带清掉悬空的 config / frontmatter
 * - frontmatter 块被全部四个图种解析器 verbatim 保留
 * - 金样：11 个主题的产物都能被 mermaid v12 实际 parse 通过
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
    expect(MERMAID_THEMES).toHaveLength(11)
  })

  it('连续切换主题是幂等重写且正文逐字不变', () => {
    const step1 = applySetTheme(FLOWCHART_SRC, 'dark')
    const step2 = applySetTheme(step1, 'neutral')
    expect(step2).toBe(applySetTheme(FLOWCHART_SRC, 'neutral'))
    expect(step2.endsWith(FLOWCHART_SRC)).toBe(true)
  })

  it('11 个主题：设置 → 回显原文 → 清除后逐字回到原文（往返）', () => {
    for (const theme of MERMAID_THEMES) {
      const set = applySetTheme(FLOWCHART_SRC, theme)
      expect(readTheme(set)).toBe(theme)
      expect(isMermaidTheme(readTheme(set) ?? '')).toBe(true)
      expect(applySetTheme(set, null)).toBe(FLOWCHART_SRC)
    }
  })

  it('readTheme 如实回显手写的非法主题值（不被白名单吞掉）', () => {
    const src = `---\nconfig:\n  theme: solarized\n---\n${FLOWCHART_SRC}`
    expect(readTheme(src)).toBe('solarized')
    expect(isMermaidTheme(readTheme(src) ?? '')).toBe(false)
    // 非法值同样可被清除
    expect(applySetTheme(src, null)).toBe(FLOWCHART_SRC)
  })
})

describe('applySetTheme：清除主题（「跟随 Mermaid 默认」）', () => {
  it('无 frontmatter / 无 config / 无 theme 时清除是恒等变换', () => {
    expect(applySetTheme(FLOWCHART_SRC, null)).toBe(FLOWCHART_SRC)
    expect(applySetTheme(`---\ntitle: 我的图\n---\n${FLOWCHART_SRC}`, null)).toBe(
      `---\ntitle: 我的图\n---\n${FLOWCHART_SRC}`,
    )
    expect(applySetTheme(`---\nconfig:\n  fontFamily: monospace\n---\n${FLOWCHART_SRC}`, null)).toBe(
      `---\nconfig:\n  fontFamily: monospace\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('悬空形态①：config 还有其它子项 → 只删 theme 行', () => {
    const src = `---\ntitle: 我的图\nconfig:\n  theme: dark\n  fontFamily: monospace\n  themeVariables:\n    fontSize: 16px\n---\n${FLOWCHART_SRC}`
    expect(applySetTheme(src, null)).toBe(
      `---\ntitle: 我的图\nconfig:\n  fontFamily: monospace\n  themeVariables:\n    fontSize: 16px\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('悬空形态②：config 再无有效子项 → 连 config 行一起删（frontmatter 保留）', () => {
    const src = `---\ntitle: 我的图\nconfig:\n  theme: dark\n---\n${FLOWCHART_SRC}`
    const out = applySetTheme(src, null)
    expect(out).toBe(`---\ntitle: 我的图\n---\n${FLOWCHART_SRC}`)
    expect(readTheme(out)).toBe(null)
  })

  it('悬空形态②（空行与注释不算有效子项）：config 行被删，注释逐字保留', () => {
    const src = `---\ntitle: 我的图\nconfig:\n  # 我要暗色\n  theme: dark\n\nother: 1\n---\n${FLOWCHART_SRC}`
    expect(applySetTheme(src, null)).toBe(
      `---\ntitle: 我的图\n  # 我要暗色\n\nother: 1\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('悬空形态③：frontmatter 因此无有效内容 → 连整块一起删（回到无 frontmatter）', () => {
    const src = `---\nconfig:\n  theme: dark\n---\n${FLOWCHART_SRC}`
    const out = applySetTheme(src, null)
    expect(out).toBe(FLOWCHART_SRC)
    expect(frontmatterEnd(out)).toBe(0)

    // 只剩空行 / 注释时同样整块删除
    expect(applySetTheme(`---\nconfig:\n  theme: dark\n\n---\n${FLOWCHART_SRC}`, null)).toBe(FLOWCHART_SRC)
    expect(applySetTheme(`---\nconfig:\n  theme: dark\n  # 备注\n---\n${FLOWCHART_SRC}`, null)).toBe(FLOWCHART_SRC)
  })

  it('清除后 frontmatter 变空但正文逐字保留（含 CRLF 换行）', () => {
    const src = `---\r\nconfig:\r\n  theme: dark\r\n---\r\n${FLOWCHART_SRC.replace(/\n/g, '\r\n')}`
    expect(applySetTheme(src, null)).toBe(FLOWCHART_SRC.replace(/\n/g, '\r\n'))
  })

  it('空值的 theme 键（`theme:`）视作无主题，清除时删掉该行', () => {
    const src = `---\nconfig:\n  theme:\n  fontFamily: monospace\n---\n${FLOWCHART_SRC}`
    expect(readTheme(src)).toBe(null)
    expect(applySetTheme(src, null)).toBe(`---\nconfig:\n  fontFamily: monospace\n---\n${FLOWCHART_SRC}`)
  })
})

/**
 * 工单 08 口径（用户 2026-09-29 裁定）：frontmatter **顶层** `theme:` 行视为无效文本。
 * 依据：mermaid 12 的 extractFrontMatter 只从 YAML 里取 `title` / `displayMode` / `config`
 * 三个键（node_modules/mermaid/dist/mermaid.esm.mjs），顶层 `theme:` 被静默丢弃；
 * 合法写法只有 `config.theme`。因此编辑器不识别、也不清除它 —— 它属于「未被编辑触碰的
 * 文本」，受 ADR-0004/0008 的逐字保留承诺保护，也不额外给「无效写法」UI 告警。
 * 浏览器实测与证据见 .scratch/editor-polish/issues/08-theme-toplevel-key-not-cleared.md。
 */
describe('顶层 `theme:` 视为无效文本（工单 08 口径）', () => {
  const TOPLEVEL = `---\ntheme: forest\n---\n${FLOWCHART_SRC}`
  const BOTH = `---\ntheme: forest\nconfig:\n  theme: dark\n---\n${FLOWCHART_SRC}`

  it('只有顶层 theme:（无 config）→ readTheme 返回 null，选择器照旧显示「跟随」', () => {
    expect(readTheme(TOPLEVEL)).toBe(null)
    expect(readTheme(`---\ntheme: dark\nfontFamily: monospace\n---\n${FLOWCHART_SRC}`)).toBe(null)
  })

  it('选「跟随」（theme = null）→ 顶层 theme 行逐字保留，源码恒等不变', () => {
    expect(applySetTheme(TOPLEVEL, null)).toBe(TOPLEVEL)
    // 含多余空格/缩进的顶层行同样逐字保留
    expect(applySetTheme(`---\ntheme:  forest  \n---\n${FLOWCHART_SRC}`, null)).toBe(
      `---\ntheme:  forest  \n---\n${FLOWCHART_SRC}`,
    )
  })

  it('设置主题 → 落码到 config.theme，顶层 theme 行仍逐字保留', () => {
    // 只有顶层行：在其后追加 config 块（既有行一字不动）
    expect(applySetTheme(TOPLEVEL, 'dark')).toBe(
      `---\ntheme: forest\nconfig:\n  theme: dark\n---\n${FLOWCHART_SRC}`,
    )
    // 已有 config.theme：只改写 config 下那一行
    expect(applySetTheme(BOTH, 'neutral')).toBe(
      `---\ntheme: forest\nconfig:\n  theme: neutral\n---\n${FLOWCHART_SRC}`,
    )
  })

  it('顶层与 config.theme 并存 → readTheme 取 config.theme（顶层被忽略）', () => {
    expect(readTheme(BOTH)).toBe('dark')
    expect(readTheme(applySetTheme(TOPLEVEL, 'dark'))).toBe('dark')
  })

  it('顶层与 config.theme 并存 → 清除只删 config.theme（连带悬空 config 行），顶层行逐字保留', () => {
    // config 下只剩 theme：config 行随 theme 行一起删，frontmatter 因顶层行仍有效而保留
    expect(applySetTheme(BOTH, null)).toBe(`---\ntheme: forest\n---\n${FLOWCHART_SRC}`)
    // config 下还有其它子项：只删 config.theme
    expect(
      applySetTheme(
        `---\ntheme: forest\nconfig:\n  theme: dark\n  fontFamily: monospace\n---\n${FLOWCHART_SRC}`,
        null,
      ),
    ).toBe(`---\ntheme: forest\nconfig:\n  fontFamily: monospace\n---\n${FLOWCHART_SRC}`)
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
      const intent = intents[name]
      const result = applyEdit(src, parser, intent)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.source.startsWith(FM)).toBe(true)
      expect(result.source.slice(0, frontmatterEnd(src))).toBe(src.slice(0, frontmatterEnd(src)))
    })
  }

  it('带 frontmatter 的 mindmap 源码类型识别不受影响', async () => {
    const { detectDiagramType } = await import('../../diagram-registry')
    expect(detectDiagramType(MINDMAP_SRC)?.id).toBe('mindmap')
    expect(detectDiagramType(SEQ_SRC)?.id).toBe('sequence')
    expect(detectDiagramType(CLASS_SRC)?.id).toBe('class')
    expect(detectDiagramType(FM + FLOWCHART_SRC)?.id).toBe('flowchart')
  })
})

describe('金样合法性：11 个主题的产物都能被 mermaid v12 parse 通过', () => {
  for (const theme of MERMAID_THEMES) {
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

  it('清除主题后的产物（回到无 frontmatter）仍 parse 通过', async () => {
    const set = applySetTheme(`---\ntitle: 混合\nconfig:\n  theme: neo\n---\nflowchart TD\n    A --> B\n`, 'neo')
    const cleared = applySetTheme(set, null)
    expect(cleared).toBe(`---\ntitle: 混合\n---\nflowchart TD\n    A --> B\n`)
    await expect(mermaid.parse(cleared)).resolves.toBeTruthy()
  })

  it('已有 theme 更新为另一主题后 parse 通过', async () => {
    const source = applySetTheme(`---\nconfig:\n  theme: dark\n---\nflowchart TD\n    A --> B\n`, 'default')
    expect(source).toContain('theme: default')
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })
})
