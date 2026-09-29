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

  it('同名 namespace 各自成项：带重名序号的 id 也在投影里（工单 02，否则不可见不可选）', () => {
    const proj = project(
      `classDiagram
namespace Foo {
    class Circle
}
namespace Foo {
    class Square
}
`,
    )

    expect(proj.namespaces).toEqual([
      { elementId: 'namespace:Foo', name: 'Foo' },
      { elementId: 'namespace:Foo#2', name: 'Foo' },
    ])
    expect(
      resolveClassSelection(proj, { kind: 'class-namespace', elementId: 'namespace:Foo#2' }),
    ).toEqual({ kind: 'class-namespace', elementId: 'namespace:Foo#2' })
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

// ---------- 关系端点泛型进投影（工单 08） ----------

describe('关系端点泛型进投影（工单 08）', () => {
  it('fromGeneric / toGeneric 去 ~ 后透出；无泛型为 null', () => {
    const proj = project('classDiagram\n    Foo~T~ --> Bar~U~\n    A --> B\n')
    expect(proj.relations.map((r) => [r.fromGeneric, r.toGeneric])).toEqual([
      ['T', 'U'],
      [null, null],
    ])
  })
})

// ---------- direction（工单 07） ----------

describe('direction 进 class 投影（工单 07）', () => {
  it('无 direction 行时为 null（表单据此显示「跟随 Mermaid 默认」，不假装某个值）', () => {
    expect(project('classDiagram\nclass A\n').direction).toBe(null)
  })

  it('有 direction 行时取原文', () => {
    expect(project('classDiagram\ndirection LR\nclass A\n').direction).toBe('LR')
  })

  it('多个 direction 行时取首个（与改写落地侧同口径）', () => {
    expect(project('classDiagram\ndirection LR\nclass A\ndirection RL\n').direction).toBe('LR')
  })

  it('非法取值照原样进投影（由表单如实回显，不在投影层过滤）', () => {
    expect(project('classDiagram\ndirection XY\nclass A\n').direction).toBe('XY')
  })
})
