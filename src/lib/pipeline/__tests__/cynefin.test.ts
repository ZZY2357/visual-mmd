import { describe, expect, it } from 'vitest'
import {
  cynefinParser,
  isCynefinDomain,
  isValidCynefinItemText,
  type CynefinItemData,
  type CynefinTransitionData,
} from '../cynefin'
import { reassemble, type SourceDocument } from '../document'

/**
 * cynefin 解析器测试（more-diagrams 工单 25，语法事实以
 * .scratch/more-diagrams/research/cynefin.md 为准——Langium 图种，**不是** frontmatter）：
 * 解析（verbatim identity）、域内归属（按位置，非 `in` 锚点）、意图往返、逐字保留、
 * 非法源码/非法编辑边界。
 */

function parse(source: string): SourceDocument {
  const result = cynefinParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

const SAMPLE = `cynefin-beta
  title 事件响应分类

  complex
    "排查根因"
    "运行混沌实验"

  complicated
    "分析性能数据"

  clear
    "重启服务"

  chaotic
    "立即呼叫值班"

  confusion
    "未知故障模式"

  complex --> complicated : "模式已识别"
  clear --> chaotic : "自满"
`

const itemsOf = (doc: SourceDocument): CynefinItemData[] =>
  doc.elements.filter((p) => p.element.kind === 'cynefin-item').map((p) => p.element as CynefinItemData)
const transitionsOf = (doc: SourceDocument): CynefinTransitionData[] =>
  doc.elements
    .filter((p) => p.element.kind === 'cynefin-transition')
    .map((p) => p.element as CynefinTransitionData)

describe('cynefin 解析（more-diagrams 工单 25）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('声明行：cynefin-beta 与带尾冒号变体都认；大小写敏感（research §8.3）', () => {
    for (const keyword of ['cynefin-beta', 'cynefin-beta:']) {
      const doc = parse(`${keyword}\n  complex\n`)
      expect(doc.elements[0]?.element.kind).toBe('cynefin-header')
    }
    // 大写不算表头（检测与语法均大小写敏感）：缺声明行 → 解析失败，与 mermaid 口径一致
    const result = cynefinParser.parse('Cynefin-Beta\n  complex\n')
    expect(result.ok).toBe(false)
  })

  it('缺声明行：解析失败并报首行', () => {
    const result = cynefinParser.parse('  complex\n    "a"\n')
    if (result.ok) throw new Error('缺声明行必须解析失败')
    expect(result.error.line).toBe(1)
  })

  it('五个固定域各出域名词行元素（顺序无关，可缩进）', () => {
    const doc = parse('cynefin-beta\ncomplex\ncomplicated\nchaotic\nclear\nconfusion\n')
    const domains = doc.elements
      .filter((p) => p.element.kind === 'cynefin-domain')
      .map((p) => (p.element as unknown as { domain: string }).domain)
    expect(domains).toEqual(['complex', 'complicated', 'chaotic', 'clear', 'confusion'])
  })

  it('条目归属纯由位置决定：跟最近前序域名词行（research §8.2——无 `in` 锚点）', () => {
    const doc = parse('cynefin-beta\ncomplex\n  "a"\n  "b"\nclear\n  "c"\n')
    const items = itemsOf(doc)
    expect(items.map((i) => [i.domain, i.text])).toEqual([
      ['complex', 'a'],
      ['complex', 'b'],
      ['clear', 'c'],
    ])
  })

  it('双引号 / 单引号条目都认，引号风格逐字保留', () => {
    const doc = parse(`cynefin-beta\ncomplex\n  "双"\n  '单'\n`)
    const items = itemsOf(doc)
    expect(items.map((i) => [i.quote, i.text])).toEqual([
      ['"', '双'],
      ["'", '单'],
    ])
    expect(reassemble(doc)).toBe(`cynefin-beta\ncomplex\n  "双"\n  '单'\n`)
  })

  it('裸词条目不是条目行（research 坑 1：须引号）——逐字保留不报错', () => {
    const src = 'cynefin-beta\ncomplex\n  裸词\n'
    const doc = parse(src)
    expect(itemsOf(doc)).toHaveLength(0)
    expect(reassemble(doc)).toBe(src)
  })

  it('转移：带标签与无标签都认；端点只能是域名词（research 坑 6）', () => {
    const doc = parse('cynefin-beta\ncomplex --> clear : "x"\ncomplicated --> chaotic\n')
    const transitions = transitionsOf(doc)
    expect(transitions.map((t) => [t.from, t.to, t.label])).toEqual([
      ['complex', 'clear', 'x'],
      ['complicated', 'chaotic', ''],
    ])
  })

  it('转移端点非域名词 → 不是转移行（逐字保留）', () => {
    const src = 'cynefin-beta\ncomplex --> foo\n'
    const doc = parse(src)
    expect(transitionsOf(doc)).toHaveLength(0)
    expect(reassemble(doc)).toBe(src)
  })

  it('文档级 title / accTitle: / accDescr: 整行可寻址', () => {
    const doc = parse('cynefin-beta\n  title 事件响应\n  accTitle: 可访问标题\n  accDescr: 描述\n')
    const docs = doc.elements.filter((p) => p.element.kind === 'cynefin-doc')
    expect(docs.map((p) => p.id)).toEqual(['cynefin-doc:1', 'cynefin-doc:2', 'cynefin-doc:3'])
  })

  it('空行 / %% 注释 / %%{init}%% 指令 / frontmatter 逐字保留（ADR-0008 / research §5）', () => {
    const src =
      '---\nconfig:\n  cynefin:\n    width: 800\n---\ncynefin-beta\n  %%{init: {}}%%\n\n  complex\n    %% 注释\n    "a"\n'
    expect(reassemble(parse(src))).toBe(src)
  })

  it('只有声明行（无域无条目无转移）：解析成功但无元素（空文档合法）', () => {
    const doc = parse('cynefin-beta\n\n   \n')
    expect(doc.elements.filter((p) => p.element.kind === 'cynefin-domain')).toHaveLength(0)
    expect(reassemble(doc)).toBe('cynefin-beta\n\n   \n')
  })
})

