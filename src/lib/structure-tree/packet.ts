// packet 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { PacketProjection, ProjectionPacketField } from '../projection/packet-projection'
import type { Selection } from '../projection/selection'
import { packetKeyPlan } from '../pipeline/packet-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- packet（more-diagrams 工单 16） ----------

/**
 * packet 字段条目的键盘（工单 16 / ADR-0013）：焦点在字段条目上时
 * Tab = 加字段（+count 形态衔接前序）/ Delete = 删除（preventDefault 压掉默认行为）；
 * Enter 无自然类比，工单定案不接。键 → plan 走能力包同一份 packetKeyPlan，执行交给
 * 唯一的 applyPlan。packet 字段有 data-id 寻址（start-bit 映射反注，见 packet-adapter），
 * 画布键盘与结构树键盘都可用。
 */
function packetFieldKeyDown(projection: PacketProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'packet-field', elementId }
    const plan = packetKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * packet 结构树（工单 16）：单一「字段」分区。字段 detail 携带归一后的绝对位区间
 * （工单定案：+count / single 形态归一展示 + 原形态标注）；`contiguous = false`
 * （手写源码的间隙/重叠——mermaid 12 整图渲染失败）时追加不衔接标注
 * （pie valuePositive 同口径：原文保留，交由结构树标注）。
 */
export function packetPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'packet') return []
  const p: PacketProjection = projection.packet

  const rangeDetail = (f: ProjectionPacketField): string => {
    const abs = `${f.absStart}-${f.absEnd}`
    const form =
      f.form.kind === 'range'
        ? abs
        : f.form.kind === 'single'
          ? `${f.form.start}（1 位）`
          : `+${f.form.count}（${abs}）`
    return f.contiguous ? form : `${form} · ${t('app:propertyPanel.packetNotContiguous')}`
  }

  return [
    withDiagramLabel(diagramSection(undefined), t('app:propertyPanel.diagram')),
    {
      key: 'fields',
      heading: t('app:propertyPanel.packetFields'),
      count: p.fields.length,
      entries: p.fields.map((f) => ({
        key: f.elementId,
        label: f.name,
        detail: rangeDetail(f),
        depth: 1,
        selection: { kind: 'packet-field', elementId: f.elementId },
        onKeyDown: packetFieldKeyDown(p, f.elementId),
      })),
    },
  ]
}
