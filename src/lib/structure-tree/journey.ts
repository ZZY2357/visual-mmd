// journey 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { JourneyProjection } from '../projection/journey-projection'
import type { Selection } from '../projection/selection'
import { journeyKeyPlan } from '../pipeline/journey-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- journey（more-diagrams 工单 08） ----------

/**
 * journey 任务条目的键盘（工单 08 / ADR-0013）：焦点在任务条目上时
 * Tab = 同 section 加任务 / Enter = 加 section / Delete = 删除（preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 journeyKeyPlan，执行交给唯一的 applyPlan。
 * 与 timeline 同理接 Delete：journey 画布无 data-id 寻址（见 journey-adapter），
 * 画布键盘拿不到任务选中，结构树是唯一的键盘入口。
 */
function journeyTaskKeyDown(projection: JourneyProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'journey-task', elementId }
    const plan = journeyKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * journey 结构树（工单 08）：section 作为分组条目、其任务作为 children（复用树形渲染器）；
 * 首个 section 之前的任务（mermaid 空分组）平铺在「任务」分区。任务 detail 携带
 * score 与 actor 列表；**越界/非数字 score 原样展示并标注**（不静默改写，工单定案）。
 * journey 画布无 data-id（见 journey-adapter），结构树 + 属性表单是完整编辑入口。
 */
export function journeyPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'journey') return []
  const p: JourneyProjection = projection.journey

  const scoreLabel = (task: (typeof p.tasks)[number]): string =>
    task.scoreInRange
      ? t('app:propertyPanel.journeyScoreShort', { score: task.scoreText })
      : t('app:propertyPanel.journeyScoreInvalidShort', { score: task.scoreText })

  const taskEntry = (task: (typeof p.tasks)[number]): TreeEntry => ({
    key: task.elementId,
    label: task.name,
    detail:
      [scoreLabel(task), task.actors.length > 0 ? task.actors.join(', ') : undefined]
        .filter((x) => x !== undefined)
        .join(' · ') || undefined,
    depth: 2,
    selection: { kind: 'journey-task', elementId: task.elementId },
    onKeyDown: journeyTaskKeyDown(p, task.elementId),
  })

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'sections',
      heading: t('app:propertyPanel.journeySections'),
      count: p.sections.length,
      entries: p.sections.map((s) => ({
        key: s.elementId,
        label: s.name,
        detail: `${s.tasks.length}`,
        depth: 1,
        selection: { kind: 'journey-section', elementId: s.elementId },
        children: s.tasks.length > 0 ? s.tasks.map(taskEntry) : undefined,
      })),
    },
    {
      key: 'tasks',
      heading: t('app:propertyPanel.journeyTasks'),
      count: p.rootTasks.length,
      entries: p.rootTasks.map(taskEntry),
    },
  ]
}
