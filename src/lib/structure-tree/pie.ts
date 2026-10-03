// pie 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { PieProjection } from '../projection/pie-projection'
import type { Selection } from '../projection/selection'
import { pieKeyPlan } from '../pipeline/pie-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- pie（more-diagrams 工单 10） ----------

/**
 * pie 扇区条目的键盘（工单 10 / ADR-0013）：焦点在扇区条目上时
 * Tab = 加扇区 / Delete = 删除（preventDefault 压掉默认行为）；Enter 无自然类比，
 * 工单定案不接。键 → plan 走能力包同一份 pieKeyPlan，执行交给唯一的 applyPlan。
 * 与 timeline/journey 同理接 Delete：pie 画布无 data-id 寻址（见 pie-adapter），
 * 画布键盘拿不到扇区选中，结构树是唯一的键盘入口。
 */
function pieSectorKeyDown(projection: PieProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'pie-sector', elementId }
    const plan = pieKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * pie 结构树（工单 10）：单一「扇区」分区。扇区 detail 携带数值原文；
 * **负数/零等非法数值原样展示并标注**（不静默改写，工单定案——负数是 mermaid
 * 落码错误、零被渲染层静默过滤）。pie 画布无 data-id（见 pie-adapter），
 * 结构树 + 属性表单是完整编辑入口。
 */
export function piePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'pie') return []
  const p: PieProjection = projection.pie

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'sectors',
      heading: t('app:propertyPanel.pieSectors'),
      count: p.sectors.length,
      entries: p.sectors.map((s) => ({
        key: s.elementId,
        label: s.label,
        detail: s.valuePositive
          ? s.valueText
          : t('app:propertyPanel.pieValueInvalidShort', { value: s.valueText }),
        depth: 1,
        selection: { kind: 'pie-sector', elementId: s.elementId },
        onKeyDown: pieSectorKeyDown(p, s.elementId),
      })),
    },
  ]
}
