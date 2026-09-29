import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { applyEdit } from '../pipeline'
import { SEQUENCE_TEMPLATE } from '../../diagram-registry'
import { sequenceParser } from '../sequence'

/**
 * 金样合法性（工单 06）：sequence 管线产出的源码必须能被 mermaid v12
 * 实际 parse 通过；模板本身也必须是能跑通的示例图。
 */

describe('金样合法性（sequence）', () => {
  it('模板本身 parse 通过', async () => {
    await expect(mermaid.parse(SEQUENCE_TEMPLATE)).resolves.toBeTruthy()
  })

  it('set-message 文本产物 parse 通过', async () => {
    const result = applyEdit(SEQUENCE_TEMPLATE, sequenceParser, {
      type: 'set-message',
      elementId: 'message:1',
      text: '你好，时序图',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('使用者->>系统: 你好，时序图')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('add-message / add-note / add-block / add-else 链式编辑全程 parse 通过', async () => {
    const step1 = applyEdit(SEQUENCE_TEMPLATE, sequenceParser, {
      type: 'add-message',
      from: '系统',
      to: '使用者',
      arrow: '-x',
      act: '+',
      text: '丢失的消息',
    })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    expect(step1.source).toContain('系统-x+使用者: 丢失的消息')
    await expect(mermaid.parse(step1.source)).resolves.toBeTruthy()

    const step2 = applyEdit(step1.source, sequenceParser, {
      type: 'add-note',
      pos: 'over',
      actors: ['使用者', '系统'],
      text: '全程表单操作',
    })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    await expect(mermaid.parse(step2.source)).resolves.toBeTruthy()

    const step3 = applyEdit(step2.source, sequenceParser, {
      type: 'add-block',
      keyword: 'alt',
      label: '有网',
    })
    expect(step3.ok).toBe(true)
    if (!step3.ok) return
    const parsed = sequenceParser.parse(step3.source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const block = parsed.doc.elements.filter((p) => p.element.kind === 'block-open').pop()
    expect(block).toBeDefined()
    const step4 = applyEdit(step3.source, sequenceParser, {
      type: 'add-else',
      blockId: (block as { id: string }).id,
      label: '离线',
    })
    expect(step4.ok).toBe(true)
    if (!step4.ok) return
    expect(step4.source).toContain('    alt 有网\n    else 离线\n    end')
    await expect(mermaid.parse(step4.source)).resolves.toBeTruthy()
  })

  it('rename-participant 后产物 parse 通过（虚线箭头 -->> 与激活简写保留）', async () => {
    const result = applyEdit(SEQUENCE_TEMPLATE, sequenceParser, {
      type: 'rename-participant',
      actorId: '使用者',
      newId: 'Client',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('actor Client')
    expect(result.source).toContain('Client->>系统: 打开图表')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('清单外语法（--x 虚线叉头）不被解析为消息，参与者改名不触碰它', async () => {
    const source = `sequenceDiagram
    participant A
    A->>B: 正常
    A--xB: 清单外虚线叉头
`
    const parsed = sequenceParser.parse(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.elements.filter((p) => p.element.kind === 'message')).toHaveLength(1)

    const result = applyEdit(source, sequenceParser, { type: 'rename-participant', actorId: 'A', newId: 'Client' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('A--xB: 清单外虚线叉头')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('create 引入的参与者改别名后产物 parse 通过（create 前缀保留，工单 01）', async () => {
    const source = `sequenceDiagram
    create participant B as Bee
    A->>B: hi
`
    const result = applyEdit(source, sequenceParser, { type: 'set-participant', actorId: 'B', alias: '乙' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('create participant B as 乙')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('create 引入的参与者改名后产物 parse 通过（create 行与消息引用一起改，工单 01）', async () => {
    const source = `sequenceDiagram
    create participant B as Bee
    A->>B: hi
`
    const result = applyEdit(source, sequenceParser, { type: 'rename-participant', actorId: 'B', newId: 'Srv' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('create participant Srv as Bee')
    expect(result.source).toContain('A->>Srv: hi')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('只有表头的 sequenceDiagram：add-participant 落码后 parse 通过（不带 alias）', async () => {
    const empty = 'sequenceDiagram\n'
    const result = applyEdit(empty, sequenceParser, { type: 'add-participant', actorId: '新参与者' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toContain('participant 新参与者')
    expect(result.source).not.toContain(' as ')
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  it('只有表头的 sequenceDiagram：落码后改名（内联命名提交路径）仍 parse 通过', async () => {
    const step1 = applyEdit('sequenceDiagram\n', sequenceParser, { type: 'add-participant', actorId: '新参与者' })
    expect(step1.ok).toBe(true)
    if (!step1.ok) return
    const step2 = applyEdit(step1.source, sequenceParser, {
      type: 'rename-participant',
      actorId: '新参与者',
      newId: '服务端',
    })
    expect(step2.ok).toBe(true)
    if (!step2.ok) return
    expect(step2.source).toContain('participant 服务端')
    await expect(mermaid.parse(step2.source)).resolves.toBeTruthy()
  })

  it('delete-participant 级联删空的 loop 被移除后 parse 通过（工单 11）', async () => {
    const result = applyEdit(SEQUENCE_TEMPLATE, sequenceParser, { type: 'delete-participant', actorId: '系统' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).not.toContain('loop')
    expect(result.source).not.toMatch(/^[ \t]*end[ \t]*$/m)
    await expect(mermaid.parse(result.source)).resolves.toBeTruthy()
  })

  /**
   * 对照（工单 11）：空 loop 本身语法合法、mermaid.parse 会通过，畸形点在"空块"结构，
   * 渲染期才产出成批 `attribute …: Expected length, "NaN"` console error。
   * happy-dom 下 mermaid.render 不可用（`svg element not in render tree`），
   * 故"不产生 NaN 属性"由 sequence.test.ts 的 expectNoEmptyBranch 结构断言保证。
   */
  it('对照：空 loop 源文本本身也能 parse 通过（故金样合法性不足以拦住该缺陷）', async () => {
    await expect(mermaid.parse('sequenceDiagram\n    actor A\n    loop 每次编辑\n    end\n')).resolves.toBeTruthy()
  })

  it('rect / box 改色值与标签后产物 parse 通过（工单 06）', async () => {
    const source = `sequenceDiagram
    rect rgb(200, 150, 255)
        A->>B: hi
    end
    box Purple 数据库组
        participant DB
    end
`
    await expect(mermaid.parse(source)).resolves.toBeTruthy()

    const rect = applyEdit(source, sequenceParser, { type: 'set-rect-color', elementId: 'rect:1', color: 'rgb(255, 0, 0)' })
    expect(rect.ok).toBe(true)
    if (!rect.ok) return
    expect(rect.source).toContain('    rect rgb(255, 0, 0)\n')
    await expect(mermaid.parse(rect.source)).resolves.toBeTruthy()

    const box = applyEdit(source, sequenceParser, { type: 'set-box-label', elementId: 'box:1', label: '存储层' })
    expect(box.ok).toBe(true)
    if (!box.ok) return
    expect(box.source).toContain('    box Purple 存储层\n')
    await expect(mermaid.parse(box.source)).resolves.toBeTruthy()
  })
})
