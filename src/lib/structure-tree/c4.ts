// c4 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { C4Projection, ProjectionC4Relation } from '../projection/c4-projection'
import type { Selection } from '../projection/selection'
import { c4KeyPlan } from '../pipeline/c4-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

/**
 * C4 结构树行内键（Tab 加同类元素 / Enter 拉关系 / Delete 删元素）：
 * 与画布键盘共用同一份 c4KeyPlan（ADR-0013），执行交给 applyPlan。
 */
function c4EntryKeyDown(
  projection: C4Projection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = c4KeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * C4 结构树（工单 18）：元素 / 边界 / 关系三个分区（文档序，扁平展示）。
 * - 元素 detail 携带源码标识符（alias，名字即身份）与其所属边界的 alias；
 * - 边界 detail 携带直接归属元素数（子边界由 per-element detail 承担，不递归）；
 * - 关系 detail 携带声明宏与（若有）技术描述。
 * 画布无 data-id（实测 data-* 出现 0 次，见 c4-adapter 顶注），画布不可点选，
 * 故结构树 + 属性表单是**唯一**完整编辑入口（ADR-0007 诚实降级）。
 */
export function c4Partitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'c4') return []
  const p: C4Projection = projection.c4

  const relationEntry = (r: ProjectionC4Relation) => {
    const selection: Selection = { kind: 'c4-relation', elementId: r.elementId }
    return {
      key: r.elementId,
      label: `${r.from} → ${r.to}`,
      detail: r.label ?? r.techn ?? r.macro,
      depth: 1,
      selection,
      onKeyDown: c4EntryKeyDown(p, selection),
    }
  }

  return [
    withDiagramLabel(diagramSection('c4-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'elements',
      heading: t('app:propertyPanel.c4Elements'),
      count: p.elements.length,
      entries: p.elements.map((e) => {
        const selection: Selection = { kind: 'c4-element', elementId: e.elementId }
        return {
          key: e.elementId,
          label: e.label,
          detail:
            e.boundaryAlias !== null ? `${e.alias} · ${e.boundaryAlias}` : e.alias,
          depth: 1,
          selection,
          onKeyDown: c4EntryKeyDown(p, selection),
        }
      }),
    },
    {
      key: 'boundaries',
      heading: t('app:propertyPanel.c4Boundaries'),
      count: p.boundaries.length,
      entries: p.boundaries.map((b) => {
        const selection: Selection = { kind: 'c4-boundary', elementId: b.elementId }
        return {
          key: b.elementId,
          label: b.label,
          detail: t('app:propertyPanel.c4BoundaryDetail', { count: b.memberCount }),
          depth: 1,
          selection,
          onKeyDown: c4EntryKeyDown(p, selection),
        }
      }),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.c4Relations'),
      count: p.relations.length,
      entries: p.relations.map(relationEntry),
    },
  ]
}
