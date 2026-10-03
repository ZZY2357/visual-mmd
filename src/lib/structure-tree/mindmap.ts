// mindmap 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { MindmapProjection } from '../projection/mindmap-projection'
import { mindmapKeyPlan } from '../pipeline/mindmap-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type Translate, type TreePartitionsContext } from './partitions'

// ---------- mindmap（工单 08：树形缩进即主编辑界面） ----------

/**
 * mindmap 树节点的键盘（工单 08 / architecture-deepening-2 工单 06）：
 * 焦点在树节点上时 Tab 加子节点 / Enter 加同级节点（preventDefault 压掉焦点切换），
 * 落码按 mindmap 缩进层级。键 → plan 走能力包同一份 mindmapKeyPlan（工单 02），
 * plan 的执行交给唯一的 applyPlan；结构树路径经 pendingInlineEdit 请求间接接入内联编辑。
 */
function mindmapEntryKeyDown(
  projection: MindmapProjection,
  elementId: string,
  t: Translate,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    // 与树键盘既有口径一致：只接无修饰键的 Tab / Enter（Delete 留给画布键盘，不在这处理）
    if ((e.key !== 'Tab' && e.key !== 'Enter') || e.shiftKey) return
    const plan = mindmapKeyPlan(projection, {
      key: e.key,
      mods: { shift: e.shiftKey },
      selection: { kind: 'mindmap-node', elementId },
      newNodeText: t('app:propertyPanel.mindmapNewNode'),
    })
    if (plan === null) return
    const { commitIntent, commitIntents, select, requestInlineEdit } = useEditorStore.getState()
    applyPlan(plan, {
      commitIntent,
      commitIntents,
      select,
      // 本图种（mindmap）的 plan 只产 mindmap 目标：经 store 请求，画布侧消费（工单 06）
      beginInlineEdit: (target) => {
        if (target.kind === 'mindmap') requestInlineEdit(target)
      },
      preventDefault: () => e.preventDefault(),
    })
  }
}

export function mindmapPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'mindmap') return []
  const p: MindmapProjection = projection.mindmap

  const childrenOf = new Map<string | null, typeof p.nodes>()
  for (const node of p.nodes) {
    const list = childrenOf.get(node.parentId) ?? []
    list.push(node)
    childrenOf.set(node.parentId, list)
  }

  const toEntry = (node: (typeof p.nodes)[number]): TreeEntry => {
    const children = (childrenOf.get(node.elementId) ?? []).map(toEntry)
    const shapeLabel = node.shapeType !== null ? t(`app:mindmapShapes.${node.shapeType}`) : undefined
    return {
      key: node.elementId,
      label: node.text,
      detail:
        [shapeLabel, node.icon !== null ? `::icon(${node.icon})` : undefined]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: node.depth,
      selection: { kind: 'mindmap-node', elementId: node.elementId },
      onKeyDown: mindmapEntryKeyDown(p, node.elementId, t),
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection('mindmap'), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.mindmapHint'),
      emptyText: t('app:propertyPanel.mindmapEmpty'),
      entries: (childrenOf.get(null) ?? []).map(toEntry),
    },
  ]
}
