import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { BLOCK_TEMPLATE } from '../../diagram-registry'
import { blockParser } from '../block'
import {
  isValidBlockEdgeLine,
  isValidBlockEdgeToken,
  isValidBlockId,
  isValidBlockLabel,
  parseBlockNodeAtom,
  renderBlockEdge,
  renderBlockNodeAtom,
  splitBlockEdgeLine,
} from '../block'
import { reassemble, type SourceDocument } from '../document'

/**
 * block 解析器（more-diagrams 工单 09）：
 * - 可测试承诺：解析后不做修改再重组装，输出与输入逐字相同（verbatim identity）
 * - 覆盖面：形状全家族、边全家族（含标签形态）、columns / space / title、嵌套块
 * - 词法事实（mermaid 12.0.0 编译产物核对）：裸形状标签只允许 ASCII 词字符；
 *   `A - B`（单横线）不是合法连法；标签边两半是独立 token
 * - 落地：全部编辑意图走手术式改写，终态必须仍可被 mermaid parse 通过
 */

const SRC = BLOCK_TEMPLATE

function parseDoc(src: string): SourceDocument {
  const r = blockParser.parse(src)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}（行 ${r.error.line}）`)
  return r.doc
}

describe('block 解析：verbatim identity（工单 09 承诺）', () => {
  it('模板解析后原样重组装，逐字相同', () => {
    const doc = parseDoc(SRC)
    expect(reassemble(doc, new Map())).toBe(SRC)
  })

  it('边全家族 + 嵌套块 + space + title 的富样本文档逐字往返', () => {
    const src = `block-beta
    columns 2
    title 示例标题
    a["甲"] x--x b{"乙"}
    c ==> d
    e o--o f
    g <--> h
    i -.-> j
    space:2
    block:gid:2
        k[()]
        l{{六}}
    end
    a -- "标签" --> b
`
    const doc = parseDoc(src)
    expect(reassemble(doc, new Map())).toBe(src)
  })
})

describe('block 解析：行结构与 span', () => {
  it('表头 / columns / title / space 各成元素，嵌套块归属正确', () => {
    const doc = parseDoc(SRC)
    const kinds = doc.elements.map((p) => (p.element as { kind: string }).kind)
    expect(kinds[0]).toBe('block-header')

    const columns = doc.elements.filter((p) => (p.element as { kind: string }).kind === 'block-columns')
    expect(columns).toHaveLength(2) // 顶层 + 组内各一行
    const nested = columns[1].element as unknown as { owner: string | null; value: number | null }
    expect(nested.owner).toBe('group1')
    expect(nested.value).toBe(2)

    const groupOpen = doc.elements.find((p) => (p.element as { kind: string }).kind === 'block-group-open')
    expect(groupOpen?.id).toMatch(/^block-group:group1/)

    const groupEnd = doc.elements.filter((p) => (p.element as { kind: string }).kind === 'block-group-close')
    expect(groupEnd).toHaveLength(1)
  })

  it('节点行：形状 / 标签 / 引号形态 / 跨列 :n', () => {
    const doc = parseDoc(SRC)
    const nodes = doc.elements
      .filter((p) => (p.element as { kind: string }).kind === 'block-node')
      .map((p) => p.element as unknown as { atom: { id: string; shape: string | null; label: string | null; labelQuoted: boolean }; width: number | null })
    expect(nodes.map((n) => n.atom.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(nodes[0]).toMatchObject({ atom: { shape: 'square', label: '输入', labelQuoted: true }, width: null })
    expect(nodes[1]).toMatchObject({ atom: { shape: 'diamond', label: '校验' } })
    expect(nodes[3]).toMatchObject({ atom: { shape: 'round', label: '缓存' } })
    expect(nodes[4]).toMatchObject({ atom: { shape: 'cylinder', label: '数据库' } })
  })

  it('边行：位置序 elementId、算子与标签', () => {
    const doc = parseDoc(SRC)
    const edges = doc.elements
      .filter((p) => (p.element as { kind: string }).kind === 'block-edge')
      .map((p) => ({ id: p.id, data: p.element as unknown as { left: string; right: string; line: string; label: string | null } }))
    expect(edges.map((e) => e.id)).toEqual(['edge:1', 'edge:2'])
    expect(edges[0].data).toMatchObject({ left: 'a', right: 'b', line: '-->', label: null })
    // 标签边：line 存左右半段拼接的完整 token，label 为引号内语义值
    expect(edges[1].data).toMatchObject({ left: 'b', right: 'c', label: '通过' })
    expect(edges[1].data.line).toBe('---->')
  })

  it('清单外语法（style / classDef / 注释）逐字保留，不报错', () => {
    const src = `block-beta
    %% 注释
    a["甲"]
    style a fill:#f00
