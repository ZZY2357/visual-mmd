import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'
import { classParser, type NamespaceData } from '../class'

/**
 * class 解析器测试（工单 07，ADR-0004/0008）：
 * verbatim identity / 手术式改写，金样合法性见 class-golden.test.ts。
 */

/** 覆盖 ADR-0005 清单内全部 class 语法 + 清单外（linkStyle、CSS 注入等）逐字保留 */
const FULL_COVERAGE = `classDiagram
    %% 一条注释，必须逐字保留
    class BankAccount
    class Square~Shape~
    BankAccount : +String owner
    BankAccount : -List~int~ history
    BankAccount : +deposit(amount) bool
    class Animal{
        +int age
        -String name
        #reset()
        ~hide()
        +fly() protected
    }

    BankAccount <|-- Square
    Square <|.. Circle
    Circle "1" *-- "0..*" Bubble : 包含
    Bubble o-- Water
    Water --> Air : 蒸发
    Air ..> Fire : 引燃

    note for BankAccount "账户说明"
    note "浮动注释"

    classDef styled fill:#f9f,stroke:#333,stroke-width:4px

    namespace Shapes {
        class Circle
        class Triangle
    }

    linkStyle 0 stroke:red
    cssClass "Square" styled
    direction TB
`

describe('verbatim identity（class）', () => {
  const sources: Array<[string, string]> = [
    ['覆盖全部语法的用例（含清单外 linkStyle / cssClass / direction）', FULL_COVERAGE],
    ['无尾随换行', 'classDiagram\n    A <|-- B'],
    ['CRLF 行尾', 'classDiagram\r\n    A <|-- B\r\n    B *-- C\r\n'],
    ['紧凑无空格写法', 'classDiagram\n    A<|--B\n    C..>D:依赖\n'],
    ['花括号成员块', 'classDiagram\n    class Foo {\n        +int x\n        +bar()\n    }\n'],
    ['冒号紧跟成员', 'classDiagram\n    A:+int x\n'],
  ]

  for (const [name, source] of sources) {
    it(`${name}：解析→重组装逐字相同`, () => {
      const parsed = classParser.parse(source)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      expect(reassemble(parsed.doc)).toBe(source)
    })
  }

  it('解析产物完整覆盖源码且不重叠（parts 不变量）', () => {
    const parsed = classParser.parse(FULL_COVERAGE)
    if (!parsed.ok) throw parsed.error
    let cursor = 0
    for (const part of parsed.doc.parts) {
      expect(part.span.start).toBe(cursor)
      cursor = part.span.end
    }
    expect(cursor).toBe(FULL_COVERAGE.length)
  })
})

describe('手术式改写（class）：只重写目标元素 span，其余逐字不变', () => {
  const SOURCE = `classDiagram
    %% 注释逐字保留
    class Animal
    class Dog~Pet~{
        +int age
    }
    Animal : +String name
    Animal <|-- Dog
    Dog "1" *-- "0..*" Bone : 咬
    note for Animal "动物说明"
    classDef styled fill:#f9f
`

  it('set-member 可见性与文本：只改目标成员行', () => {
    const result = applyEdit(SOURCE, classParser, {
      type: 'set-member',
      elementId: 'member:2',
      vis: '-',
      text: 'int weight',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Animal : -int weight')
    expect(result.source).toContain('Animal <|-- Dog')
    expect(result.source).toContain('%% 注释逐字保留')
  })

  it('set-member 块内成员：只改块内那一行', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'set-member', elementId: 'member:1', text: 'string kind' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('        +string kind')
    expect(result.source).toContain('Animal : +String name')
  })

  it('add-member：无块类追加一行式成员；块内类插到 } 前', () => {
    const step1 = applyEdit(SOURCE, classParser, { type: 'add-member', className: 'Animal', vis: '+', text: 'int age' })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    expect(step1.source).toContain('Animal : +int age')
    expect(step1.source).toContain('%% 注释逐字保留')

    const step2 = applyEdit(step1.source, classParser, { type: 'add-member', className: 'Dog', vis: '-', text: 'int secret' })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    expect(step2.source).toContain('        +int age\n        -int secret\n    }')
  })

  it('delete-member：一行式成员删除，其余不变', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'delete-member', elementId: 'member:2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('+String name')
    expect(result.source).toContain('Animal <|-- Dog')
  })

  it('add-class：新增声明行', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'add-class', name: 'Cat', generic: 'Toy' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('class Cat~Toy~')
  })

  it('rename-class：声明 + 一行式成员 + 关系端点 + note 一起改', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'rename-class', name: 'Animal', newName: 'Creature' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('class Creature')
    expect(result.source).toContain('Creature : +String name')
    expect(result.source).toContain('Creature <|-- Dog')
    expect(result.source).toContain('note for Creature "动物说明"')
    expect(result.source).not.toMatch(/\bAnimal\b/)
  })

  it('set-class-generic：改泛型 / 去泛型', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'set-class-generic', name: 'Dog', generic: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('class Dog{')
  })

  it('delete-class：块、成员、关系、note 全部清除', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'delete-class', name: 'Dog' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('class Dog')
    expect(result.source).not.toContain('+int age')
    expect(result.source).not.toContain('Animal <|-- Dog')
    expect(result.source).not.toContain('*--')
    expect(result.source).toContain('Animal : +String name')
    expect(result.source).toContain('note for Animal "动物说明"')
  })

  it('set-relation：改关系类型 / 基数 / 标签', () => {
    const result = applyEdit(SOURCE, classParser, {
      type: 'set-relation',
      elementId: 'relation:2',
      kind: 'o--',
      cardFrom: '2',
      label: '饲养',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Dog "2" o-- "0..*" Bone : 饲养')
    expect(result.source).toContain('classDef styled fill:#f9f')
  })

  it('set-relation：去标签', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'set-relation', elementId: 'relation:2', label: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Dog "1" *-- "0..*" Bone\n')
  })

  it('add-relation：新增关系行（带标签）', () => {
    const result = applyEdit(SOURCE, classParser, {
      type: 'add-relation',
      from: 'Animal',
      to: 'Food',
      kind: '..>',
      label: '吃',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('Animal ..> Food : 吃')
  })

  it('delete-relation：只删目标行', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'delete-relation', elementId: 'relation:1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('<|--')
    expect(result.source).toContain('Dog "1" *-- "0..*" Bone : 咬')
  })

  it('add-note / set-note / delete-note', () => {
    const step1 = applyEdit(SOURCE, classParser, { type: 'add-note', className: 'Dog', text: '狗' })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    expect(step1.source).toContain('note for Dog "狗"')

    const step2 = applyEdit(step1.source, classParser, {
      type: 'set-note',
      elementId: 'note:2',
      className: null,
      text: '浮动说明',
    })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    expect(step2.source).toContain('note "浮动说明"')

    const step3 = applyEdit(step2.source, classParser, { type: 'delete-note', elementId: 'note:1' })
    expect(step3.ok).toBe(true)
    if (!step3.ok) return
    expect(step3.source).not.toContain('动物说明')
    expect(step3.source).toContain('note "浮动说明"')
  })

  it('set-classdef-prop：复用 flowchart 的 classDef 语义', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'set-classdef-prop', name: 'styled', prop: 'fill', value: '#0f0' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('classDef styled fill:#0f0')
  })

  it('add-classdef：新增 classDef 行', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'add-classdef', name: 'plain', props: { fill: '#fff' } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('classDef plain fill:#fff')
  })

  it('目标元素不存在时返回错误', () => {
    const result = applyEdit(SOURCE, classParser, { type: 'set-relation', elementId: 'relation:99', label: 'x' })
    expect(result.ok).toBe(false)
  })
})

