import { describe, expect, it } from 'vitest'
import { classParser } from '../../pipeline/class'
import { buildClassProjection, resolveClassSelection } from '../class-projection'

/**
 * class 投影：namespace 作为区域节点进投影（工单 06，ADR-0014）。
 * namespace 无 data-id、不构成 DOM 包含（childDataIds: []），故只做
 * 「解析 + 结构树可见 + 可改名」，不做分组编辑。
 */

function project(source: string) {
  const parsed = classParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildClassProjection(parsed.doc)
}

describe('namespace 进 class 投影（工单 06）', () => {
  it('namespace 按文档顺序成项，elementId 为 namespace:名字', () => {
    const proj = project(
      `classDiagram
namespace Shapes {
    class Circle
}
namespace Other {
    class Square
}
`,
    )

    expect(proj.namespaces).toEqual([
      { elementId: 'namespace:Shapes', name: 'Shapes' },
      { elementId: 'namespace:Other', name: 'Other' },
    ])
    // 内部的类照常出现在 classes 里（namespace 只是视觉边框，不改归属）
    expect(proj.classes.map((c) => c.name)).toEqual(['Circle', 'Square'])
  })

  it('单行 namespace 也进投影', () => {
    const proj = project('classDiagram\nnamespace Foo { class A }\n')
    expect(proj.namespaces).toEqual([{ elementId: 'namespace:Foo', name: 'Foo' }])
  })

  it('无 namespace 时为空数组（既有类图不回归）', () => {
    const proj = project('classDiagram\nclass A\nA <|-- B\n')
    expect(proj.namespaces).toEqual([])
    expect(proj.classes.map((c) => c.name)).toEqual(['A'])
  })

  it('resolveClassSelection：命名空间按 elementId 命中', () => {
    const proj = project('classDiagram\nnamespace Shapes {\n    class Circle\n}\n')
    expect(resolveClassSelection(proj, { kind: 'class-namespace', elementId: 'namespace:Shapes' })).toEqual({
      kind: 'class-namespace',
      elementId: 'namespace:Shapes',
    })
    expect(resolveClassSelection(proj, { kind: 'class-namespace', elementId: 'namespace:不存在' })).toBeNull()
  })
})
