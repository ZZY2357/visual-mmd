import { describe, expect, it } from 'vitest'
import { ishikawaParser, type IshikawaNodeData } from '../ishikawa'
import { reassemble, type SourceDocument } from '../document'

/**
 * ishikawa 解析器测试（more-diagrams 工单 22，语法事实以
 * .scratch/more-diagrams/research/ishikawa.md 为准——缩进行式，**不是** frontmatter）：
 * 解析（verbatim identity）、意图往返、逐字保留、非法源码/非法编辑边界。
 */

function parse(source: string): SourceDocument {
  const result = ishikawaParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

const SAMPLE = `ishikawa-beta
    照片模糊
    人
        手抖
        没按稳
    设备
        镜头脏
`

describe('ishikawa 解析（more-diagrams 工单 22）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('声明行：ishikawa 与 ishikawa-beta 都认，且大小写不敏感（research §1）', () => {
    for (const keyword of ['ishikawa', 'ishikawa-beta', 'ISHIKAWA', 'Ishikawa-Beta']) {
      const doc = parse(`${keyword}\n    甲\n`)
      expect(doc.elements[0]?.element.kind).toBe('ishikawa-header')
    }
  })

  it('缺声明行：解析失败并报首行', () => {
    const result = ishikawaParser.parse('    甲\n')
    if (result.ok) throw new Error('缺声明行必须解析失败')
    expect(result.error.line).toBe(1)
  })

  it('第一行正文 = 鱼头（root，depth 0），其缩进不参与层级（research 坑 1）', () => {
    const doc = parse('ishikawa-beta\n        照片模糊\n    人\n        手抖\n')
    const nodes = doc.elements.filter((p) => p.element.kind === 'ishikawa-node')
    const first = nodes[0].element as IshikawaNodeData
    expect(first.isRoot).toBe(true)
    expect(first.depth).toBe(0)
    expect(first.text).toBe('照片模糊')
  })

  it('层级是相对缩进：以第一条主因缩进为基准（research 坑 1/6.1），宽度不必等距', () => {
    // 第一条主因「人」缩进 4 = baseLevel → level 1；分支缩进 8 → level = 8-4+1 = 5；
    // 「设备」缩进 4 → level 1（mermaid 的 level 是原始差值 +1，**不连续**：
    // 4 空格一档时是 1、5、9……——组树只依赖单调比较）
    const doc = parse(SAMPLE)
    const depths = doc.elements
      .filter((p) => p.element.kind === 'ishikawa-node')
      .map((p) => (p.element as IshikawaNodeData).depth)
    expect(depths).toEqual([0, 1, 5, 5, 1, 5])
  })

  it('缩进宽度 = 字符数（tab 算 1，research 坑 2）；baseLevel 相对比较', () => {
    // 主因用 tab（宽 1）、分支用 tab+tab（宽 2）：level = 2 - 1 + 1 = 2
    const src = 'ishikawa\n问题\n\t甲\n\t\t乙\n'
    const doc = parse(src)
    const nodes = doc.elements.filter((p) => p.element.kind === 'ishikawa-node')
    expect((nodes[0].element as IshikawaNodeData).depth).toBe(0)
    expect((nodes[1].element as IshikawaNodeData).depth).toBe(1)
    expect((nodes[2].element as IshikawaNodeData).depth).toBe(2)
    expect(reassemble(doc)).toBe(src)
  })
  it('缩进比基准浅的正文行归 level 1（`<= 0 归 1`，research 坑 1）', () => {
    const src = 'ishikawa\n问题\n        甲\n    乙\n'
    const doc = parse(src)
    const nodes = doc.elements.filter((p) => p.element.kind === 'ishikawa-node')
    // baseLevel = 8（甲），乙缩进 4 → level = 4 - 8 + 1 = -3 → 归 1
    expect((nodes[1].element as IshikawaNodeData).depth).toBe(1)
    expect((nodes[2].element as IshikawaNodeData).depth).toBe(1)
    expect(reassemble(doc)).toBe(src)
  })

  it('行内 %% 不是注释（成为文本，research 坑 3）；行首 %% 才是注释', () => {
    const src = 'ishikawa\n    甲 %% 不是注释\n    %% 是注释\n    乙\n'
    const doc = parse(src)
    const nodes = doc.elements.filter((p) => p.element.kind === 'ishikawa-node')
    expect(nodes).toHaveLength(2)
    expect((nodes[0].element as IshikawaNodeData).text).toBe('甲 %% 不是注释')
    expect(reassemble(doc)).toBe(src)
  })

  it('空行 / 缩进注释 / frontmatter 逐字保留（ADR-0008 / research §5）', () => {
    const src = '---\ntitle: 示例\n---\n\nishikawa-beta\n    照片模糊\n\n    %% 缩进注释\n    人\n        手抖\n'
    expect(reassemble(parse(src))).toBe(src)
  })

  it('空白行不参与层级；只有声明行时不报错但也无节点（research 坑 7）', () => {
    const doc = parse('ishikawa-beta\n\n   \n')
    expect(doc.elements.filter((p) => p.element.kind === 'ishikawa-node')).toHaveLength(0)
    expect(reassemble(doc)).toBe('ishikawa-beta\n\n   \n')
  })
})

