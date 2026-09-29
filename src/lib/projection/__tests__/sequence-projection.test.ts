import { describe, expect, it } from 'vitest'
import { parseParticipantElementId } from '../../pipeline/element-id'
import { sequenceParser } from '../../pipeline/sequence'
import { buildSequenceProjection, resolveSequenceSelection } from '../sequence-projection'

/**
 * sequence 投影：参与者按 actorId 合并（工单 10）。
 *
 * 隐式引用（消息 / note / activate 里先出现）与显式声明（participant / actor）必须合成
 * 一个投影参与者；否则结构树出重复项、React 报 duplicate key（消息里先出现、声明在后）。
 * 顺序取首次出现顺序——与 mermaid 的 actor 插入顺序一致（用 mermaid v12 实测：
 * `A->>B` + 后置 `participant B as Bee` → ['A','B']；`participant B as Bee` 在前 → ['B','A']）。
 */

function project(source: string) {
  const parsed = sequenceParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
  return buildSequenceProjection(parsed.doc)
}

const actorIds = (source: string) => project(source).participants.map((p) => p.actorId)

describe('buildSequenceProjection：参与者按 actorId 合并（工单 10）', () => {
  it('消息先于声明：隐式引用与显式声明合成一个，显示声明别名', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n    participant B as Bee\n')

    expect(proj.participants).toHaveLength(2)
    expect(proj.participants.map((p) => p.actorId)).toEqual(['A', 'B'])
    // 声明信息优先：alias 显示文本 + elementId 指向声明（编辑意图据此寻址）
    expect(proj.participants[1]).toEqual({
      actorId: 'B',
      alias: 'Bee',
      keyword: 'participant',
      elementId: 'participant:B',
      active: false,
    })
    // 隐式参与者仍带 `participant:<id>` 寻址
    expect(proj.participants[0]).toEqual({
      actorId: 'A',
      alias: null,
      keyword: 'participant',
      elementId: 'participant:A',
      active: false,
    })
  })

  it('手写最小复现：A->>B 在 participant B as Bee 之前 → 参与者恰好 2 个', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n    participant B as Bee\n')

    expect(proj.participants.map((p) => p.actorId)).toEqual(['A', 'B'])
    expect(new Set(proj.participants.map((p) => p.actorId)).size).toBe(2)
    // 结构树 key = actorId 唯一；显示文本用声明别名
    expect(proj.participants.map((p) => p.alias ?? p.actorId)).toEqual(['A', 'Bee'])
  })

  it('声明先于消息（对照，防回归）', () => {
    const proj = project('sequenceDiagram\n    participant B as Bee\n    A->>B: hi\n')

    expect(proj.participants.map((p) => p.actorId)).toEqual(['B', 'A'])
    expect(proj.participants[0]?.alias).toBe('Bee')
    expect(proj.messages).toHaveLength(1)
  })

  it('顺序 = 首次出现（声明位置影响顺序，与 mermaid 一致）', () => {
    // 引用在前 → 先出现的 A 排前；声明在前 → 声明的 B 排前
    expect(actorIds('sequenceDiagram\n    A->>B: hi\n    participant B as Bee\n')).toEqual(['A', 'B'])
    expect(actorIds('sequenceDiagram\n    participant B as Bee\n    A->>B: hi\n')).toEqual(['B', 'A'])
  })

  it('actor X 形态：小人样式来自声明；消息里先出现的另一方为隐式参与者', () => {
    const proj = project('sequenceDiagram\n    actor 甲\n    甲->>乙: hi\n')

    expect(proj.participants.map((p) => [p.actorId, p.keyword, p.elementId])).toEqual([
      ['甲', 'actor', 'participant:甲'],
      ['乙', 'participant', 'participant:乙'],
    ])
  })

  it('participant X as Y 形态：别名去引号后透出', () => {
    const proj = project('sequenceDiagram\n    participant B as "Bee Hive"\n    A->>B: hi\n')
    expect(proj.participants.find((p) => p.actorId === 'B')?.alias).toBe('Bee Hive')
  })

  it('两种形态混用：引用的隐式参与者不串位，声明 actor 仍是 actor', () => {
    const proj = project(
      'sequenceDiagram\n    actor 使用者\n    使用者->>系统: M1\n    participant 系统 as Visual MMD\n    使用者->>系统: 打开图表\n',
    )

    expect(proj.participants.map((p) => p.actorId)).toEqual(['使用者', '系统'])
    expect(proj.participants[0]?.keyword).toBe('actor')
    // 不再出现「Visual MMD系统」这类拼接错位的第二个投影项
    expect(proj.participants[1]).toMatchObject({ alias: 'Visual MMD', keyword: 'participant', elementId: 'participant:系统' })
    expect(proj.messages).toHaveLength(2)
  })

  it('autonumber + 多条消息的完整复现：参与者数与 mermaid 渲染一致', () => {
    const proj = project(
      'sequenceDiagram\n    autonumber\n    actor 使用者\n    使用者->>系统: M1\n    participant 系统 as Visual MMD\n    使用者->>系统: 打开图表\n',
    )

    expect(proj.autonumber).toBe(true)
    expect(proj.participants).toHaveLength(2)
    expect(proj.participants.map((p) => p.alias ?? p.actorId)).toEqual(['使用者', 'Visual MMD'])
  })

  it('note 先引用后声明：同样合并为一个参与者', () => {
    const proj = project('sequenceDiagram\n    Note over A,B: 说明\n    participant B as Bee\n')

    expect(proj.participants.map((p) => p.actorId)).toEqual(['A', 'B'])
    expect(proj.participants[1]?.alias).toBe('Bee')
    expect(proj.notes).toHaveLength(1)
  })

  it('只在 `Note right of X` / `Note left of X` 里出现的参与者：隐式列出且只一次（工单 13）', () => {
    const onlyRight = project('sequenceDiagram\n    Note right of 乙: 注释\n')
    expect(onlyRight.participants.map((p) => p.actorId)).toEqual(['乙'])
    expect(onlyRight.participants).toHaveLength(1)
    expect(onlyRight.notes).toEqual([{ elementId: 'note:1', pos: 'right', actors: ['乙'], text: '注释' }])

    // 与显式声明合并后仍只有一个投影项（结构树 key 唯一）
    const withDecl = project('sequenceDiagram\n    actor 甲\n    Note right of 乙: 注释\n    participant 乙 as Bee\n')
    expect(withDecl.participants.map((p) => p.actorId)).toEqual(['甲', '乙'])
    expect(withDecl.participants.find((p) => p.actorId === '乙')?.alias).toBe('Bee')

    const onlyLeft = project('sequenceDiagram\n    actor 甲\n    Note left of 乙: 注释\n')
    expect(onlyLeft.participants.map((p) => p.actorId)).toEqual(['甲', '乙'])
  })

  it('activate 落在隐式引用的参与者上：合并后 active 生效', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n    activate B\n    participant B as Bee\n')

    expect(proj.participants.map((p) => p.actorId)).toEqual(['A', 'B'])
    expect(proj.participants[1]).toMatchObject({ alias: 'Bee', active: true })
  })

  it('deactivate 落在隐式引用的参与者上：净状态为关，仍只有一个投影项', () => {
    const proj = project(
      'sequenceDiagram\n    A->>B: hi\n    activate B\n    B-->>A: ok\n    deactivate B\n    participant B as Bee\n',
    )

    expect(proj.participants.map((p) => p.actorId)).toEqual(['A', 'B'])
    expect(proj.participants[1]).toMatchObject({ alias: 'Bee', active: false })
  })

  it('消息简写 +/- 的 activeDelta 落到合并后的参与者', () => {
    const activated = project('sequenceDiagram\n    A->>+B: hi\n    participant B as Bee\n')
    expect(activated.participants.map((p) => p.actorId)).toEqual(['A', 'B'])
    expect(activated.participants[1]?.active).toBe(true)

    const deactivated = project('sequenceDiagram\n    A->>+B: hi\n    participant B as Bee\n    A-->>-B: bye\n')
    expect(deactivated.participants[1]?.active).toBe(false)
  })

  it('activate 于未在消息中出现的参与者：仍产生一个隐式参与者（无声明时）', () => {
    const proj = project('sequenceDiagram\n    participant A\n    activate A\n    activate B\n')

    expect(proj.participants.map((p) => [p.actorId, p.active])).toEqual([
      ['A', true],
      ['B', true],
    ])
  })

  it('同一 actorId 的多次引用只留一项（结构树 key 唯一）', () => {
    const proj = project(
      'sequenceDiagram\n    A->>B: 1\n    B->>A: 2\n    Note over A: 3\n    participant A as 甲\n    participant B as 乙\n    A->>B: 4\n',
    )

    const ids = proj.participants.map((p) => p.actorId)
    expect(ids).toEqual(['A', 'B'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('不回归：消息 / note / 逻辑块 / autonumber 照常投影', () => {
    const proj = project(
      [
        'sequenceDiagram',
        '    autonumber',
        '    participant 甲',
        '    participant 乙',
        '    甲->>乙: hi',
        '    Note over 甲,乙: 说明',
        '    alt 条件',
        '        甲->>乙: in',
        '    else 否则',
        '        乙->>甲: out',
        '    end',
        '',
      ].join('\n'),
    )

    expect(proj.participants.map((p) => p.actorId)).toEqual(['甲', '乙'])
    expect(proj.messages.map((m) => [m.elementId, m.from, m.to, m.text])).toEqual([
      ['message:1', '甲', '乙', 'hi'],
      ['message:2', '甲', '乙', 'in'],
      ['message:3', '乙', '甲', 'out'],
    ])
    expect(proj.notes).toEqual([{ elementId: 'note:1', pos: 'over', actors: ['甲', '乙'], text: '说明' }])
    expect(proj.blocks.map((b) => [b.elementId, b.keyword, b.depth])).toEqual([
      ['block:1', 'alt', 1],
      ['else:1', 'else', 1],
    ])
  })
})

// ---------- 隐式参与者的 elementId（工单 01） ----------

/**
 * 隐式参与者（只在消息 / note / activate 里出现、没有声明行）的 elementId 是**投影合成的**：
 * 它在文档里并不存在，是投影按协议造出来给表单与结构树寻址用的（ADR-0010 相关的有意行为）。
 * 工单 01 把它改为调用元素 ID codec，形态必须逐字不变——这里钉住。
 */
describe('隐式参与者的 elementId 由 codec 合成，形态与声明一致（工单 01）', () => {
  const parse = (source: string) => {
    const parsed = sequenceParser.parse(source)
    if (!parsed.ok) throw new Error(`样例源码必须可解析：${parsed.error.message}`)
    return parsed.doc
  }

  it('从未声明的参与者：合成 `participant:<actorId>`（不带 occurrence 后缀）', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n')

    expect(proj.participants.map((p) => p.elementId)).toEqual(['participant:A', 'participant:B'])
    // 合成出来的 id 能被 codec 解回原 actorId，occurrence 为 1
    expect(parseParticipantElementId('participant:A')).toEqual({ actorId: 'A', occurrence: 1 })
  })

  it('该 id 在文档里确实不存在（没有声明行）——合成是有意行为，不是漏解析', () => {
    const doc = parse('sequenceDiagram\n    A->>B: hi\n')

    expect(doc.elements.some((e) => e.id === 'participant:A')).toBe(false)
    expect(doc.elements.some((e) => e.id === 'participant:B')).toBe(false)
  })

  it('有声明时用声明行的 id（重名的第二次声明带 `#2`，不被合成覆盖）', () => {
    const proj = project('sequenceDiagram\n    participant A\n    participant A\n    A->>B: hi\n')

    expect(proj.participants.map((p) => [p.actorId, p.elementId])).toEqual([
      ['A', 'participant:A#2'],
      ['B', 'participant:B'],
    ])
    expect(parseParticipantElementId('participant:A#2')).toEqual({ actorId: 'A', occurrence: 2 })
  })

  it('隐式参与者在声明之前出现时，两者仍合并为一个（elementId 取声明行）', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n    participant B as Bee\n')

    expect(proj.participants.map((p) => [p.actorId, p.elementId])).toEqual([
      ['A', 'participant:A'],
      ['B', 'participant:B'],
    ])
  })
})

