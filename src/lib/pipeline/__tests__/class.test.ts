import { describe, expect, it } from 'vitest'
import { applyEdit } from '../pipeline'
import { reassemble } from '../document'
import { classParser } from '../class'

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
