import { describe, expect, it } from 'vitest'
import { flowchartParser } from '../../pipeline/flowchart'
import { sequenceParser } from '../../pipeline/sequence'
import { buildFollowIndex, buildSourceIndex, selectionAtSourceOffset, spanOfSelection } from '../source-index'
import { DEFAULT_DIAGRAM_SOURCE } from '../../storage'

/**
 * 跟随索引（工单 16）：选中 ↔ 源码区间的桥。
 * 覆盖 flowchart（节点 / 连线 / classDef）与 sequence（参与者 / 消息）两种图种，
 * 以及未覆盖图种的静默降级。
 */

function flowchartIndex() {
  const parsed = flowchartParser.parse(DEFAULT_DIAGRAM_SOURCE)
  if (!parsed.ok) throw new Error('样例必须可解析')
  return { doc: parsed.doc, index: buildFollowIndex('flowchart', parsed.doc) }
}

describe('follow/source-index（工单 16）', () => {
  it('选中 → 源码区间：节点 A 的 span 覆盖其源码出现', () => {
    const { index, doc } = flowchartIndex()
    const span = index.spanOf({ kind: 'node', nodeId: 'A' })
    expect(span).not.toBeNull()
    const text = doc.source.slice(span!.start, span!.end)
    expect(text).toBe('A[开始]')
  })

  it('选中 → 元素 id 与 id → 选中互逆', () => {
    const { index } = flowchartIndex()
    const elementId = index.elementIdFor({ kind: 'node', nodeId: 'B' })
    expect(elementId).not.toBeNull()
    expect(index.selectionForElementId(elementId!)).toEqual({ kind: 'node', nodeId: 'B' })
  })

  it('光标偏移落在元素区间内 → 对应选中；空行/区间外 → null', () => {
    const { index, doc } = flowchartIndex()
    const nodeSpan = index.spanOf({ kind: 'node', nodeId: 'C' })!
    expect(index.selectionAtOffset(nodeSpan.start)).toEqual({ kind: 'node', nodeId: 'C' })
    expect(index.selectionAtOffset(nodeSpan.end - 1)).toEqual({ kind: 'node', nodeId: 'C' })
    // 文档末尾换行之后（不在任何元素区间）
    expect(index.selectionAtOffset(doc.source.length - 1)).toBeNull()
  })

  it('flowchart 连线选中也有 span', () => {
    const { index, doc } = flowchartIndex()
    const span = index.spanOf({ kind: 'edge', from: 'A', to: 'B', occurrence: 1 })
    expect(span).not.toBeNull()
    expect(doc.source.slice(span!.start, span!.end)).toContain('-->')
  })

  it('sequence：参与者与消息可跟随', () => {
    const source = 'sequenceDiagram\n    participant A as 甲\n    A->>B: 你好\n'
    const parsed = sequenceParser.parse(source)
    if (!parsed.ok) throw new Error('样例必须可解析')
    const index = buildFollowIndex('sequence', parsed.doc)
    expect(index.spanOf({ kind: 'participant', actorId: 'A' })).not.toBeNull()
    const message = index.selectionAtOffset(source.indexOf('你好'))
    expect(message).toEqual({ kind: 'message', elementId: 'message:1' })
  })

  it('未覆盖图种（gitgraph）→ 空索引，全部查询静默返回 null', () => {
    const source = 'gitGraph\n    commit id: "init"\n'
    const built = buildSourceIndex(source)
    expect(built).not.toBeNull()
    expect(built!.typeId).toBe('gitgraph')
    expect(built!.index.elementIdFor({ kind: 'gitgraph-commit', elementId: 'commit:1' })).toBeNull()
    expect(built!.index.selectionAtOffset(10)).toBeNull()
  })

  it('源码无法解析 → buildSourceIndex 返回 null（静默降级）', () => {
    expect(buildSourceIndex('flowchart TD\n  A[未闭合')).toBeNull()
  })

  it('便利函数：spanOfSelection / selectionAtSourceOffset 直接吃源码', () => {
    const span = spanOfSelection(DEFAULT_DIAGRAM_SOURCE, { kind: 'node', nodeId: 'D' })
    expect(span).not.toBeNull()
    expect(selectionAtSourceOffset(DEFAULT_DIAGRAM_SOURCE, span!.start)).toEqual({ kind: 'node', nodeId: 'D' })
    // 不可寻址 kind（diagram）→ 无 span
    expect(spanOfSelection(DEFAULT_DIAGRAM_SOURCE, { kind: 'diagram' })).toBeNull()
  })
})