// ---------- autonumber 起始值 / 步长进投影（工单 08） ----------

describe('autonumber 起始值 / 步长进投影（工单 08）', () => {
  it('无 autonumber 行：autonumber=false，start/step 均为 null', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n')
    expect(proj.autonumber).toBe(false)
    expect(proj.autonumberStart).toBeNull()
    expect(proj.autonumberStep).toBeNull()
  })

  it('无参 autonumber：start/step 均为 null', () => {
    const proj = project('sequenceDiagram\n    autonumber\n    A->>B: hi\n')
    expect(proj.autonumber).toBe(true)
    expect(proj.autonumberStart).toBeNull()
    expect(proj.autonumberStep).toBeNull()
  })

  it('autonumber 10 10：起始值与步长原文透出', () => {
    const proj = project('sequenceDiagram\n    autonumber 10 10\n    A->>B: hi\n')
    expect(proj.autonumber).toBe(true)
    expect(proj.autonumberStart).toBe('10')
    expect(proj.autonumberStep).toBe('10')
  })

  it('autonumber 5：只有起始值', () => {
    const proj = project('sequenceDiagram\n    autonumber 5\n    A->>B: hi\n')
    expect(proj.autonumberStart).toBe('5')
    expect(proj.autonumberStep).toBeNull()
  })
})

