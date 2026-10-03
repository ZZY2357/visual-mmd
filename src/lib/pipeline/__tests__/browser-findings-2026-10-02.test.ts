import { beforeEach, describe, expect, it } from 'vitest'
import { resetEditorHistory, useEditorStore } from '../../../store/editor'
import { flowchartParser } from '../flowchart'
import { applyEdit } from '../pipeline'
import { flowchartKeyPlan } from '../flowchart-keyboard'
import { applyPlan } from '../key-plan'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'

/**
 * browser-test-findings-2026-10-02.md 的回归钉：
 * 黑盒 GUI 实测暴露的两个落码缺陷，在 store / pipeline 层建立反馈回路。
 */

const SRC = 'flowchart TD\n    A[开始] --> B[处理]\n'

function projectionOf(source: string) {
  const parsed = flowchartParser.parse(source)
  if (!parsed.ok) throw new Error(`样例源码必须可解析：${String(parsed.error)}`)
  return buildFlowchartProjection(parsed.doc)
}

describe('实测发现 1：撤销"添加节点"不应产生孤立节点', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(SRC)
  })

  it('Tab 添加子节点是一个原子撤销步骤：改名后再撤销两次应回到添加前', () => {
    const plan = flowchartKeyPlan(projectionOf(SRC), {
      key: 'Tab',
      selection: { kind: 'node', nodeId: 'A' },
    })
    expect(plan).not.toBeNull()
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    const ok = applyPlan(plan!, { commitIntent, commitIntents, select })
    expect(ok).toBe(true)
    // 内联命名确认（黑盒里的"输入文字改名"）
    expect(useEditorStore.getState().commitIntent({ type: 'set-node-text', nodeId: 'n1', text: '测试子节点' })).toBe(true)

    useEditorStore.getState().undo() // 撤销改名
    useEditorStore.getState().undo() // 撤销添加节点：应回到原始源码
    expect(useEditorStore.getState().source).toBe(SRC)
  })
})

describe('实测发现 2：删除节点不应残留孤立语句', () => {
  it('删除 n1 后源码不含只剩端点 A 的行', () => {
    // 复刻黑盒现场：先 Tab 加 n1（加节点 + 加边），再删 n1
    const plan = flowchartKeyPlan(projectionOf(SRC), {
      key: 'Tab',
      selection: { kind: 'node', nodeId: 'A' },
    })
    expect(plan).not.toBeNull()
    let source = SRC
    for (const intent of plan!.intents) {
      const result = applyEdit(source, flowchartParser, intent)
      if (!result.ok) throw new Error(`意图应可落码：${String(result.error)}`)
      source = result.source
    }
    expect(source).toContain('A --> n1')

    const result = applyEdit(source, flowchartParser, { type: 'delete-node', nodeId: 'n1' })
    if (!result.ok) throw new Error(`删除应可落码：${String(result.error)}`)
    const orphan = result.source
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('flowchart'))
      .map((line) => line.trim())
    expect(orphan).toEqual(['A[开始] --> B[处理]'])
  })
})