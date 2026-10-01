import { describe, expect, it } from 'vitest'
import { treemapParser, type TreemapNodeData } from '../treemap'
import { reassemble, type SourceDocument } from '../document'

/**
 * treemap 解析器测试（more-diagrams 工单 20，语法事实以
 * .scratch/more-diagrams/research/treemap.md 为准）：
 * 解析（verbatim identity）、意图往返、逐字保留、非法源码/非法编辑边界。
 */

function parse(source: string): SourceDocument {
  const result = treemapParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}（行 ${result.error.line}）`)
  return result.doc
}

const SAMPLE = `treemap
"预算分配"
    "运营"
        "人力": 700000
        "设备": 200000
    "市场"
        "广告": 400000
        "活动": 100000
`

describe('treemap 解析（more-diagrams 工单 20）', () => {
  it('verbatim identity：解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parse(SAMPLE))).toBe(SAMPLE)
  })

  it('表头：treemap 与 treemap-beta 两个关键字都认（research §1；Langium 关键字大小写敏感）', () => {
    for (const keyword of ['treemap', 'treemap-beta']) {
      const doc = parse(`${keyword}\n"甲": 1\n`)
      expect(doc.elements[0]?.element.kind).toBe('treemap-header')
    }
  })

  it('缺表头：解析失败并报首行', () => {
    const result = treemapParser.parse('"甲": 1\n')
    if (result.ok) throw new Error('缺表头必须解析失败')
    expect(result.error.line).toBe(1)
  })

  it('Section 与 Leaf：有值即叶子、无值即分组（research §3 形态辨别）', () => {
    const doc = parse(SAMPLE)
    const nodes = doc.elements.filter((p) => p.element.kind === 'treemap-node')
    expect(nodes).toHaveLength(7)
    const kinds = nodes.map((p) => ((p.element as TreemapNodeData).value === null ? 'section' : 'leaf'))
    expect(kinds).toEqual(['section', 'section', 'leaf', 'leaf', 'section', 'leaf', 'leaf'])
  })

  it('层级由缩进决定：顶格 Section depth 0、子级递增（research 坑 4）', () => {
    const doc = parse(SAMPLE)
    const depths = doc.elements
      .filter((p) => p.element.kind === 'treemap-node')
      .map((p) => (p.element as TreemapNodeData).depth)
    expect(depths).toEqual([0, 1, 2, 2, 1, 2, 2])
  })

  it('逗号分隔与单引号名、无前导零小数也是 Leaf（research 坑 2 / §2 边角）', () => {
    const doc = parse("treemap-beta\n'甲', 10\n    \"乙\":.5\n")
    const nodes = doc.elements.filter((p) => p.element.kind === 'treemap-node')
    expect(nodes).toHaveLength(2)
    expect((nodes[0].element as TreemapNodeData).quote).toBe("'")
    expect((nodes[0].element as TreemapNodeData).value).toBe('10')
    expect((nodes[1].element as TreemapNodeData).value).toBe('.5')
    expect(reassemble(doc)).toBe("treemap-beta\n'甲', 10\n    \"乙\":.5\n")
  })

  it(':::class 类标注逐字保留（Section 与 Leaf 两种位置）', () => {
    const src = 'treemap\n"甲":::c1\n    "乙": 1:::c2\nclassDef c1 fill:red\n'
    const doc = parse(src)
    const nodes = doc.elements.filter((p) => p.element.kind === 'treemap-node')
    expect((nodes[0].element as TreemapNodeData).classRaw).toBe(':::c1')
    expect((nodes[1].element as TreemapNodeData).classRaw).toBe(':::c2')
    expect(reassemble(doc)).toBe(src)
  })

  it('title / accTitle / classDef / 注释 / 空行逐字保留（ADR-0008）', () => {
    const src = `%% 头部注释\n\ntreemap\ntitle 预算\naccTitle: a\n    %% 缩进注释\n    "甲": 1\n\nclassDef c1 fill:red\n`
    expect(reassemble(parse(src))).toBe(src)
  })

  it('frontmatter 整块逐字保留', () => {
    const src = '---\ntitle: 示例\n---\ntreemap\n"甲": 1\n'
    expect(reassemble(parse(src))).toBe(src)
  })

  it('裸词名 / 名字后跟别的内容的行不识别：逐字保留不报错（ADR-0008，research 坑 1 不代为报错）', () => {
    const src = 'treemap\n裸词\n"甲" junk\n"乙": 1\n'
    const doc = parse(src)
    const nodes = doc.elements.filter((p) => p.element.kind === 'treemap-node')
    expect(nodes).toHaveLength(1)
    expect(reassemble(doc)).toBe(src)
  })
})

describe('treemap 意图往返', () => {
  it('set-node-name：引号风格与 class 段逐字保留', () => {
    const doc = parse("treemap\n'甲':::c1\n    \"乙\": 1\n")
    const rewrites = treemapParser.resolveRewrites(doc, { type: 'set-node-name', elementId: 'treemap-node:1', name: '丙' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toBe("treemap\n'丙':::c1\n    \"乙\": 1\n")
    expect(treemapParser.parse(next).ok).toBe(true)
  })

  it('set-node-value：只对 Leaf 生效，Section 拒绝', () => {
    const doc = parse(SAMPLE)
    expect(treemapParser.resolveRewrites(doc, { type: 'set-node-value', elementId: 'treemap-node:1', value: '5' })).toBeNull()
    const rewrites = treemapParser.resolveRewrites(doc, { type: 'set-node-value', elementId: 'treemap-node:3', value: '12.5' })
    expect(rewrites).not.toBeNull()
    expect(reassemble(doc, rewrites!)).toContain('"人力": 12.5')
  })

  it('非法编辑一律拒绝：空名 / 含引号名 / 非法数值（负数、含冒号、空串）', () => {
    const doc = parse(SAMPLE)
    expect(treemapParser.resolveRewrites(doc, { type: 'set-node-name', elementId: 'treemap-node:1', name: '' })).toBeNull()
    expect(treemapParser.resolveRewrites(doc, { type: 'set-node-name', elementId: 'treemap-node:1', name: 'a"b' })).toBeNull()
    expect(treemapParser.resolveRewrites(doc, { type: 'set-node-value', elementId: 'treemap-node:3', value: '-5' })).toBeNull()
    expect(treemapParser.resolveRewrites(doc, { type: 'set-node-value', elementId: 'treemap-node:3', value: '1:2' })).toBeNull()
    expect(treemapParser.resolveRewrites(doc, { type: 'set-node-value', elementId: 'treemap-node:3', value: '' })).toBeNull()
    expect(treemapParser.resolveRewrites(doc, { type: 'set-node-name', elementId: 'treemap-node:99', name: 'x' })).toBeNull()
  })

  it('add-child：落进 Section 子树末尾，缩进跟随既有子节点', () => {
    const doc = parse(SAMPLE)
    const rewrites = treemapParser.resolveRewrites(doc, {
      type: 'add-child',
      parentElementId: 'treemap-node:2',
      name: '新叶子',
      value: '5',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('        "新叶子": 5\n') // 缩进 8 空格 = 既有子节点档位
    const idx = next.indexOf('"新叶子": 5')
    expect(idx).toBeGreaterThan(next.indexOf('"设备"')) // 落在子树末尾（设备之后）
    expect(treemapParser.parse(next).ok).toBe(true)
  })

  it('add-child：叶子上拒绝（有值即叶子，research §3）', () => {
    const doc = parse(SAMPLE)
    expect(
      treemapParser.resolveRewrites(doc, { type: 'add-child', parentElementId: 'treemap-node:3', name: 'x' }),
    ).toBeNull()
  })

  it('add-child 无值形态：加分组（Section）', () => {
    const doc = parse(SAMPLE)
    const rewrites = treemapParser.resolveRewrites(doc, {
      type: 'add-child',
      parentElementId: 'treemap-node:1',
      name: '新分组',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).toContain('    "新分组"\n')
    expect(treemapParser.parse(next).ok).toBe(true)
  })

  it('add-sibling：落在目标子树之后、同缩进', () => {
    const doc = parse(SAMPLE)
    const rewrites = treemapParser.resolveRewrites(doc, {
      type: 'add-sibling',
      elementId: 'treemap-node:2',
      name: '售后',
      value: '9',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    // 运营整棵子树（末尾是设备）之后、下一个同级（市场）之前
    expect(next.indexOf('"售后": 9')).toBeGreaterThan(next.indexOf('"设备"'))
    expect(next.indexOf('"售后": 9')).toBeLessThan(next.indexOf('"市场"'))
    expect(next).toContain('    "售后": 9\n')
    expect(treemapParser.parse(next).ok).toBe(true)
  })

  it('add-root：顶格追加在文档末元素之后', () => {
    const doc = parse(SAMPLE)
    const rewrites = treemapParser.resolveRewrites(doc, { type: 'add-root', name: '新分组' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next.endsWith('"\n    "新分组"\n') || next.endsWith('"新分组"\n')).toBe(true)
    expect(next).toContain('\n"新分组"\n')
    expect(treemapParser.parse(next).ok).toBe(true)
  })

  it('delete-node：连同子树整块移除，不留残行', () => {
    const doc = parse(SAMPLE)
    const rewrites = treemapParser.resolveRewrites(doc, { type: 'delete-node', elementId: 'treemap-node:2' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites!)
    expect(next).not.toContain('"运营"')
    expect(next).not.toContain('"人力"')
    expect(next).toContain('"市场"')
    expect(next).toBe(`treemap
"预算分配"
    "市场"
        "广告": 400000
        "活动": 100000
`)
    expect(treemapParser.parse(next).ok).toBe(true)
  })

  it('未知意图 / 未知元素：返回 null', () => {
    const doc = parse(SAMPLE)
    expect(treemapParser.resolveRewrites(doc, { type: 'nope' })).toBeNull()
    expect(treemapParser.resolveRewrites(doc, { type: 'delete-node', elementId: 'header' })).toBeNull()
  })
})
