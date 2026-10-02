// requirement 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { RequirementProjection } from '../projection/requirement-projection'
import type { Selection } from '../projection/selection'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- requirementDiagram（more-diagrams 工单 07） ----------

/** requirement / element 块的字段子条目：字段按「所属块 + 字段名」寻址（无独立
 * elementId），不可独立选中——点击回落到所属块，编辑入口在右侧属性表单 */
function requirementFieldEntry(
  field: { field: string; value: string },
  ownerSelection: Selection,
): TreeEntry {
  return {
    key: `${field.field}:${field.value}`,
    label: `${field.field}: ${field.value}`,
    depth: 2,
    selection: ownerSelection,
  }
}

export function requirementPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'requirement') return []
  const p: RequirementProjection = projection.requirement
  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'requirements',
      heading: t('app:propertyPanel.requirementTreeReqs'),
      count: p.requirements.length,
      entries: p.requirements.map((r) => ({
        key: r.elementId ?? `implicit:${r.name}`,
        label: r.name,
        detail: r.type !== '' ? r.type : undefined,
        depth: 1,
        selection: { kind: 'requirement', name: r.name },
        children: r.fields.map((f) => requirementFieldEntry(f, { kind: 'requirement', name: r.name })),
      })),
    },
    {
      key: 'elements',
      heading: t('app:propertyPanel.requirementTreeEls'),
      count: p.elements.length,
      entries: p.elements.map((e) => ({
        key: e.elementId ?? `implicit:${e.name}`,
        label: e.name,
        detail: e.type ?? undefined,
        depth: 1,
        selection: { kind: 'requirement-element', name: e.name },
        children: e.fields.map((f) => requirementFieldEntry(f, { kind: 'requirement-element', name: e.name })),
      })),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.requirementTreeRels'),
      count: p.relations.length,
      entries: p.relations.map((rel) => ({
        key: rel.elementId,
        // 归一后的语义方向展示（from/to 已按箭头方向归一；reversed 只是源码书写形态）
        label: `${rel.from} - ${rel.relationKind} -> ${rel.to}`,
        depth: 1,
        selection: { kind: 'requirement-relation', elementId: rel.elementId },
      })),
    },
  ]
}