describe('ishikawa 意图往返', () => {
  it('set-node-text：只重写该行，其余逐字保留', () => {
    const doc = parse(SAMPLE)
    const rewrites = ishikawaParser.resolveRewrites(doc, {
      type: 'set-node-text',
      elementId: 'ishikawa-node:3',
      text: '手一直抖',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('        手一直抖')
    expect(next).not.toContain('手抖\n')
    expect(ishikawaParser.parse(next).ok).toBe(true)
  })

  it('set-node-text：空文本 / 含换行被拒绝', () => {
    const doc = parse(SAMPLE)
    expect(ishikawaParser.resolveRewrites(doc, { type: 'set-node-text', elementId: 'ishikawa-node:3', text: '  ' })).toBeNull()
    expect(ishikawaParser.resolveRewrites(doc, { type: 'set-node-text', elementId: 'ishikawa-node:3', text: 'a\nb' })).toBeNull()
  })

  it('add-child：挂到目标子树末尾之后，缩进深一档', () => {
    const doc = parse(SAMPLE)
    const rewrites = ishikawaParser.resolveRewrites(doc, {
      type: 'add-child',
      parentElementId: 'ishikawa-node:2',
      text: '紧张',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    // 跟随既有子节点缩进（8 空格），插在「没按稳」之后、设备之前
    expect(next).toContain('        没按稳\n        紧张\n')
    const reparsed = ishikawaParser.parse(next)
    if (!reparsed.ok) throw new Error('往返后必须可解析')
    const depths = reparsed.doc.elements
      .filter((p) => p.element.kind === 'ishikawa-node')
      .map((p) => (p.element as IshikawaNodeData).depth)
    expect(depths).toEqual([0, 1, 5, 5, 5, 1, 5])
  })

  it('add-child：目标无既有子节点时，缩进在父行基础上加一档', () => {
    const doc = parse(SAMPLE)
    const rewrites = ishikawaParser.resolveRewrites(doc, {
      type: 'add-child',
      parentElementId: 'ishikawa-node:5',
      text: '反光',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    const reparsed = ishikawaParser.parse(next)
    if (!reparsed.ok) throw new Error('往返后必须可解析')
    const nodes = reparsed.doc.elements.filter((p) => p.element.kind === 'ishikawa-node')
    const added = nodes[nodes.length - 1].element as IshikawaNodeData
    expect(added.text).toBe('反光')
    // 设备缩进 4 → 其子缩进 8，level = 8 - 4 + 1 = 5（基准确认：baseLevel = 4 = 人）
    expect(added.depth).toBe(5)
  })

  it('add-sibling：同缩进，落在目标子树之后', () => {
    const doc = parse(SAMPLE)
    const rewrites = ishikawaParser.resolveRewrites(doc, {
      type: 'add-sibling',
      elementId: 'ishikawa-node:2',
      text: '流程',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    // 「人」子树（手抖/没按稳）整体之后、设备之前，缩进 4
    expect(next).toContain('        没按稳\n    流程\n    设备\n')
    expect(ishikawaParser.parse(next).ok).toBe(true)
  })

  it('delete-node：连同子树一起删除，其余逐字保留', () => {
    const doc = parse(SAMPLE)
    const rewrites = ishikawaParser.resolveRewrites(doc, { type: 'delete-node', elementId: 'ishikawa-node:2' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('人\n')
    expect(next).not.toContain('手抖')
    expect(next).toContain('设备')
    expect(next).toContain('    照片模糊\n')
    expect(ishikawaParser.parse(next).ok).toBe(true)
  })

  it('delete-node：鱼头不可删除（工单定案）', () => {
    const doc = parse(SAMPLE)
    expect(ishikawaParser.resolveRewrites(doc, { type: 'delete-node', elementId: 'ishikawa-node:1' })).toBeNull()
  })

  it('目标不存在 / 意图不认领 → null（绝不产出非法 mermaid）', () => {
    const doc = parse(SAMPLE)
    expect(ishikawaParser.resolveRewrites(doc, { type: 'set-node-text', elementId: 'ishikawa-node:99', text: 'x' })).toBeNull()
    expect(ishikawaParser.resolveRewrites(doc, { type: 'delete-node', elementId: 'ishikawa-node:99' })).toBeNull()
    expect(ishikawaParser.resolveRewrites(doc, { type: '不认识的意图' })).toBeNull()
  })
})
