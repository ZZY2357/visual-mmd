import { describe, expect, it } from 'vitest'
import { architectureParser } from '../../pipeline/architecture'
import { buildArchitectureProjection, resolveArchitectureSelection } from '../architecture-projection'

/**
 * architecture 投影测试（more-diagrams 工单 17）：名字即身份的三类节点、
 * 位置序边与 align、端点存在性标注、选中回落。
 */

const SOURCE = `architecture-beta
    group platform(cloud)[平台]
    group private(cloud)[私有子网] in platform
    service web(server)[Web 服务]
    service db(database)[数据库] in private
    junction j1
    align row web db

    web:R -- L:db
    web:B --> T:j1
    ghost:R -- L:web
`

function projectionOf(source: string) {
  const parsed = architectureParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildArchitectureProjection(parsed.doc)
}

describe('buildArchitectureProjection', () => {
  const projection = projectionOf(SOURCE)

  it('三类节点：名字即身份，icon / title / parent 从声明行派生', () => {
    expect(projection.services.map((s) => s.id)).toEqual(['web', 'db'])
    expect(projection.services[0]).toMatchObject({ kind: 'arch-service', elementId: 'service:web', icon: 'server', title: 'Web 服务', parent: null })
    expect(projection.services[1]).toMatchObject({ parent: 'private' })
    expect(projection.groups.map((g) => g.id)).toEqual(['platform', 'private'])
    expect(projection.groups[1]).toMatchObject({ parent: 'platform' })
    expect(projection.junctions[0]).toMatchObject({ id: 'j1', elementId: 'junction:j1', parent: null })
  })

  it('边：位置序身份 `edge:N`，端口 / 箭头派生；端点存在性标注（group 端点 / 未声明 id = 无效）', () => {
    expect(projection.edges.map((e) => e.elementId)).toEqual(['edge:1', 'edge:2', 'edge:3'])
    expect(projection.edges[0]).toMatchObject({ from: 'web', to: 'db', fromPort: 'R', toPort: 'L', arrow: 'none', endpointValid: true })
    expect(projection.edges[1]).toMatchObject({ arrow: 'target' })
    // ghost 未声明（mermaid 渲染错误）：原样展示 + endpointValid false，不静默改写
    expect(projection.edges[2]).toMatchObject({ from: 'ghost', endpointValid: false })
  })

  it('align：位置序身份 `align:N`，成员照录', () => {
    expect(projection.aligns).toEqual([
      { kind: 'arch-align', elementId: 'align:1', direction: 'row', members: ['web', 'db'] },
    ])
  })
})

describe('resolveArchitectureSelection（选中回落）', () => {
  const projection = projectionOf(SOURCE)

  it('存在的选中原样返回；不存在的落 null；图表级直通；别种选中 null', () => {
    expect(resolveArchitectureSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveArchitectureSelection(projection, { kind: 'architecture-service', name: 'web' })).toEqual({
      kind: 'architecture-service',
      name: 'web',
    })
    expect(resolveArchitectureSelection(projection, { kind: 'architecture-group', name: 'GONE' })).toBeNull()
    expect(resolveArchitectureSelection(projection, { kind: 'architecture-edge', elementId: 'edge:99' })).toBeNull()
    expect(resolveArchitectureSelection(projection, { kind: 'architecture-align', elementId: 'align:1' })).toEqual({
      kind: 'architecture-align',
      elementId: 'align:1',
    })
    expect(resolveArchitectureSelection(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
    expect(resolveArchitectureSelection(projection, null)).toBeNull()
  })
})
