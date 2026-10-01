import { describe, expect, it } from 'vitest'
import { architectureParser, renderArchEdgeLine, type ArchitectureIntent } from '../architecture'
import { reassemble, type SourceDocument } from '../document'

/**
 * architecture-beta 解析器测试（more-diagrams 工单 17）：
 * 解析带 span、verbatim identity（未触碰逐字保留）、意图往返（编辑后重解析一致）、
 * 非法编辑拒绝落码（端点校验 / 重名 / 标题与图标合法性——源码始终合法）。
 */

const SAMPLE = `architecture-beta
    group platform(cloud)[平台]
    group private(cloud)[私有子网] in platform
    service web(server)[Web 服务]
    service db(database)[数据库] in private
    service cache(disk)[缓存]
    junction j1

    web:R -- L:db
    web:B --> T:j1
    j1:R -- L:cache
`

function parse(source: string): SourceDocument {
  const r = architectureParser.parse(source)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

const apply = (doc: SourceDocument, intent: ArchitectureIntent): SourceDocument | null => {
  const rewrites = architectureParser.resolveRewrites(doc, intent)
  if (rewrites === null) return null
  return parse(reassemble(doc, rewrites))
}

const expectApply = (doc: SourceDocument, intent: ArchitectureIntent): SourceDocument => {
  const next = apply(doc, intent)
  if (next === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return next
}

describe('parse（结构 + span）', () => {
  it('逐字保留：解析后不做修改再重组装，输出与输入逐字相同', () => {
    const doc = parse(SAMPLE)
    expect(reassemble(doc)).toBe(SAMPLE)
  })

  it('元素齐全：2 group（其一嵌套）、3 service（其一 in 组）、1 junction、3 边', () => {
    const doc = parse(SAMPLE)
    const kinds = doc.elements.map((p) => p.element.kind)
    expect(kinds.filter((k) => k === 'architecture-node-decl')).toHaveLength(6)
    expect(kinds.filter((k) => k === 'architecture-edge')).toHaveLength(3)
    const elementIds = doc.elements.map((p) => p.id)
    expect(elementIds).toContain('group:platform')
    expect(elementIds).toContain('group:private')
    expect(elementIds).toContain('service:web')
    expect(elementIds).toContain('service:db')
    expect(elementIds).toContain('junction:j1')
    expect(elementIds).toContain('edge:1')
  })

  it('边解析：端口、箭头、{group} 标记与空白逐字进结构化数据', () => {
    const doc = parse('architecture-beta\n    a{group}:R <-- L:b{group}\n    c --d label- e\n')
    const edge1 = doc.elements.find((p) => p.id === 'edge:1')
    if (edge1 === undefined || edge1.element.kind !== 'architecture-edge') throw new Error('edge:1 缺失')
    expect(edge1.element).toMatchObject({
      from: 'a',
      fromGroupRaw: '{group}',
      fromPort: 'R',
      fromArrow: true,
      toArrow: false,
      toPort: 'L',
      to: 'b',
      toGroupRaw: '{group}',
    })
    // `--d label- e` 的 `-d label-` 是标签形态：本票不解析 label（整行保持 verbatim）
    expect(doc.elements.filter((p) => p.element.kind === 'architecture-edge')).toHaveLength(1)
    expect(reassemble(doc)).toBe('architecture-beta\n    a{group}:R <-- L:b{group}\n    c --d label- e\n')
  })

  it('边行重建逐字往返（renderArchEdgeLine 不改原文空白）', () => {
    const doc = parse('architecture-beta\n    a\n    b\n    a{group}:R  <-- L: b{group}\n')
    const edge = doc.elements.find((p) => p.id === 'edge:1')
    if (edge === undefined || edge.element.kind !== 'architecture-edge') throw new Error('edge:1 缺失')
    expect(renderArchEdgeLine(edge.element as Parameters<typeof renderArchEdgeLine>[0])).toBe('a{group}:R  <-- L: b{group}')
  })

  it('align 行解析（≥2 成员、成员间空白逐字保留）；单成员 / 非法方向保持 verbatim', () => {
    const doc = parse('architecture-beta\n    service a\n    service b\n    align row  a   b\n    align diagonal a b\n')
    const align = doc.elements.find((p) => p.id === 'align:1')
    if (align === undefined || align.element.kind !== 'architecture-align') throw new Error('align:1 缺失')
    expect(align.element).toMatchObject({ direction: 'row', members: ['a', 'b'] })
    expect(reassemble(doc)).toBe('architecture-beta\n    service a\n    service b\n    align row  a   b\n    align diagonal a b\n')
  })

  it('无表头 / 首语句非表头 → 解析失败（带行号）', () => {
    expect(architectureParser.parse('service a\n').ok).toBe(false)
    expect(architectureParser.parse('').ok).toBe(false)
    const bad = architectureParser.parse('flowchart TD\n    A\n')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error.line).toBe(1)
  })

  it('frontmatter 与注释、清单外行逐字保留（不解析不报错）', () => {
    const source = `---
config:
  architecture:
    seed: 7
---
architecture-beta
    %% 尾注释独占一行不参与解析
    title 某标题
    service a
`
    const doc = parse(source)
    expect(doc.elements.map((p) => p.element.kind)).toEqual(['architecture-header', 'architecture-node-decl'])
    expect(reassemble(doc)).toBe(source)
  })
})

describe('resolveRewrites（意图落地）', () => {
  it('add-service：追加声明行；带 parent 时锚到父 group 声明之后', () => {
    const doc = parse(SAMPLE)
    const next = expectApply(doc, { type: 'add-service', id: 'api', icon: 'server', title: 'API' })
    expect(next.source).toContain('service api(server)[API]')
    // 无锚点缺省回退文档最后一个元素（末条边之后，缩进跟随）
    const tail = next.source.trimEnd().split('\n').pop() ?? ''
    expect(tail).toBe('    service api(server)[API]')
    const inGroup = expectApply(doc, { type: 'add-junction', id: 'j2', parent: 'private', afterElementId: 'group:private' })
    expect(inGroup.source).toContain('junction j2 in private')
  })

  it('add-* 非法拒绝：重名 / 非法 id / 父不是已声明 group / 非法图标与标题', () => {
    const doc = parse(SAMPLE)
    expect(apply(doc, { type: 'add-service', id: 'web' })).toBeNull() // 重名
    expect(apply(doc, { type: 'add-service', id: 'a b' })).toBeNull() // id 词法
    expect(apply(doc, { type: 'add-service', id: 'ok', parent: 'web' })).toBeNull() // 父不是 group
    expect(apply(doc, { type: 'add-service', id: 'ok', icon: 'not ok!' })).toBeNull()
    expect(apply(doc, { type: 'add-service', id: 'ok', title: 'a[b]' })).toBeNull()
  })

  it('set-service-title / set-group-title：原地改写；null = 去掉 [title]；非法标题拒绝', () => {
    const doc = parse(SAMPLE)
    const next = expectApply(doc, { type: 'set-service-title', id: 'web', title: '门户' })
    expect(next.source).toContain('service web(server)[门户]')
    const removed = expectApply(next, { type: 'set-service-title', id: 'web', title: null })
    expect(removed.source).toContain('service web(server)')
    expect(apply(doc, { type: 'set-service-title', id: 'web', title: 'x[y]' })).toBeNull()
    expect(apply(doc, { type: 'set-group-title', id: 'platform', title: '平台层' })).toBeTruthy()
  })

  it('set-service-icon：换图标 / 去图标；set-service-parent：移入 / 移出分组', () => {
    const doc = parse(SAMPLE)
    const icon = expectApply(doc, { type: 'set-service-icon', id: 'cache', icon: 'cloud' })
    expect(icon.source).toContain('service cache(cloud)[缓存]')
    const noIcon = expectApply(icon, { type: 'set-service-icon', id: 'cache', icon: null })
    expect(noIcon.source).toContain('service cache[缓存]')
    const moved = expectApply(doc, { type: 'set-service-parent', id: 'web', parent: 'platform' })
    expect(moved.source).toContain('service web(server)[Web 服务] in platform')
    const out = expectApply(moved, { type: 'set-service-parent', id: 'web', parent: null })
    expect(out.source).toContain('service web(server)[Web 服务]\n')
    expect(apply(doc, { type: 'set-service-parent', id: 'web', parent: 'web' })).toBeNull()
  })

  it('add-edge：直边 / 带箭头（端口两侧必需）；端点不存在 / 端点是 group / 缺端口 → 拒绝', () => {
    const doc = parse(SAMPLE)
    const plain = expectApply(doc, { type: 'add-edge', from: 'cache', to: 'web', fromPort: 'R', toPort: 'L' })
    expect(plain.source).toContain('cache:R -- L:web')
    const arrow = expectApply(doc, { type: 'add-edge', from: 'cache', to: 'web', arrow: 'target', fromPort: 'R', toPort: 'L' })
    expect(arrow.source).toContain('cache:R --> L:web')
    expect(apply(doc, { type: 'add-edge', from: 'cache', to: 'ghost', fromPort: 'R', toPort: 'L' })).toBeNull()
    expect(apply(doc, { type: 'add-edge', from: 'platform', to: 'web', fromPort: 'R', toPort: 'L' })).toBeNull() // group 不能作端点
    // 端口缺失（mermaid 词法必需）——绕过类型构造非法意图，落地侧必须拒绝
    expect(apply(doc, { type: 'add-edge', from: 'cache', to: 'web' } as unknown as ArchitectureIntent)).toBeNull()
  })

  it('set-edge-port / set-edge-arrow：原地改写，未触碰空白逐字保留；delete-edge 删整行', () => {
    const doc = parse(SAMPLE)
    const next = expectApply(doc, { type: 'set-edge-port', elementId: 'edge:1', side: 'from', port: 'B' })
    expect(next.source).toContain('web:B -- L:db')
    const swapped = expectApply(doc, { type: 'set-edge-port', elementId: 'edge:1', side: 'to', port: 'T' })
    expect(swapped.source).toContain('web:R -- T:db')
    const both = expectApply(doc, { type: 'set-edge-arrow', elementId: 'edge:1', arrow: 'both' })
    expect(both.source).toContain('web:R <--> L:db')
    const removed = expectApply(both, { type: 'set-edge-arrow', elementId: 'edge:1', arrow: 'none' })
    expect(removed.source).toContain('web:R -- L:db')
    const deleted = expectApply(doc, { type: 'delete-edge', elementId: 'edge:1' })
    expect(deleted.source).not.toContain('web:R -- L:db')
    expect(deleted.source).toContain('web:B --> T:j1')
    expect(apply(doc, { type: 'set-edge-arrow', elementId: 'edge:99', arrow: 'target' })).toBeNull()
  })

  it('delete-service / delete-junction 级联删触及边与 align；delete-group 成员摘回顶层', () => {
    const doc = parse('architecture-beta\n    group g\n    service a in g\n    junction j in g\n    service b\n    align row a b\n    a:R -- L:b\n    a:R -- L:j\n')
    const noService = expectApply(doc, { type: 'delete-service', id: 'a' })
    expect(noService.source).not.toContain('service a')
    expect(noService.source).not.toContain('a:R -- L:b')
    expect(noService.source).not.toContain('a:R -- L:j')
    expect(noService.source).not.toContain('align row')
    const noGroup = expectApply(doc, { type: 'delete-group', id: 'g' })
    expect(noGroup.source).not.toContain('group g')
    expect(noGroup.source).toContain('junction j\n')
    expect(noGroup.source).not.toContain(' in g')
  })

  it('delete-align：只删对齐行', () => {
    const doc = parse('architecture-beta\n    service a\n    service b\n    align column a b\n')
    const next = expectApply(doc, { type: 'delete-align', elementId: 'align:1' })
    expect(next.source).not.toContain('align column')
  })

  it('意图往返：编辑后的源码重解析再编辑，elementId 稳定（位置序边随之稳定）', () => {
    let doc = parse(SAMPLE)
    doc = expectApply(doc, { type: 'add-service', id: 'api', title: 'API' })
    doc = expectApply(doc, { type: 'add-edge', from: 'api', to: 'web', fromPort: 'R', toPort: 'L', arrow: 'target' })
    doc = expectApply(doc, { type: 'set-edge-arrow', elementId: 'edge:4', arrow: 'none' })
    expect(doc.source).toContain('api:R -- L:web')
    expect(doc.source).toContain('service api[API]')
  })
})
