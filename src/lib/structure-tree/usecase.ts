// usecase 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { ProjectionUsecaseNode, ProjectionUsecaseRelation, UsecaseProjection } from '../projection/usecase-projection'
import type { Selection } from '../projection/selection'
import { usecaseKeyPlan } from '../pipeline/usecase-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

/** usecase 结构树行内键（Tab 加用例 / Enter 加 actor / Delete 删元素）：
 * 与画布键盘共用同一份 usecaseKeyPlan（ADR-0013），执行交给 applyPlan。 */
function usecaseEntryKeyDown(
  projection: UsecaseProjection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = usecaseKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * usecase 结构树（工单 26）：actor / 系统边界 / 用例 / 关系四个分区（文档序）。
 * actor 与用例 detail 携带源码标识符（名字即身份，引号声明为推导串）；边界 detail 携带
 * 归属用例数；关系 detail 携带算子（`-->` / `..>` / `--|>`）。画布可点选（渲染器 data-id
 * 经 nodeAnnotator 归一），结构树 + 属性表单是完整编辑入口。
 */
export function usecasePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'usecase') return []
  const p: UsecaseProjection = projection.usecase

  const nodeEntry = (node: ProjectionUsecaseNode, depth: number) => {
    const selection: Selection =
      node.nodeKind === 'actor'
        ? { kind: 'usecase-actor', elementId: node.elementId }
        : { kind: 'usecase-usecase', elementId: node.elementId }
    return {
      key: node.elementId,
      label: node.label,
      detail: node.label !== node.id ? node.id : undefined,
      depth,
      selection,
      onKeyDown: usecaseEntryKeyDown(p, selection),
    }
  }

  const actors = p.nodes.filter((n) => n.nodeKind === 'actor')
  const cases = p.nodes.filter((n) => n.nodeKind === 'usecase')
  const boundaryOf = (b: ProjectionUsecaseNode) => ({
    key: b.elementId,
    label: b.label,
    detail: t('app:propertyPanel.usecaseBoundaryDetail', {
      count: p.nodes.filter((n) => n.boundaryId === b.id && n.nodeKind === 'usecase').length,
    }),
    depth: 1,
    selection: { kind: 'usecase-boundary', elementId: b.elementId } as Selection,
    onKeyDown: usecaseEntryKeyDown(p, { kind: 'usecase-boundary', elementId: b.elementId }),
  })

  return [
    withDiagramLabel(diagramSection('usecase-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'actors',
      heading: t('app:propertyPanel.usecaseActors'),
      count: actors.length,
      entries: actors.map((n) => nodeEntry(n, 1)),
    },
    {
      key: 'boundaries',
      heading: t('app:propertyPanel.usecaseBoundaries'),
      count: p.boundaries.length,
      entries: p.boundaries.map((b) => boundaryOf(b)),
    },
    {
      key: 'cases',
      heading: t('app:propertyPanel.usecaseCases'),
      count: cases.length,
      entries: cases.map((n) => nodeEntry(n, n.boundaryId !== null ? 2 : 1)),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.usecaseRelations'),
      count: p.relations.length,
      entries: p.relations.map((r: ProjectionUsecaseRelation) => {
        const selection: Selection = { kind: 'usecase-relation', elementId: r.elementId }
        return {
          key: r.elementId,
          label: `${r.source} ${r.operator} ${r.target}`,
          detail: r.label ?? r.relationKind,
          depth: 1,
          selection,
          onKeyDown: usecaseEntryKeyDown(p, selection),
        }
      }),
    },
  ]
}
