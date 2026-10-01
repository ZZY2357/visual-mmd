import { describe, expect, it } from 'vitest'
import { isValidVennLabel, isValidVennSetId, isValidVennSize, vennParser, type VennAreaData } from '../venn'
import { reassemble, type SourceDocument } from '../document'

/**
 * venn 解析器测试（more-diagrams 工单 21，语法事实以
 * .scratch/more-diagrams/research/venn.md 为准——工单 21 已实测复核）：
 * 解析（verbatim identity）、意图往返、逐字保留、非法源码 / 非法编辑边界。
 */

function parse(source: string): SourceDocument {
  const result = vennParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

const SAMPLE = `venn-beta
    title 团队技能
    set frontend["前端"]
    set backend["后端"]
    union frontend,backend["全栈"]
`

/** 解析 → 应用意图 → 重组装 → 再解析（形状不变式由二次解析断言） */
function apply(doc: SourceDocument, intent: Parameters<typeof vennParser.resolveRewrites>[1]): SourceDocument {
  const rewrites = vennParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return parse(reassemble(doc, rewrites))
}

describe('venn 解析（more-diagrams 工单 21）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('声明头：只有小写 venn-beta（探测器大小写敏感，无 (-beta)? 分支）', () => {
    expect(parse('venn-beta\n').elements[0]?.element.kind).toBe('venn-header')
    // 裸 venn / 大小写变体都不认领（首行不是 venn-beta 即解析失败）
    expect(vennParser.parse('venn\n    set a\n').ok).toBe(false)
    expect(vennParser.parse('VENN-BETA\n').ok).toBe(false)
  })

  it('缺表头：解析失败并报首行', () => {
    const result = vennParser.parse('set a\n')
    if (result.ok) throw new Error('缺表头必须解析失败')
    expect(result.error.line).toBe(1)
  })

  it('title：解析为 venn-title，文本到注释起点，引号不剥离（research 坑 6）', () => {
    const doc = parse('venn-beta\n    title "带引号"\n')
    const title = doc.elements.find((p) => p.element.kind === 'venn-title')
    expect(title?.element).toMatchObject({ kind: 'venn-title', text: '"带引号"' })
  })

  it('set：label 可选、尺寸可选，refs / labelRaw 逐字保留', () => {
    const doc = parse('venn-beta\n    set a["甲"]: 12\n    set b\n')
    const areas = doc.elements
      .filter((p) => p.element.kind === 'venn-set')
      .map((p) => ({ id: p.id, element: p.element as VennAreaData }))
    expect(areas).toHaveLength(2)
    expect(areas[0].id).toBe('venn-set:a')
    expect(areas[0].element).toMatchObject({ refs: 'a', labelRaw: '["甲"]', size: '12' })
    expect(areas[1].element).toMatchObject({ refs: 'b', labelRaw: null, size: null })
  })

  it('union：走位置序身份 venn-union:N（1 基文档序，ADR-0012）', () => {
    const doc = parse('venn-beta\n    set a\n    set b\n    set c\n    union a,b\n    union a,c["甲"]\n')
    const unions = doc.elements.filter((p) => p.element.kind === 'venn-union')
    expect(unions.map((p) => p.id)).toEqual(['venn-union:1', 'venn-union:2'])
    expect((unions[1].element as VennAreaData).refs).toBe('a,c')
    expect((unions[1].element as VennAreaData).labelRaw).toBe('["甲"]')
  })

  it('text 与 style 行：不解析为元素，逐字保留（画布不可寻址，工单 21 降级定案）', () => {
    const source = 'venn-beta\n    set a["甲"]\n    text a["注"]\n    style a fill:#f00\n'
    const doc = parse(source)
    expect(doc.elements.some((p) => p.element.kind === 'venn-text')).toBe(false)
    expect(reassemble(doc)).toBe(source)
  })

  it('缩进的 set / union 照常解析（缩进量不影响语义，research §2 模板即缩进书写）', () => {
    const source = 'venn-beta\n    set a\n        set b\n'
    const doc = parse(source)
    expect(doc.elements.filter((p) => p.element.kind === 'venn-set')).toHaveLength(2)
    expect(reassemble(doc)).toBe(source)
  })

  it('indent 原文逐字保留（改写时原样搬运）', () => {
    const source = 'venn-beta\n    set a["甲"]\n'
    const doc = parse(source)
    const set = doc.elements.find((p) => p.element.kind === 'venn-set')
    expect((set?.element as VennAreaData).indent).toBe('    ')
    expect(reassemble(doc)).toBe(source)
  })

  it('块注释与行内注释：逐字保留，不影响元素解析', () => {
    const source = 'venn-beta\n    %% 注释行\n    set a["甲"] %% 行内注释\n'
    const doc = parse(source)
    expect(doc.elements.filter((p) => p.element.kind === 'venn-set')).toHaveLength(1)
    expect(reassemble(doc)).toBe(source)
  })
})