describe('resolveSequenceSelection：合并后按 actorId 命中（工单 10）', () => {
  it('选中在消息中先出现的参与者仍解析到投影项', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n    participant B as Bee\n')
    expect(resolveSequenceSelection(proj, { kind: 'participant', actorId: 'B' })).toEqual({
      kind: 'participant',
      actorId: 'B',
    })
    expect(resolveSequenceSelection(proj, { kind: 'participant', actorId: '不存在' })).toBeNull()
  })
})

// ---------- create 引入的参与者（工单 01，ADR-0014） ----------

describe('create 引入的参与者进投影（工单 01）', () => {
  it('create participant B：进投影、created 标记为真、elementId 指向声明行', () => {
    const proj = project('sequenceDiagram\n    create participant B as Bee\n    A->>B: hi\n')

    expect(proj.participants.map((p) => p.actorId)).toEqual(['B', 'A'])
    expect(proj.participants[0]).toMatchObject({
      actorId: 'B',
      alias: 'Bee',
      keyword: 'participant',
      elementId: 'participant:B',
      active: false,
      created: true,
    })
  })

  it('create actor 关键字透出为 actor', () => {
    const proj = project('sequenceDiagram\n    create actor C\n    C->>C: 自转\n')

    expect(proj.participants[0]).toMatchObject({ actorId: 'C', keyword: 'actor', alias: null, created: true })
  })

  it('隐式引用的参与者不带 created 标记（可选字段缺省，防结构树误标）', () => {
    const proj = project('sequenceDiagram\n    create participant B\n    A->>B: hi\n')

    expect(proj.participants.find((p) => p.actorId === 'A')).not.toHaveProperty('created')
    expect(proj.participants.find((p) => p.actorId === 'B')).toHaveProperty('created', true)
  })

  it('普通声明的参与者不带 created 标记（对照）', () => {
    const proj = project('sequenceDiagram\n    participant B as Bee\n    A->>B: hi\n')

    expect(proj.participants.find((p) => p.actorId === 'B')).not.toHaveProperty('created')
  })

  it('create 与后续消息引用归并为同一条参与者（不重复、不串位）', () => {
    const proj = project('sequenceDiagram\n    create participant B\n    A->>B: hi\n    B-->>A: ok\n')

    expect(proj.participants.map((p) => p.actorId)).toEqual(['B', 'A'])
    expect(proj.messages).toHaveLength(2)
  })

  it('destroy 不进投影；rect / box 只进 regions、不改变参与者集合（工单 06）', () => {
    const proj = project(
      `sequenceDiagram
    participant B
    A->>B: hi
    destroy A
    rect rgb(0, 0, 0)
    end
    box 分组
        participant C
    end
`,
    )

    expect(proj.participants.map((p) => p.actorId)).toEqual(['B', 'A', 'C'])
    expect(proj.participants.every((p) => p.created !== true)).toBe(true)
    expect(proj.regions).toEqual([
      { elementId: 'rect:1', kind: 'rect', color: 'rgb(0, 0, 0)' },
      { elementId: 'box:1', kind: 'box', color: null, label: '分组' },
    ])
  })
})

