// gantt 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { GanttProjection } from '../projection/gantt-projection'
import type { Selection } from '../projection/selection'
import { ganttKeyPlan } from '../pipeline/gantt-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- gantt（more-diagrams 工单 11） ----------

/**
 * gantt 任务条目的键盘（工单 11 / ADR-0013，与 journey 同构）：焦点在任务条目上时
 * Tab = 同 section 加任务 / Enter = 加 section / Delete = 删除（preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 ganttKeyPlan，执行交给唯一的 applyPlan。
 * gantt 画布只有任务条可寻址（见 gantt-adapter），section 与指令行不可寻址——
 * 结构树是这两者的唯一键盘 / 选中入口；任务条目接 Delete 与 timeline/journey 同理。
 */
function ganttTaskKeyDown(projection: GanttProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'gantt-task', elementId }
    const plan = ganttKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * gantt 结构树（工单 11）：section 作为分组条目、其任务作为 children（复用树形渲染器）；
 * 首个 section 之前的任务（mermaid 空分组）平铺在「任务」分区。指令行是**文档级属性
 * 元素**（工单定案），单列一个分区、逐行可选中编辑。任务 detail 携带标签与元数据字段
 * 原文（清单外形态 shape = null 时原样展示，不静默改写，工单定案）。
 */
export function ganttPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'gantt') return []
  const p: GanttProjection = projection.gantt

  const taskEntry = (task: (typeof p.tasks)[number]): TreeEntry => ({
    key: task.elementId,
    label: task.name,
    detail:
      [task.tags.join(', ') || undefined, task.fields.join(', ') || undefined]
        .filter((x) => x !== undefined)
        .join(' · ') || undefined,
    depth: 2,
    selection: { kind: 'gantt-task', elementId: task.elementId },
    onKeyDown: ganttTaskKeyDown(p, task.elementId),
  })

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'directives',
      heading: t('app:propertyPanel.ganttDirectives'),
      count: p.directives.length,
      entries: p.directives.map((d) => ({
        key: d.elementId,
        label: d.keyword,
        detail: d.value,
        depth: 1,
        selection: { kind: 'gantt-directive', elementId: d.elementId },
      })),
    },
    {
      key: 'sections',
      heading: t('app:propertyPanel.ganttSections'),
      count: p.sections.length,
      entries: p.sections.map((s) => ({
        key: s.elementId,
        label: s.name,
        detail: `${s.tasks.length}`,
        depth: 1,
        selection: { kind: 'gantt-section', elementId: s.elementId },
        children: s.tasks.length > 0 ? s.tasks.map(taskEntry) : undefined,
      })),
    },
    {
      key: 'tasks',
      heading: t('app:propertyPanel.ganttTasks'),
      count: p.rootTasks.length,
      entries: p.rootTasks.map(taskEntry),
    },
  ]
}