describe('venn 非法边界：整行不认、逐字保留（不与 mermaid 争报错）', () => {
  const INVALID_LINES = [
    'set A:1,5', // 千分位逗号（research 坑 7）
    'set a["未完', // 引号未闭合
    'set a["甲"] 多余', // 标签后跟别的内容
    'union a', // 单 id 交集（语法要求 ≥2）
    'set', // 缺 id
  ]
  for (const line of INVALID_LINES) {
    it(`「${line}」整行不认并逐字保留`, () => {
      const source = `venn-beta\n    set a\n    ${line}\n`
      const doc = parse(source)
      // 只认「set a」一行；非法行不产生元素（重建后逐字相同）
      expect(reassemble(doc)).toBe(source)
    })
  }
})

describe('venn 编辑意图往返（more-diagrams 工单 21）', () => {
  it('set-label：改标签、保留原有引号风格；label 为空串由意图 null 表达删除', () => {
    let doc = parse(SAMPLE)
    doc = apply(doc, { type: 'set-label', elementId: 'venn-set:frontend', label: '前端开发' })
    expect(doc.source).toContain('set frontend["前端开发"]')
    doc = apply(doc, { type: 'set-label', elementId: 'venn-set:frontend', label: null })
    expect(doc.source).toContain('set frontend\n')
  })

  it('set-size：设尺寸 / size 为 null 删除尺寸段', () => {
    let doc = parse(SAMPLE)
    doc = apply(doc, { type: 'set-size', elementId: 'venn-set:frontend', size: '20' })
    expect(doc.source).toContain('set frontend["前端"]: 20')
    doc = apply(doc, { type: 'set-size', elementId: 'venn-set:frontend', size: null })
    expect(doc.source).toContain('set frontend["前端"]\n')
  })

  it('set-size：非法尺寸（含千分位逗号）被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(vennParser.resolveRewrites(doc, { type: 'set-size', elementId: 'venn-set:frontend', size: '1,5' })).toBeNull()
  })

  it('set-title：无标题行时紧随声明头插入（缩进随锚点行，与 pie 同口径）', () => {
    const doc = apply(parse('venn-beta\n    set a\n'), { type: 'set-title', text: '新标题' })
    expect(doc.source).toBe('venn-beta\ntitle 新标题\n    set a\n')
  })

  it('add-set：追加一行 set，锚点缺省文档末尾', () => {
    const doc = apply(parse('venn-beta\n    set a\n'), { type: 'add-set', id: 'b', label: '乙' })
    expect(doc.source).toContain('set b["乙"]')
    expect(doc.elements.filter((p) => p.element.kind === 'venn-set')).toHaveLength(2)
  })

  it('add-union：≥2 个 id；单 id 被拒绝', () => {
    const doc = parse('venn-beta\n    set a\n    set b\n')
    expect(vennParser.resolveRewrites(doc, { type: 'add-union', ids: ['a'] })).toBeNull()
    const next = apply(doc, { type: 'add-union', ids: ['a', 'b'], label: '全栈' })
    expect(next.source).toContain('union a,b["全栈"]')
  })

  it('delete-area：删集合 / 删交集（删集合连带删交集由管线级联负责）', () => {
    let doc = parse(SAMPLE)
    doc = apply(doc, { type: 'delete-area', elementId: 'venn-union:1' })
    expect(doc.source).not.toContain('union frontend,backend')
    doc = apply(doc, { type: 'delete-area', elementId: 'venn-set:backend' })
    expect(doc.source).not.toContain('set backend')
  })

  it('delete-area：删集合级联删去引用它的交集（避免悬空 id 让 mermaid 整图报错）', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-area', elementId: 'venn-set:backend' })
    expect(doc.source).not.toContain('set backend')
    // 引用 backend 的 union frontend,backend 一并删除（research 坑 2：unknown set identifier）
    expect(doc.source).not.toContain('union frontend,backend')
  })

  it('delete-area：删交集只删该行，不动集合', () => {
    const doc = apply(parse(SAMPLE), { type: 'delete-area', elementId: 'venn-union:1' })
    expect(doc.source).not.toContain('union frontend,backend')
    expect(doc.source).toContain('set frontend')
    expect(doc.source).toContain('set backend')
  })

  it('set-label：空标签 / 含引号被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(vennParser.resolveRewrites(doc, { type: 'set-label', elementId: 'venn-set:frontend', label: '   ' })).toBeNull()
    expect(vennParser.resolveRewrites(doc, { type: 'set-label', elementId: 'venn-set:frontend', label: 'a"b' })).toBeNull()
  })
})

describe('venn 词法校验助手（表单侧）', () => {
  it('isValidVennSetId：裸 id 词法', () => {
    expect(isValidVennSetId('frontend')).toBe(true)
    expect(isValidVennSetId('_a-1')).toBe(true)
    expect(isValidVennSetId('1a')).toBe(false)
    expect(isValidVennSetId('a b')).toBe(false)
  })

  it('isValidVennLabel：非空、无引号换行', () => {
    expect(isValidVennLabel('前端')).toBe(true)
    expect(isValidVennLabel('   ')).toBe(false)
    expect(isValidVennLabel('a"b')).toBe(false)
    expect(isValidVennLabel("a'b")).toBe(false)
  })

  it('isValidVennSize：mermaid NUMERIC（无千分位逗号）', () => {
    expect(isValidVennSize('12')).toBe(true)
    expect(isValidVennSize('-3.5')).toBe(true)
    expect(isValidVennSize('.5')).toBe(true)
    expect(isValidVennSize('1,5')).toBe(false)
    expect(isValidVennSize('abc')).toBe(false)
  })
})
