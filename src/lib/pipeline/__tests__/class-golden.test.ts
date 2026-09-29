import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { applyEdit } from '../pipeline'
import { CLASS_TEMPLATE } from '../../diagram-registry'
import { classParser } from '../class'

/**
 * 金样合法性（工单 07）：class 管线产出的源码必须能被 mermaid v12
 * 实际 parse 通过；模板本身也必须是能跑通的示例图。
 */
describe('金样合法性（class）', () => {
  it('模板本身 parse 通过', async () => {
    await expect(mermaid.parse(CLASS_TEMPLATE)).resolves.toBeTruthy()
  })

  it('set-member 产物 parse 通过', async () => {
    const result = applyEdit(CLASS_TEMPLATE, classParser, {
      type: 'set-member',
      elementId: 'member:1',
      text: 'string ownerName',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('add-class / add-member / add-relation / add-note 链式编辑全程 parse 通过', async () => {
    const step1 = applyEdit(CLASS_TEMPLATE, classParser, { type: 'add-class', name: 'Order' })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    await expect(mermaid.parse(step1.source)).resolves.toBeTruthy()

    const step2 = applyEdit(step1.source, classParser, { type: 'add-member', className: 'Order', vis: '+', text: 'List~Item~ items' })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    expect(step2.source).toContain('Order : +List~Item~ items')
    await expect(mermaid.parse(step2.source)).resolves.toBeTruthy()

    const step3 = applyEdit(step2.source, classParser, {
      type: 'add-relation',
      from: 'Customer',
      to: 'Order',
      kind: 'o--',
      cardFrom: '1',
      cardTo: '*',
      label: '下单',
    })
    expect(step3.ok).toBe(true)
    if (!step3.ok) return
    expect(step3.source).toContain('Customer "1" o-- "*" Order : 下单')
    await expect(mermaid.parse(step3.source)).resolves.toBeTruthy()

    const step4 = applyEdit(step3.source, classParser, { type: 'add-note', className: 'Order', text: '订单聚合项' })
    expect(step4.ok).toBe(true)
    if (!step4.ok) return
    await expect(mermaid.parse(step4.source)).resolves.toBeTruthy()
  })

  it('rename-class 后产物 parse 通过（泛型与标签保留）', async () => {
    const result = applyEdit(CLASS_TEMPLATE, classParser, { type: 'rename-class', name: 'BankAccount', newName: 'Wallet' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('class Wallet')
    expect(result.source).toContain('Wallet <|-- Account~T~')
    expect(result.source).toContain('note for Wallet "银行账户"')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('清单外语法（linkStyle、cssClass、direction）不被解析且原样保留', async () => {
    const source = `classDiagram
    class A
    class B
    A <|-- B
    linkStyle 0 stroke:red
    cssClass "B" styled
    direction LR
`
    const parsed = classParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.elements.filter((p) => p.element.kind === 'relation')).toHaveLength(1)
    expect(parsed.doc.elements.filter((p) => p.element.kind === 'classdef')).toHaveLength(0)

    const result = applyEdit(source, classParser, { type: 'rename-class', name: 'A', newName: 'Base' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('linkStyle 0 stroke:red')
    expect(result.source).toContain('cssClass "B" styled')
    expect(result.source).toContain('direction LR')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('全部六种关系类型产物 parse 通过', async () => {
    let source = CLASS_TEMPLATE
    const kinds = ['<|--', '<|..', '*--', 'o--', '-->', '..>'] as const
    for (let i = 0; i < kinds.length; i++) {
      const result = applyEdit(source, classParser, {
        type: 'add-relation',
        from: 'BankAccount',
        to: `Target${i}`,
        kind: kinds[i],
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      source = result.source
    }
    await expect(mermaid.parse(source)).resolves.toBeTruthy()
  })

  it('只有表头的 classDiagram（mermaid 解析错误）：add-class 落码后 parse 通过', async () => {
    const empty = 'classDiagram\n'
    // 空类图在 mermaid 里是解析错误（画布停在错误态），加一个类即修复
    await expect(mermaid.parse(empty)).rejects.toBeTruthy()

    const result = applyEdit(empty, classParser, { type: 'add-class', name: '新类' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('class 新类')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('namespace 改名后产物 parse 通过（工单 06）', async () => {
    const source = `classDiagram
namespace Shapes {
    class Circle {
        +double r
    }
}
`
    await expect(mermaid.parse(source)).resolves.toBeTruthy()

    const result = applyEdit(source, classParser, {
      type: 'set-namespace-name',
      elementId: 'namespace:Shapes',
      name: 'Geometry',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('namespace Geometry {\n')
    expect(result.source).toContain('    class Circle {\n')
    expect(result.source).toContain('        +double r\n')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })
})
