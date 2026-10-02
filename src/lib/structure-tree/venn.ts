// venn 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { ProjectionVennArea, VennProjection } from '../projection/venn-projection'
import type { Selection } from '../projection/selection'
import { vennKeyPlan } from '../pipeline/venn-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- venn（more-diagrams 工单 21） ----------

/**
 * venn 结构树条目的键盘（工单 21 / ADR-0013）：焦点在集合 / 交集条目上时
 * Tab = 加集合（仅集合） / Enter = 加交集（以该区域首 id 与下一集合组二元交集） /
 * Delete = 删除该区域（删集合连带删引用它的交集，preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 vennKeyPlan，执行交给唯一的 applyPlan。
 * venn 画布已由 nodeAnnotator 反注 `data-id`（research §8 实测 `data-venn-sets` 可映射），
 * 画布可点选；结构树是键盘/键盘命名的稳定入口（与 pie/treemap 同口径）。
 */
function vennEntryKeyDown(
  projection: VennProjection,
  kind: 'venn-set' | 'venn-union',
  elementId: string,
  id: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection =
      kind === 'venn-set' ? { kind: 'venn-set', id } : { kind: 'venn-union', elementId }
    const plan = vennKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * venn 结构树（工单 21）：集合 / 交集两分区（文档序）。集合 detail 携带 id（名字即身份），
 * 交集 detail 携带 id 列表（书写序）；两者 label 缺省回退「（无标签）」由渲染层处理。
 * 集合与交集的渲染键用各自的 elementId（`venn-set:<id>` / `venn-union:N`）。
 * 画布可点选（nodeAnnotator 反注 data-id），结构树 + 属性表单是完整编辑入口。
 */
export function vennPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'venn') return []
  const p: VennProjection = projection.venn

  const areaDetail = (area: ProjectionVennArea): string =>
    [area.ids.join(' ∩ '), area.sizeText ?? undefined].filter((x) => x !== undefined).join(' · ')

  return [
    withDiagramLabel(diagramSection(p.title ?? 'venn-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'sets',
      heading: t('app:propertyPanel.vennSets'),
      count: p.sets.length,
      entries: p.sets.map((s) => ({
        key: s.elementId,
        label: s.label ?? s.ids[0],
        detail: areaDetail(s),
        depth: 1,
        selection: { kind: 'venn-set', id: s.ids[0] },
        onKeyDown: vennEntryKeyDown(p, 'venn-set', s.elementId, s.ids[0]),
      })),
    },
    {
      key: 'unions',
      heading: t('app:propertyPanel.vennUnions'),
      count: p.unions.length,
      entries: p.unions.map((u) => ({
        key: u.elementId,
        label: u.label ?? u.ids.join(' ∩ '),
        detail: areaDetail(u),
        depth: 1,
        selection: { kind: 'venn-union', elementId: u.elementId },
        onKeyDown: vennEntryKeyDown(p, 'venn-union', u.elementId, u.ids[0]),
      })),
    },
  ]
}
