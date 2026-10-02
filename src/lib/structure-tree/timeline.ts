// timeline 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { TimelineProjection } from '../projection/timeline-projection'
import type { Selection } from '../projection/selection'
import { timelineKeyPlan } from '../pipeline/timeline-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- timeline（more-diagrams 工单 05） ----------

/**
 * timeline 时期条目的键盘（工单 05 / ADR-0013）：焦点在时期条目上时
 * Tab 加事件 / Enter 加下一时期 / Delete 删除该时期（preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 timelineKeyPlan，执行交给唯一的 applyPlan。
 *
 * 与 mindmap 树只接 Tab/Enter 不同，这里**同时接 Delete**：timeline 画布无 data-id 寻址
 * （见 timeline-adapter 注释），画布键盘拿不到时期选中，结构树是唯一的键盘入口。
 */
function timelinePeriodKeyDown(
  projection: TimelineProjection,
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'timeline-period', elementId }
    const plan = timelineKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

export function timelinePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'timeline') return []
  const p: TimelineProjection = projection.timeline

  const periodEntry = (period: (typeof p.periods)[number]): TreeEntry => {
    const events = period.events.map<TreeEntry>((ev) => ({
      key: ev.elementId,
      label: ev.text,
      detail: ev.form === 'continuation' ? t('app:propertyPanel.timelineContinuationEvent') : undefined,
      depth: 2,
      selection: { kind: 'timeline-event', elementId: ev.elementId },
    }))
    return {
      key: period.elementId,
      label: period.text,
      detail:
        [period.sectionName ?? undefined, `${period.events.length}`]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: 1,
      selection: { kind: 'timeline-period', elementId: period.elementId },
      onKeyDown: timelinePeriodKeyDown(p, period.elementId),
      children: events.length > 0 ? events : undefined,
    }
  }

  return [
    withDiagramLabel(
      diagramSection(p.title ?? p.direction ?? undefined),
      t('app:propertyPanel.diagram'),
    ),
    {
      key: 'sections',
      heading: t('app:propertyPanel.timelineSections'),
      count: p.sections.length,
      entries: p.sections.map((s) => ({
        key: s.elementId,
        label: s.name,
        detail: `${s.periods.length}`,
        depth: 1,
        selection: { kind: 'timeline-section', elementId: s.elementId },
      })),
    },
    {
      key: 'periods',
      heading: t('app:propertyPanel.timelinePeriods'),
      count: p.periods.length,
      entries: p.periods.map(periodEntry),
    },
  ]
}
