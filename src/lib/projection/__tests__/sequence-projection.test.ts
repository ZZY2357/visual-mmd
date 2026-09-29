import { describe, expect, it } from 'vitest'
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
