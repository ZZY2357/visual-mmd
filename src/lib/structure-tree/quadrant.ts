// quadrant 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { QuadrantProjection } from '../projection/quadrant-projection'
import type { Selection } from '../projection/selection'
import { quadrantKeyPlan } from '../pipeline/quadrant-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- quadrant（more-diagrams 工单 12） ----------

/**
 * quadrant 点条目的键盘（工单 12 / ADR-0013）：焦点在点条目上时
 * Tab = 加点 / Delete = 删除（preventDefault 压掉默认行为）；Enter 无自然类比，
 * 工单定案不接。键 → plan 走能力包同一份 quadrantKeyPlan，执行交给唯一的 applyPlan。
 * quadrant 点有 data-id 寻址（位置序反注，见 quadrant-adapter），画布键盘与结构树
 * 键盘都可用；轴/象限标题是文档级属性元素，不接键盘增删（工单定案）。
 */
function quadrantPointKeyDown(projection: QuadrantProjection, elementId: string): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'quadrant-point', elementId }
    const plan = quadrantKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * quadrant 结构树（工单 12）：轴 / 象限标题 / 点三个分区。轴是文档级属性元素
 * （detail = 左 → 右段文本）；象限标题 detail 携带 quadrant-N 编号；点 detail 携带
 * 坐标原文，**越界/畸形坐标原样展示并标注**（不静默改写，工单定案——坐标越界
 * mermaid 词法直接报错）。缺失的 quadrant-N 行不产生条目（工单不做加象限行）。
 */
export function quadrantPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'quadrant') return []
  const p: QuadrantProjection = projection.quadrant

  const axisDetail = (a: { first: string; second: string | null }): string =>
    a.second !== null ? `${a.first} → ${a.second}` : a.first

  const axes: TreeEntry[] = []
  if (p.xAxis !== null) {
    axes.push({
      key: p.xAxis.elementId,
      label: t('app:propertyPanel.quadrantXAxis'),
      detail: axisDetail(p.xAxis),
      depth: 1,
      selection: { kind: 'quadrant-axis', elementId: p.xAxis.elementId },
    })
  }
  if (p.yAxis !== null) {
    axes.push({
      key: p.yAxis.elementId,
      label: t('app:propertyPanel.quadrantYAxis'),
      detail: axisDetail(p.yAxis),
      depth: 1,
      selection: { kind: 'quadrant-axis', elementId: p.yAxis.elementId },
    })
  }

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    { key: 'axes', heading: t('app:propertyPanel.quadrantAxes'), count: axes.length, entries: axes },
    {
      key: 'quadrants',
      heading: t('app:propertyPanel.quadrantSlots'),
      count: p.quadrants.length,
      entries: p.quadrants.map((q) => ({
        key: q.elementId,
        label: q.text,
        detail: `quadrant-${q.index}`,
        depth: 1,
        selection: { kind: 'quadrant-quadrant', elementId: q.elementId },
      })),
    },
    {
      key: 'points',
      heading: t('app:propertyPanel.quadrantPoints'),
      count: p.points.length,
      entries: p.points.map((pt) => ({
        key: pt.elementId,
        label: pt.text,
        detail: pt.coordsValid
          ? `[${pt.xText}, ${pt.yText}]`
          : t('app:propertyPanel.quadrantCoordInvalidShort', {
              value: `[${pt.xText}, ${pt.yText}]`,
            }),
        depth: 1,
        selection: { kind: 'quadrant-point', elementId: pt.elementId },
        onKeyDown: quadrantPointKeyDown(p, pt.elementId),
      })),
    },
  ]
}
