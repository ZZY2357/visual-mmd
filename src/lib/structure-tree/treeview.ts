// treeview 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { ProjectionTreeviewNode, TreeviewProjection } from '../projection/treeview-projection'
import type { Selection } from '../projection/selection'
import { treeviewKeyPlan } from '../pipeline/treeview-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- treeView（more-diagrams 工单 24） ----------

/**
 * treeView 结构树条目的键盘（工单 24 / ADR-0013）：焦点在节点条目上时
 * Tab = 在该目录下加子节点（仅目录；文件节点 Tab 不做）/ Enter = 加同级节点 /
 * Delete = 删除该节点（连同子树）。键 → plan 走能力包同一份 treeviewKeyPlan，
 * 执行交给唯一的 applyPlan。
 * treeView 画布无 data-id（research §4 实测，见 treeview-adapter），
 * 结构树是唯一的键盘入口（与 ishikawa/treemap/timeline/journey 同口径）。
 */
function treeviewEntryKeyDown(
  projection: TreeviewProjection,
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'treeview-node', elementId }
    const plan = treeviewKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * treeView 结构树（工单 24）：单一「目录树」分区，顶层节点（虚拟根的子节点）为根、
 * 子目录/文件递归展开（与 mindmap/state/ishikawa 同一套树形渲染器）。
 * 目录条目 detail 标「目录」，文件条目 detail 标「文件」；注解（:::class / icon() / ##）
 * 不占条目文本，交由属性表单呈现。
 * treeView 画布无 data-id 且渲染布局与源码行序无一一对应（research §4），
 * 结构树 + 属性表单是完整编辑入口。
 */
export function treeviewPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'treeview') return []
  const p: TreeviewProjection = projection.treeview

  const nodeEntry = (node: ProjectionTreeviewNode): TreeEntry => {
    const children = node.children.map(nodeEntry)
    return {
      key: node.elementId,
      label: node.name,
      detail: node.isDirectory
        ? t('app:propertyPanel.treeviewDirectoryShort')
        : t('app:propertyPanel.treeviewFileShort'),
      depth: node.level + 1,
      selection: { kind: 'treeview-node', elementId: node.elementId },
      onKeyDown: treeviewEntryKeyDown(p, node.elementId),
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.roots.length > 0 ? 'treeview' : undefined), t('app:propertyPanel.diagram')),
    {
      key: 'tree',
      heading: t('app:propertyPanel.treeviewRoots'),
      count: p.nodes.length,
      entries: p.roots.map(nodeEntry),
    },
  ]
}
