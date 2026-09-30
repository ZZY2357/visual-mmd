import { describe, expect, it } from 'vitest'
import { reassemble, type SourceDocument } from '../document'
import { stateParser, renderStateNote, type StateDeclData, type StateNoteData } from '../state'
import { STATE_TEMPLATE } from '../../diagram-registry'

/**
 * stateDiagram-v2 解析器测试（more-diagrams 工单 02）：
 * verbatim identity（ADR-0004/0008）、覆盖语法清单、意图落码。
 */

function parseOk(source: string): SourceDocument {
  const result = stateParser.parse(source)
  if (!result.ok) throw new Error(`解析失败（${result.error.line}）：${result.error.message}`)
  return result.doc
}

const SIMPLE = `stateDiagram-v2
    [*] --> idle
    idle : 等待用户输入
    idle --> running : 开始处理
    running --> [*]
    state archiving {
        logging
        reporting
    }
    running --> archiving : 归档
    note right of idle
        双击状态可编辑描述
    end note
`

describe('state 解析器：verbatim identity（ADR-0004）', () => {
  it('解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parseOk(SIMPLE), new Map())).toBe(SIMPLE)
  })

  it('起步模板同样逐字还原', () => {
    expect(reassemble(parseOk(STATE_TEMPLATE), new Map())).toBe(STATE_TEMPLATE)
  })

  it('清单外语法逐字保留：classDef / ::: / 注释 / 单行 note', () => {
    const source = `stateDiagram-v2
    %% 注释
    classDef movement font-style:italic;
    class s1 movement
    s1:::movement
    note left of s1 : 单行写法
    s1 --> s2
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })

  it('frontmatter 整体 verbatim 保留', () => {
    const source = `---
config:
  theme: dark
---
stateDiagram-v2
    s1 --> s2
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })

  it('v1 头（stateDiagram）同样被接受', () => {
    const source = `stateDiagram
    s1 --> s2
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })
})

describe('state 解析器：语法覆盖（工单 02 清单）', () => {
  const doc = parseOk(SIMPLE)
  const kinds = doc.elements.map((p) => [p.element.kind, p.id] as const)

  it('起止伪状态转移 / 描述行 / 复合状态 / note 各归各类', () => {
    expect(kinds).toContainEqual(['state-transition', 'transition:1'])
    expect(kinds).toContainEqual(['state-desc', 'state-desc:idle'])
    expect(kinds).toContainEqual(['state-decl', 'state:archiving'])
    expect(kinds).toContainEqual(['state-end', 'state-end:1'])
    expect(kinds).toContainEqual(['state-note', 'note:1'])
    expect(doc.elements.filter((p) => p.element.kind === 'state-transition')).toHaveLength(4)
  })

  it('转移端点与标签逐字段解析', () => {
    const t4 = doc.elements.find((p) => p.id === 'transition:4')
    expect(t4?.element).toMatchObject({ from: 'running', to: 'archiving', label: ' 归档' })
  })

  it('note 块 span 覆盖 note 行到 end note 行，body 含中间行', () => {
    const note = doc.elements.find((p) => p.element.kind === 'state-note')
    expect(note !== undefined && note.span.end > note.span.start).toBe(true)
    expect((note?.element as StateNoteData).body).toContain('双击状态可编辑描述')
  })

  it('choice/fork/join 伪状态标注进入声明', () => {
    const source = `stateDiagram-v2
    state c1 <<choice>>
    state f1 <<fork>>
    state j1 <<join>>
    c1 --> f1
`
    const doc2 = parseOk(source)
    const decls = doc2.elements.filter((p) => p.element.kind === 'state-decl')
    expect(decls.map((p) => (p.element as StateDeclData).pseudo)).toEqual(['choice', 'fork', 'join'])
  })

  it('并发分区 -- 与嵌套复合状态、direction 逐行归类', () => {
    const source = `stateDiagram-v2
    direction LR
    state s {
        state inner {
            a
        }
        --
        b
    }
`
    const doc2 = parseOk(source)
    expect(doc2.elements.some((p) => p.element.kind === 'state-partition')).toBe(true)
    expect(doc2.elements.filter((p) => p.element.kind === 'state-end')).toHaveLength(2)
    expect(doc2.elements.some((p) => p.element.kind === 'state-direction')).toBe(true)
  })

  it('未闭合复合 / 多余 } / 未闭合 note 是解析错误（带行号）', () => {
    expect(stateParser.parse('stateDiagram-v2\nstate s {\n')).toMatchObject({ ok: false, error: { line: 2 } })
    expect(stateParser.parse('stateDiagram-v2\n}\n')).toMatchObject({ ok: false, error: { line: 2 } })
    expect(stateParser.parse('stateDiagram-v2\nnote right of s\n')).toMatchObject({ ok: false, error: { line: 2 } })
  })
})

describe('state 意图落码（手术式改写）', () => {
  it('add-state：缺省锚点落文档末尾', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = stateParser.resolveRewrites(doc, { type: 'add-state', id: 'paused' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites as Map<string, string>)
    expect(next).toContain('state paused')
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('add-state：parentElementId 落进复合状态内部（} 之前）', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = stateParser.resolveRewrites(doc, {
      type: 'add-state',
      id: 'pending',
      parentElementId: 'state:archiving',
    })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites as Map<string, string>)
    expect(next).toMatch(/state pending\n {4}\}/)
    expect(reassemble(parseOk(next), new Map())).toBe(next)
  })

  it('set-state-desc：改 id : desc 的 desc 段（其余逐字保留）', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = stateParser.resolveRewrites(doc, { type: 'set-state-desc', id: 'idle', desc: '新描述' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites as Map<string, string>)
    expect(next).toContain('idle : 新描述')
    expect(next).toContain('idle --> running : 开始处理')
  })

  it('set-state-desc：bare 声明补一行 id : desc；引号形态原地改写', () => {
    const doc = parseOk('stateDiagram-v2\nstate a\nstate "旧" as b\n')
    const next1 = reassemble(doc, stateParser.resolveRewrites(doc, { type: 'set-state-desc', id: 'a', desc: '描述 a' }) as Map<string, string>)
    expect(next1).toContain('state a\na : 描述 a')
    const next2 = reassemble(doc, stateParser.resolveRewrites(doc, { type: 'set-state-desc', id: 'b', desc: '新' }) as Map<string, string>)
    expect(next2).toContain('state "新" as b')
  })

  it('delete-state：级联删声明、描述、触及转移与 note；复合块整体删除', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = stateParser.resolveRewrites(doc, { type: 'delete-state', id: 'idle' })
    expect(rewrites).not.toBeNull()
    const next = reassemble(doc, rewrites as Map<string, string>)
    expect(next).not.toContain('idle')
    expect(next).not.toContain('等待用户输入')
    expect(next).toContain('running --> [*]')
    expect(next).toContain('archiving')
  })

  it('delete-state：复合状态连同内部状态一起删除', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, stateParser.resolveRewrites(doc, { type: 'delete-state', id: 'archiving' }) as Map<string, string>)
    expect(next).not.toContain('logging')
    expect(next).not.toContain('running --> archiving')
    expect(next.trim().split('\n').some((l) => l.trim() === '}')).toBe(false)
  })

  it('add-transition + set-transition-label + delete-transition', () => {
    const doc = parseOk(SIMPLE)
    const next1 = reassemble(
      doc,
      stateParser.resolveRewrites(doc, { type: 'add-transition', from: 'idle', to: 'archiving', label: '绕过' }) as Map<string, string>,
    )
    expect(next1).toContain('idle --> archiving : 绕过')
    const doc1 = parseOk(next1)
    const next2 = reassemble(doc1, stateParser.resolveRewrites(doc1, { type: 'set-transition-label', elementId: 'transition:5', label: null }) as Map<string, string>)
    expect(next2).toContain('idle --> archiving')
    expect(next2).not.toContain('绕过')
    const next3 = reassemble(parseOk(next2), stateParser.resolveRewrites(parseOk(next2), { type: 'delete-transition', elementId: 'transition:5' }) as Map<string, string>)
    expect(next3).not.toContain('idle --> archiving')
  })

  it('add-note / set-note-text / delete-note 用 renderStateNote 重建整块', () => {
    const doc = parseOk(SIMPLE)
    const next1 = reassemble(
      doc,
      stateParser.resolveRewrites(doc, { type: 'add-note', side: 'left', target: 'running', text: '左侧注释' }) as Map<string, string>,
    )
    expect(next1).toContain('note left of running')
    const doc1 = parseOk(next1)
    const next2 = reassemble(doc1, stateParser.resolveRewrites(doc1, { type: 'set-note-text', elementId: 'note:2', text: '改过的话' }) as Map<string, string>)
    expect(next2).toContain('改过的话')
    expect(next2).toBe(reassemble(parseOk(next2), new Map()))
    expect(renderStateNote({ kind: 'state-note', indent: '    ', side: 'left', target: 'x', body: '    hi\n' })).toContain('end note')
  })

  it('set-direction：新增 / 改写 / 删除；非法取值拒绝', () => {
    const doc = parseOk(SIMPLE)
    const next1 = reassemble(doc, stateParser.resolveRewrites(doc, { type: 'set-direction', direction: 'LR' }) as Map<string, string>)
    expect(next1).toContain('direction LR')
    expect(next1.indexOf('direction LR')).toBeGreaterThan(next1.indexOf('stateDiagram-v2'))
    const doc1 = parseOk(next1)
    const next2 = reassemble(doc1, stateParser.resolveRewrites(doc1, { type: 'set-direction', direction: 'BT' }) as Map<string, string>)
    expect(next2).toContain('direction BT')
    expect(next2).not.toContain('direction LR')
    const doc2 = parseOk(next2)
    const next3 = reassemble(doc2, stateParser.resolveRewrites(doc2, { type: 'set-direction', direction: null }) as Map<string, string>)
    expect(next3).not.toContain('direction BT')
    expect(stateParser.resolveRewrites(doc, { type: 'set-direction', direction: 'TD' })).toBeNull()
  })
})