// ---------- namespace 进模型（工单 06，ADR-0014） ----------

/** 解析出的 namespace 元素（断言用） */
function namespaceElements(source: string): NamespaceData[] {
  const parsed = classParser.parse(source)
  expect(parsed.ok, `样例源码必须可解析：${source}`).toBe(true)
  if (!parsed.ok) throw parsed.error
  return parsed.doc.elements
    .filter((part) => part.element.kind === 'namespace')
    .map((part) => part.element as NamespaceData)
}

describe('namespace 进模型（工单 06）', () => {
  it('解析出 namespace 名与行尾原文，类声明照常解析', () => {
    const source = `classDiagram
namespace Shapes {
    class Circle
}
`
    const parsed = classParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.elements.map((p) => p.element.kind)).toEqual([
      'class-header',
      'namespace',
      'class',
      'namespace-end',
    ])
    expect(namespaceElements(source)[0]).toEqual({ kind: 'namespace', gap: ' ', name: 'Shapes', tail: ' {' })
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('花括号配对不串味：class 块与 namespace 块各自闭合', () => {
    const source = `classDiagram
class A {
    +int x
}
namespace N {
    class B
}
`
    const parsed = classParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.elements.map((p) => p.element.kind)).toEqual([
      'class-header',
      'class',
      'member',
      'class-end',
      'namespace',
      'class',
      'namespace-end',
    ])
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('单行写法 `namespace Foo { class A }`：整行进模型、逐字保留、内联类不拆分', () => {
    const source = 'classDiagram\nnamespace Foo { class A }\n'
    const parsed = classParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.elements.map((p) => p.element.kind)).toEqual(['class-header', 'namespace'])
    expect(namespaceElements(source)[0]).toEqual({ kind: 'namespace', gap: ' ', name: 'Foo', tail: ' { class A }' })
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('verbatim：带缩进 / 注释的 namespace 源码解析→重组装逐字相同', () => {
    const source = `classDiagram
    %% 注释
    namespace BaseShapes {
        class Triangle
        class Rectangle
    }
`
    const parsed = classParser.parse(source)
    if (!parsed.ok) throw parsed.error
    expect(reassemble(parsed.doc)).toBe(source)
  })

  it('set-namespace-name：只改命名空间行，内部类逐字不变', () => {
    const source = `classDiagram
namespace Shapes {
    class Circle
}
`
    const result = applyEdit(source, classParser, {
      type: 'set-namespace-name',
      elementId: 'namespace:Shapes',
      name: 'Geometry',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('namespace Geometry {\n')
    expect(result.source).toContain('    class Circle\n')
    expect(result.source).not.toContain('namespace Shapes')
  })

  it('set-namespace-name：单行写法只换名字，行尾原文保留', () => {
    const source = 'classDiagram\nnamespace Foo { class A }\n'
    const result = applyEdit(source, classParser, {
      type: 'set-namespace-name',
      elementId: 'namespace:Foo',
      name: 'Bar',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('classDiagram\nnamespace Bar { class A }\n')
  })

  it('rename-class 不触碰 namespace 行（成员行不被移动，工单边界）', () => {
    const source = `classDiagram
namespace Shapes {
    class Circle {
        +double r
    }
}
`
    const result = applyEdit(source, classParser, { type: 'rename-class', name: 'Circle', newName: 'Ring' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('namespace Shapes {\n')
    expect(result.source).toContain('    class Ring {\n')
    expect(result.source).toContain('        +double r\n')
  })

  it('目标不存在时返回错误', () => {
    const result = applyEdit('classDiagram\n', classParser, {
      type: 'set-namespace-name',
      elementId: 'namespace:不存在',
      name: 'X',
    })
    expect(result.ok).toBe(false)
  })
})
