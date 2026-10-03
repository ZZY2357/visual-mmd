// treemap 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { ProjectionTreemapNode, TreemapProjection } from '../projection/treemap-projection'
import type { Selection } from '../projection/selection'
import { treemapKeyPlan } from '../pipeline/treemap-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- treemap（more-diagrams 工单 20） ----------

/**
 * treemap 结构树条目的键盘（工单 20 / ADR-0013）：焦点在节点条目上时
 * Tab = 加叶子子节点（仅 Section；叶子有值即叶子）/ Enter = 加同级叶子 /
 * Delete = 删除该节点（连同子树，preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 treemapKeyPlan，执行交给唯一的 applyPlan。
 * treemap 画布无 data-id（research §4 实测，见 treemap-adapter），
 * 结构树是唯一的键盘入口（与 timeline/journey 同口径）。
 */
function treemapEntryKeyDown(
  projection: TreemapProjection,
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'treemap-node', elementId }
    const plan = treemapKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * treemap 结构树（工单 20）：单一「节点」分区，层级节点递归展开（与 mindmap/state
 * 复合状态同一套树形渲染器）。Section 是分组、Leaf 是叶子；叶子 detail 携带数值原文，
 * **非法数值（手写源码的清单外形态）原样展示并标注**（不静默改写，工单定案）。
 * treemap 画布无 data-id（research §4：渲染器只有 class + d3 值降序索引），
 * 结构树 + 属性表单是完整编辑入口。
 */
export function treemapPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'treemap') return []
  const p: TreemapProjection = projection.treemap

  const nodeEntry = (node: ProjectionTreemapNode): TreeEntry => {
    const children = node.children.map(nodeEntry)
    return {
      key: node.elementId,
      label: node.name,
      detail:
        [
          node.nodeKind === 'leaf'
            ? node.valueValid
              ? node.valueText ?? ''
              : t('app:propertyPanel.treemapValueInvalidShort', { value: node.valueText ?? '' })
            : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: node.depth + 1,
      selection: { kind: 'treemap-node', elementId: node.elementId },
      onKeyDown: treemapEntryKeyDown(p, node.elementId),
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.roots.length > 0 ? 'treemap' : undefined), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.treemapNodes'),
      count: p.nodes.length,
      entries: p.roots.map(nodeEntry),
    },
  ]
}
