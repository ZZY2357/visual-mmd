import { beforeEach, describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { newDiagramLegacy, useEditorStore } from '../../../store/editor'
import { timelineParser } from '../../pipeline/timeline'
import { buildTimelineProjection, type TimelineProjection } from '../../projection/timeline-projection'
import type { TimelineIntent } from '../../pipeline/timeline'

/**
 * timeline 端到端验收场景（more-diagrams 工单 05 的「端到端验收场景」，走真实 store 管线）：
 * 新建 timeline → 加时期 → 给时期加两个事件 → 加第二个 section 再加一个时期 →
 * 改一个时期文本 → 删除一个事件。
 *
 * 全部经 `commitIntent`（真实管线：detect → parser.resolveRewrites → 手术式重组装 → 快照），
 * 每步都断言源码仍可被 timeline 解析器解析、且最终能被 mermaid v12 parse 通过（弱替代证据，
 * 代替真机渲染——AGENTS.md 默认不做浏览器测试）。
 *
 * 注：工单的「双击改一个时期文本」在画布上不可达（timeline 画布无 data-id 寻址，见
 * timeline-adapter 的降级说明），故本场景按**属性表单的等价入口**（set-period-text 意图）走，
 * 与 `TimelinePeriodForm` 提交的意图逐字同形。
 */

function currentProjection(): TimelineProjection {
  const parsed = timelineParser.parse(useEditorStore.getState().source)
  if (!parsed.ok) throw new Error(`源码必须可解析：${parsed.error.message}`)
  return buildTimelineProjection(parsed.doc)
}

function commit(intent: TimelineIntent): void {
  const ok = useEditorStore.getState().commitIntent(intent)
  expect(ok, `意图应落码：${intent.type}`).toBe(true)
}

describe('timeline 端到端验收场景（工单 05）', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    // 新建 timeline（走模板起步）
    newDiagramLegacy('timeline')
    expect(useEditorStore.getState().source).toContain('timeline')
  })

  it('新建 → 加时期 → 加两个事件 → 加 section 与时期 → 改时期文本 → 删事件', async () => {
    // ① 加时期（空白菜单「加时期」路径）
    commit({ type: 'add-period', text: '第三阶段' })
    expect(currentProjection().periods.map((p) => p.text)).toContain('第三阶段')

    // ② 给第一个时期加两个事件（选中时期后 Tab / 时期右键「加事件」路径）
    //    每次重取投影，拿最新的落码锚点（新增事件后 tailElementId 前移）
    commit({ type: 'add-event', periodElementId: 'period:1', text: '事件甲' })
    commit({ type: 'add-event', periodElementId: 'period:1', text: '事件乙' })
    const afterEvents = currentProjection()
    const period1 = afterEvents.periods.find((p) => p.elementId === 'period:1')!
    expect(period1.events.map((e) => e.text)).toEqual(['调研', '评审', '事件甲', '事件乙'])

    // ③ 加第二个 section，再给它加一个时期
    commit({ type: 'add-section', name: '第三阶段分组' })
    expect(currentProjection().sections.map((s) => s.name)).toContain('第三阶段分组')
    commit({ type: 'add-period', text: '收尾' })

    // ④ 改一个时期文本（属性表单 / 双击的等价入口）
    commit({ type: 'set-period-text', elementId: 'period:1', text: '需求分析（已修订）' })
    expect(currentProjection().periods.find((p) => p.elementId === 'period:1')?.text).toBe('需求分析（已修订）')

    // ⑤ 删除一个事件
    const beforeDelete = currentProjection()
    const victim = beforeDelete.periods.find((p) => p.elementId === 'period:1')!.events.find((e) => e.text === '事件甲')!
    commit({ type: 'delete-event', elementId: victim.elementId })
    expect(currentProjection().periods.find((p) => p.elementId === 'period:1')!.events.map((e) => e.text)).toEqual([
      '调研',
      '评审',
      '事件乙',
    ])

    // 终态：源码合法（mermaid v12 实际 parse 通过），且逐字可往返
    const final = useEditorStore.getState().source
    await expect(mermaid.parse(final)).resolves.toBeTruthy()
    const reparsed = timelineParser.parse(final)
    if (!reparsed.ok) throw new Error('终态必须可解析')
    expect(buildTimelineProjection(reparsed.doc).periods.length).toBeGreaterThanOrEqual(4)
  })

  it('每一步编辑都是独立的可撤销快照', () => {
    const before = useEditorStore.getState().source
    commit({ type: 'add-period', text: '新的' })
    const afterAdd = useEditorStore.getState().source
    expect(afterAdd).not.toBe(before)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(before)
  })
})