`
    const doc = parseDoc(src)
    expect(reassemble(doc, new Map())).toBe(src)
    expect(doc.elements.some((p) => (p.element as { kind: string }).kind === 'block-node')).toBe(true)
  })
})

describe('block 解析：错误如实报错（不静默）', () => {
  it('缺表头 → 报错', () => {
    const r = blockParser.parse('a["甲"]\n')
    expect(r.ok).toBe(false)
  })

  it('顶层多余的 end → 报错', () => {
    const r = blockParser.parse('block-beta\n    a["甲"]\nend\n')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.line).toBe(3)
  })

  it('嵌套块缺 end → 报错并指向声明行', () => {
    const r = blockParser.parse('block-beta\n    block:gid\n    a["甲"]\n')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.line).toBe(2)
  })
})

describe('block 词法校验器（编译产物核对的事实）', () => {
  it('节点 id：不含空白 / 括号家族 / 连字符 / 冒号', () => {
    expect(isValidBlockId('a1')).toBe(true)
    expect(isValidBlockId('node_1')).toBe(true)
    expect(isValidBlockId('a-b')).toBe(false)
    expect(isValidBlockId('a b')).toBe(false)
    expect(isValidBlockId('a:b')).toBe(false)
    expect(isValidBlockId('')).toBe(false)
  })

  it('标签：非空、不含引号 / 方括号 / 换行', () => {
    expect(isValidBlockLabel('输入')).toBe(true)
    expect(isValidBlockLabel('a "b"')).toBe(false)
    expect(isValidBlockLabel('a[b]')).toBe(false)
    expect(isValidBlockLabel('')).toBe(false)
  })

  it('边算子：全家族合法；单横线 `A - B` 不是合法连法；`~~~` 隐形线清单外不参与编辑', () => {
    for (const line of ['--', '-->', '==', '==>', '-.', '-.->', 'x--x', 'o--o', '<-->', 'x--', '--o']) {
      expect(isValidBlockEdgeToken(line), line).toBe(true)
    }
    expect(isValidBlockEdgeToken('-')).toBe(false)
    // `~~~` 形态上是 token，但隐形线是清单外语法：判定为不可编辑
    expect(isValidBlockEdgeToken('~~~')).toBe(false)
    expect(isValidBlockEdgeLine('~~~')).toBe(false)
    // 能承载标签的算子 = 有完整右半段
    expect(isValidBlockEdgeLine('--')).toBe(false)
    expect(isValidBlockEdgeLine('-->')).toBe(true)
    expect(isValidBlockEdgeLine('x--x')).toBe(true)
  })

  it('标签边两半是独立 token：splitBlockEdgeLine 的切分与 mermaid.parse 实测一致', () => {
    expect(splitBlockEdgeLine('-->')).toEqual({ leftHalf: '--', rightHalf: '-->' })
    expect(splitBlockEdgeLine('x--x')).toEqual({ leftHalf: 'x--', rightHalf: '--x' })
    expect(splitBlockEdgeLine('-.->')).toEqual({ leftHalf: '-.', rightHalf: '.->' })
    expect(splitBlockEdgeLine('==')).toBeNull() // 裸 == 无法夹住标签
  })
})

describe('block 节点原子：解析与重建的引号形态契约', () => {
  it('裸形状标签只允许 ASCII 词字符（mermaid 词法）：解析宽容、落码时守约', () => {
    expect(parseBlockNodeAtom('a2[test]')).toMatchObject({ id: 'a2', shape: 'square', label: 'test', labelQuoted: false })
    expect(parseBlockNodeAtom('a2["方形"]')).toMatchObject({ id: 'a2', shape: 'square', label: '方形', labelQuoted: true })
    // 解析器比 mermaid 词法宽容（清单外宽容、ADR-0008）：裸非 ASCII 标签仍结构化，
    // 合法性由 renderBlockNodeAtom 的 BLOCK_RAW_LABEL 契约在落码时把关
    expect(parseBlockNodeAtom('a2[方形]')).toMatchObject({ label: '方形', labelQuoted: false })
  })

  it('块箭头：方向括号可省略，方向串逐字保留', () => {
    expect(parseBlockNodeAtom('a<["L"]>')).toMatchObject({ id: 'a', shape: 'block_arrow', label: 'L', arrowDirs: null })
    expect(parseBlockNodeAtom('a<["L"]>(x, down)')).toMatchObject({ arrowDirs: 'x, down' })
  })

  it('值变化时原裸写在非 ASCII 词字符下自动加引号（守合法 mermaid）', () => {
    const atom = parseBlockNodeAtom('a2[test]')!
    expect(renderBlockNodeAtom(atom, { label: '方形' })).toBe('a2["方形"]')
    expect(renderBlockNodeAtom(atom, { label: 'test2' })).toBe('a2[test2]')
    // 原引号形态保持引号
    const quoted = parseBlockNodeAtom('a2["旧"]')!
    expect(renderBlockNodeAtom(quoted, { label: '新' })).toBe('a2["新"]')
  })

  it('形状替换：定界符随形状重算；变裸 id 丢弃标签', () => {
    const atom = parseBlockNodeAtom('a["x"]')!
    expect(renderBlockNodeAtom(atom, { shape: 'round' })).toBe('a("x")')
    expect(renderBlockNodeAtom(atom, { shape: null })).toBe('a')
  })

  it('边的原文重建：普通形态与标签形态', () => {
    expect(renderBlockEdge({ kind: 'block-edge', left: 'a', right: 'b', line: '-->', label: null, owner: null })).toBe('a --> b')
    expect(renderBlockEdge({ kind: 'block-edge', left: 'a', right: 'b', line: '-->', label: '通', owner: null })).toBe('a-- "通" -->b')
  })
})

describe('block 落地：编辑意图手术式改写（终态必须仍合法）', () => {
  it('add-node：顶层追加与落入嵌套块', () => {
    let doc = parseDoc(SRC)
    let rewrites = blockParser.resolveRewrites(doc, { type: 'add-node', id: 'f', shape: 'round', label: '重试' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    // 落在最后一个顶层元素之后（标签边 b -- "通过" --> c），不在 group1 内
    const f = doc.elements
      .filter((p) => (p.element as { kind: string }).kind === 'block-node')
      .map((p) => p.element as unknown as { atom: { id: string }; owner: string | null })
      .find((n) => n.atom.id === 'f')
    expect(f?.owner).toBeNull()

    rewrites = blockParser.resolveRewrites(doc, { type: 'add-node', id: 'g', shape: 'square', label: '归档', parentGroupId: 'group1' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    const g = doc.elements
      .filter((p) => (p.element as { kind: string }).kind === 'block-node')
      .map((p) => p.element as unknown as { atom: { id: string }; owner: string | null })
      .find((n) => n.atom.id === 'g')
    expect(g?.owner).toBe('group1')
  })

  it('add-node 拒绝：重名 / 非法 id / 未知宿主组', () => {
    const doc = parseDoc(SRC)
    expect(blockParser.resolveRewrites(doc, { type: 'add-node', id: 'a', shape: 'square' })).toBeNull()
    expect(blockParser.resolveRewrites(doc, { type: 'add-node', id: 'x-y', shape: 'square' })).toBeNull()
    expect(blockParser.resolveRewrites(doc, { type: 'add-node', id: 'f', parentGroupId: '__无__' })).toBeNull()
  })

  it('set-node-label：块箭头不允许去标签；引号契约自动补引号', () => {
    const src = `block-beta\n    a[test]\n    b<["L"]>\n`
    let doc = parseDoc(src)
    let rewrites = blockParser.resolveRewrites(doc, { type: 'set-node-label', id: 'a', label: '中文' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('a["中文"]')

    rewrites = blockParser.resolveRewrites(doc, { type: 'set-node-label', id: 'b', label: null })
    expect(rewrites).toBeNull() // 块箭头去标签落 `b<[]>`，拒绝
  })

  it('set-node-shape / set-node-width：改定界符与跨列', () => {
    let doc = parseDoc(SRC)
    let rewrites = blockParser.resolveRewrites(doc, { type: 'set-node-shape', id: 'a', shape: 'circle' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('a(("输入"))')

    rewrites = blockParser.resolveRewrites(doc, { type: 'set-node-width', id: 'a', width: 2 })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('a(("输入")):2')

    // 块箭头不参与形状编辑（两个方向都拒绝）
    const src = 'block-beta\n    b<["L"]>\n'
    const arrowDoc = parseDoc(src)
    expect(blockParser.resolveRewrites(arrowDoc, { type: 'set-node-shape', id: 'b', shape: 'round' })).toBeNull()
  })

  it('add-edge：端点必须已声明（节点或嵌套块）；from=to 拒绝', () => {
    let doc = parseDoc(SRC)
    expect(blockParser.resolveRewrites(doc, { type: 'add-edge', from: 'a', to: '__无__', line: '-->' })).toBeNull()
    expect(blockParser.resolveRewrites(doc, { type: 'add-edge', from: 'a', to: 'a', line: '-->' })).toBeNull()
    const rewrites = blockParser.resolveRewrites(doc, { type: 'add-edge', from: 'a', to: 'group1', line: 'o--o' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('a o--o group1')
  })

  it('set-edge：带标签的裸 `--` 被拒绝（无法夹住标签）；换算子 + 清标签可过', () => {
    let doc = parseDoc(SRC)
    // edge:2 已带标签，换成裸 `--` 必须拒绝
    expect(blockParser.resolveRewrites(doc, { type: 'set-edge', elementId: 'edge:2', changes: { line: '--' } })).toBeNull()
    // 无标签边换算子可以
    const rewrites = blockParser.resolveRewrites(doc, { type: 'set-edge', elementId: 'edge:1', changes: { line: '<-->' } })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('a <--> b')
  })

  it('delete-node 级联删触及边；delete-group 连同成员与触及边', () => {
    let doc = parseDoc(SRC)
    let rewrites = blockParser.resolveRewrites(doc, { type: 'delete-node', id: 'a' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    // 只有触及 a 的 edge:1（a --> b）被级联删除；edge:2（b/c）保留
    expect(doc.source).not.toContain('a --> b')
    expect(doc.source).toContain('b -- "通过" --> c')

    rewrites = blockParser.resolveRewrites(doc, { type: 'delete-group', id: 'group1' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).not.toContain('block:group1')
    expect(doc.source).not.toContain('d("缓存")')
    expect(doc.elements.some((p) => (p.element as { kind: string }).kind === 'block-group-open')).toBe(false)
  })

  it('set-columns：auto 删除该行；组内列数原地改写', () => {
    let doc = parseDoc(SRC)
    let rewrites = blockParser.resolveRewrites(doc, { type: 'set-columns', value: 'auto' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).not.toContain('columns 3')

    rewrites = blockParser.resolveRewrites(doc, { type: 'set-columns', groupId: 'group1', value: 3 })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('columns 3')
  })

  it('space 与 title：增删改全链路', () => {
    let doc = parseDoc(SRC)
    let rewrites = blockParser.resolveRewrites(doc, { type: 'add-space', width: 2 })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('space:2')

    // 删掉新增的 space:2（按 width 字段定位，模板自带的 `space` 是另一条）
    const space2 = doc.elements.find(
      (p) => (p.element as { kind: string; width: number | null }).kind === 'block-space' &&
        (p.element as unknown as { width: number | null }).width === 2,
    )
    expect(space2).toBeDefined()
    rewrites = blockParser.resolveRewrites(doc, { type: 'delete-space', elementId: space2!.id })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).not.toContain('space:2')
    expect(doc.source).toContain('space\n')

    rewrites = blockParser.resolveRewrites(doc, { type: 'set-title', value: '新标题' })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).toContain('title 新标题')

    rewrites = blockParser.resolveRewrites(doc, { type: 'set-title', value: null })
    expect(rewrites).not.toBeNull()
    doc = parseDoc(reassemble(doc, rewrites!))
    expect(doc.source).not.toContain('title ')
  })

  it('终态源码被 mermaid v12 parse 通过（一整轮编辑后）', async () => {
    let doc = parseDoc(SRC)
    const apply = (intent: Parameters<typeof blockParser.resolveRewrites>[1]) => {
      const rewrites = blockParser.resolveRewrites(doc, intent)
      if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
      doc = parseDoc(reassemble(doc, rewrites))
    }
    apply({ type: 'add-node', id: 'f', shape: 'round', label: '重试' })
    apply({ type: 'add-edge', from: 'c', to: 'f', line: 'x--x' })
    apply({ type: 'set-edge', elementId: 'edge:3', changes: { label: '失败' } })
    apply({ type: 'set-node-width', id: 'a', width: 2 })
    apply({ type: 'add-group', id: 'g2' })
    apply({ type: 'add-node', id: 'h', shape: 'square', label: '归档', parentGroupId: 'g2' })
    apply({ type: 'set-title', value: '处理流水线' })
    apply({ type: 'delete-node', id: 'c' })
    await expect(mermaid.parse(doc.source)).resolves.toBeTruthy()
  })
})