describe('cynefin 判定与校验辅助', () => {
  it('isCynefinDomain：五固定域为真，其余为假（大小写敏感）', () => {
    for (const d of ['complex', 'complicated', 'chaotic', 'clear', 'confusion']) expect(isCynefinDomain(d)).toBe(true)
    expect(isCynefinDomain('Complex')).toBe(false)
    expect(isCynefinDomain('foo')).toBe(false)
  })

  it('isValidCynefinItemText：非空、单行、不含引号', () => {
    expect(isValidCynefinItemText('排查根因')).toBe(true)
    expect(isValidCynefinItemText('')).toBe(false)
    expect(isValidCynefinItemText('a\nb')).toBe(false)
    expect(isValidCynefinItemText('含"引号')).toBe(false)
  })
})

describe('cynefin 意图往返', () => {
  it('set-item-text：只重写该行，保留缩进与引号风格', () => {
    const doc = parse(SAMPLE)
    const rewrites = cynefinParser.resolveRewrites(doc, {
      type: 'set-item-text',
      elementId: 'cynefin-item:1',
      text: '定位根因',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('    "定位根因"')
    expect(next).not.toContain('排查根因')
    expect(cynefinParser.parse(next).ok).toBe(true)
  })

  it('set-item-text：空文本 / 含引号 / 含换行被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(cynefinParser.resolveRewrites(doc, { type: 'set-item-text', elementId: 'cynefin-item:1', text: '' })).toBeNull()
    expect(cynefinParser.resolveRewrites(doc, { type: 'set-item-text', elementId: 'cynefin-item:1', text: 'a"b' })).toBeNull()
  })

  it('add-item：锚到域名词行之后；往返后可解析且归属正确', () => {
    const doc = parse(SAMPLE)
    const rewrites = cynefinParser.resolveRewrites(doc, {
      type: 'add-item',
      domain: 'complex',
      text: '画因果图',
      afterElementId: 'cynefin-domain:complex',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    const reparsed = cynefinParser.parse(next)
    if (!reparsed.ok) throw new Error('往返后必须可解析')
    // 新条目落在 complex 域内（紧随域名词行，归属 complex）
    expect(itemsOf(reparsed.doc)[0]).toMatchObject({ domain: 'complex', text: '画因果图' })
  })

  it('delete-item：只摘除该行，其余逐字保留', () => {
    const doc = parse(SAMPLE)
    const rewrites = cynefinParser.resolveRewrites(doc, { type: 'delete-item', elementId: 'cynefin-item:2' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('运行混沌实验')
    expect(next).toContain('排查根因')
    expect(cynefinParser.parse(next).ok).toBe(true)
  })

  it('add-transition：落在文档末尾，往返后可解析', () => {
    const doc = parse(SAMPLE)
    const rewrites = cynefinParser.resolveRewrites(doc, {
      type: 'add-transition',
      from: 'complicated',
      to: 'chaotic',
      label: '失控',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('complicated --> chaotic : "失控"')
    expect(cynefinParser.parse(next).ok).toBe(true)
  })

  it('add-transition：端点非域名词被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(
      cynefinParser.resolveRewrites(doc, {
        type: 'add-transition',
        from: 'foo' as never,
        to: 'clear',
      }),
    ).toBeNull()
  })

  it('set-transition：改标签与端点；自环（from === to）被拒绝（research 坑 5）', () => {
    const doc = parse(SAMPLE)
    const labelRewrites = cynefinParser.resolveRewrites(doc, {
      type: 'set-transition',
      elementId: 'cynefin-transition:1',
      label: '模式稳定',
    })
    expect(labelRewrites).not.toBeNull()
    const next = reassemble(doc, labelRewrites!)
    expect(next).toContain('complex --> complicated : "模式稳定"')
    // 自环拒绝
    expect(
      cynefinParser.resolveRewrites(doc, { type: 'set-transition', elementId: 'cynefin-transition:1', to: 'complex' }),
    ).toBeNull()
  })

  it('delete-transition：摘除转移行', () => {
    const doc = parse(SAMPLE)
    const rewrites = cynefinParser.resolveRewrites(doc, { type: 'delete-transition', elementId: 'cynefin-transition:1' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('complex --> complicated')
    expect(cynefinParser.parse(next).ok).toBe(true)
  })

  it('delete-doc-line：摘除文档属性行', () => {
    const doc = parse(SAMPLE)
    const rewrites = cynefinParser.resolveRewrites(doc, { type: 'delete-doc-line', elementId: 'cynefin-doc:1' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('title 事件响应分类')
    expect(cynefinParser.parse(next).ok).toBe(true)
  })

  it('目标不存在 / 意图不认领 → null（绝不产出非法 mermaid）', () => {
    const doc = parse(SAMPLE)
    expect(cynefinParser.resolveRewrites(doc, { type: 'set-item-text', elementId: 'cynefin-item:99', text: 'x' })).toBeNull()
    expect(cynefinParser.resolveRewrites(doc, { type: 'delete-item', elementId: 'cynefin-item:99' })).toBeNull()
    expect(cynefinParser.resolveRewrites(doc, { type: '不认识的意图' })).toBeNull()
  })
})