// ---------- rect / box 进投影（工单 06，ADR-0014） ----------

describe('rect / box 进投影为区域节点（工单 06）', () => {
  it('rect 与 box 按文档顺序各自成项；box 透出颜色与标签', () => {
    const proj = project(
      `sequenceDiagram
    rect rgb(200, 150, 255)
    end
    box Purple 数据库组
        participant DB
    end
    rect #eee
    end
`,
    )

    expect(proj.regions).toEqual([
      { elementId: 'rect:1', kind: 'rect', color: 'rgb(200, 150, 255)' },
      { elementId: 'box:1', kind: 'box', color: 'Purple', label: '数据库组' },
      { elementId: 'rect:2', kind: 'rect', color: '#eee' },
    ])
  })

  it('无 rect / box 时 regions 为空数组（既有图形不回归）', () => {
    const proj = project('sequenceDiagram\n    A->>B: hi\n')
    expect(proj.regions).toEqual([])
  })

  it('resolveSequenceSelection：区域节点按 elementId 命中', () => {
    const proj = project('sequenceDiagram\n    rect rgb(0,0,0)\n    end\n')
    expect(resolveSequenceSelection(proj, { kind: 'seq-region', elementId: 'rect:1' })).toEqual({
      kind: 'seq-region',
      elementId: 'rect:1',
    })
    expect(resolveSequenceSelection(proj, { kind: 'seq-region', elementId: 'rect:9' })).toBeNull()
  })
})
