// eventmodeling 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { EventModelingProjection } from '../projection/eventmodeling-projection'
import { DIAGRAM_SELECTION, type Selection } from '../projection/selection'
import { eventModelingKeyPlan } from '../pipeline/eventmodeling-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

/** eventmodeling 结构树行内键（Tab 加同泳道帧 / Enter 加事件帧 / Delete 删帧 / 删数据块）：
 * 与画布键盘共用同一份 eventModelingKeyPlan（ADR-0013），执行交给 applyPlan。 */
function eventModelingEntryKeyDown(
  projection: EventModelingProjection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = eventModelingKeyPlan(projection, {
      key: e.key,
      mods: { shift: e.shiftKey },
      selection,
    })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * eventmodeling 结构树（工单 28）：帧（按泳道分组）/ 数据块 / 连线（含派生与显式）/ 文档行
 * 四个分区。**画布无 data-id**（research §4/§8.3）→ 结构树是唯一完整编辑入口：选中帧 / 数据块
 * 后在属性表单编辑，或行内 Tab / Enter / Delete 增删。派生连线（默认推断，无源码语句）只读
 * （无 onKeyDown）；文档行不进选中面（点击回落图表级）。
 */
export function eventModelingPartitions(
  projection: AnyProjection,
  { t }: TreePartitionsContext,
): TreeSection[] {
  if (projection.type !== 'eventmodeling') return []
  const p: EventModelingProjection = projection.eventmodeling

  const frameEntry = (frame: (typeof p.frames)[number], depth: number) => {
    const selection: Selection = { kind: 'em-frame', elementId: frame.elementId }
    return {
      key: frame.elementId,
      label: `${frame.frameId} ${frame.entityIdentifier}`,
      detail: t(`app:propertyPanel.emEntityTypes.${frame.group}`),
      depth,
      selection,
      onKeyDown: eventModelingEntryKeyDown(p, selection),
    }
  }

  // 泳道分组 → 分区（泳道带 + 命名空间各成一组，文档序）
  const swimlaneSections: TreeSection[] = p.swimlanes.map((lane) => ({
    key: `lane-${lane.swimlane}-${lane.label}`,
    heading: lane.label,
    count: lane.frames.length,
    entries: lane.frames.map((f) => frameEntry(f, 1)),
  }))

  return [
    withDiagramLabel(
      diagramSection(p.docLines.find((dl) => dl.docKind === 'entity')?.text),
      t('app:propertyPanel.diagram'),
    ),
    ...swimlaneSections,
    {
      key: 'dataBlocks',
      heading: t('app:propertyPanel.emDataBlocks'),
      count: p.dataBlocks.length,
      entries: p.dataBlocks.map((block) => {
        const selection: Selection = { kind: 'em-data', elementId: block.elementId }
        return {
          key: block.elementId,
          label: block.name,
          detail:
            block.referencedBy.length > 0
              ? t('app:propertyPanel.emDataDetail', { count: block.referencedBy.length })
              : undefined,
          depth: 1,
          selection,
          onKeyDown: eventModelingEntryKeyDown(p, selection),
        }
      }),
    },
    {
      key: 'relations',
      heading: t('app:propertyPanel.emRelations'),
      count: p.relations.length,
      entries: p.relations.map((relation) => {
        const source = p.frames.find((f) => f.elementId === relation.source)
        const target = p.frames.find((f) => f.elementId === relation.target)
        return {
          key: relation.elementId,
          label: `${source?.frameId ?? '—'} → ${target?.frameId ?? '—'}`,
          detail: t(`app:propertyPanel.emRelationOrigins.${relation.origin}`),
          depth: 1,
          selection: { kind: 'em-relation', elementId: relation.elementId } as Selection,
          // 派生连线只读（无源码语句，不可手术编辑）→ 不挂 onKeyDown
        }
      }),
    },
    ...(p.docLines.length > 0
      ? [
          {
            key: 'docLines',
            heading: t('app:propertyPanel.emDocLines'),
            count: p.docLines.length,
            entries: p.docLines.map((line) => ({
              key: line.elementId,
              label: line.text,
              detail: line.docKind,
              depth: 1,
              // 文档级声明行无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
              selection: DIAGRAM_SELECTION,
            })),
          },
        ]
      : []),
  ]
}
