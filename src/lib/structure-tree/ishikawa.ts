// ishikawa 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { ProjectionIshikawaNode, IshikawaProjection } from '../projection/ishikawa-projection'
import type { Selection } from '../projection/selection'
import { ishikawaKeyPlan } from '../pipeline/ishikawa-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- ishikawa（more-diagrams 工单 22） ----------

/**
 * ishikawa 结构树条目的键盘（工单 22 / ADR-0013）：焦点在节点条目上时
 * Tab = 加子节点 / Enter = 加同级节点 / Delete = 删除该节点（连同子树；
 * 鱼头不可删，preventDefault 压掉默认行为）。
 * 键 → plan 走能力包同一份 ishikawaKeyPlan，执行交给唯一的 applyPlan。
 * ishikawa 画布无 data-id（research §4 实测，见 ishikawa-adapter），
 * 结构树是唯一的键盘入口（与 treemap/timeline/journey 同口径）。
 */
function ishikawaEntryKeyDown(
  projection: IshikawaProjection,
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'ishikawa-node', elementId }
    const plan = ishikawaKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * ishikawa 结构树（工单 22）：单一「因果树」分区，鱼头（问题）为根、主因（一级）挂其下、
 * 分支（二级及更深）递归展开（与 mindmap/state 复合状态同一套树形渲染器）。
 * 主因条目 detail 标注层级（主因）；鱼头不可删。
 * ishikawa 画布无 data-id 且渲染序 ≠ 源码序（research §4），结构树 + 属性表单是
 * 完整编辑入口。
 */
export function ishikawaPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'ishikawa') return []
  const p: IshikawaProjection = projection.ishikawa

  const nodeEntry = (node: ProjectionIshikawaNode): TreeEntry => {
    const children = node.children.map(nodeEntry)
    return {
      key: node.elementId,
      label: node.text,
      detail: node.isRoot
        ? t('app:propertyPanel.ishikawaRootShort')
        : node.depth === 1
          ? t('app:propertyPanel.ishikawaCauseShort')
          : undefined,
      depth: node.depth + 1,
      selection: { kind: 'ishikawa-node', elementId: node.elementId },
      onKeyDown: ishikawaEntryKeyDown(p, node.elementId),
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.root !== null ? 'ishikawa' : undefined), t('app:propertyPanel.diagram')),
    {
      key: 'causes',
      heading: t('app:propertyPanel.ishikawaCauses'),
      count: p.nodes.length,
      entries: p.root !== null ? [nodeEntry(p.root)] : [],
    },
  ]
}
