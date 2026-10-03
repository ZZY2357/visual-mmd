// radar 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { RadarProjection } from '../projection/radar-projection'
import { DIAGRAM_SELECTION, type Selection } from '../projection/selection'
import { radarKeyPlan } from '../pipeline/radar-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- radar（more-diagrams 工单 15） ----------

/**
 * radar 结构树条目的键盘（工单 15 / ADR-0013）：焦点在轴 / 曲线条目上时
 * Tab = 加轴 / 加曲线、Delete = 删除（preventDefault 压掉默认行为）；Enter 无自然
 * 类比，工单定案不接。键 → plan 走能力包同一份 radarKeyPlan，执行交给唯一的
 * applyPlan。radar 画布无 data-id 寻址（见 radar-adapter），结构树是唯一的键盘入口。
 */
function radarEntryKeyDown(
  projection: RadarProjection,
  kind: 'radar-axis' | 'radar-curve',
  elementId: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind, elementId }
    const plan = radarKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, commitIntents, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, commitIntents, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * radar 结构树（工单 15）：轴 / 曲线 / 选项三分区。轴与曲线 label 缺省回退语法 id
 * （mermaid db 语义 label ?? name）；曲线 detail 是**双形态归一后**的值映射摘要
 * （键值 / 值列表都归一为 axisId=value——原形态保留在源码，投影不做区分展示），
 * raw 形态（清单外条目）只标注不可编辑。选项条目点击回落图表级（编辑入口 = 图表级
 * 表单的图表级字段）。radar 画布无 data-id（见 radar-adapter），结构树 + 属性表单
 * 是完整编辑入口。
 */
export function radarPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'radar') return []
  const p: RadarProjection = projection.radar

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'axes',
      heading: t('app:propertyPanel.radarAxes'),
      count: p.axes.length,
      entries: p.axes.map((a) => ({
        key: a.elementId,
        label: a.label ?? a.id,
        detail: a.label !== null ? a.id : undefined,
        depth: 1,
        selection: { kind: 'radar-axis', elementId: a.elementId },
        onKeyDown: radarEntryKeyDown(p, 'radar-axis', a.elementId),
      })),
    },
    {
      key: 'curves',
      heading: t('app:propertyPanel.radarCurves'),
      count: p.curves.length,
      entries: p.curves.map((c) => {
        const summary = Object.entries(c.values)
          .map(([axisId, value]) => `${axisId}=${value}`)
          .join(' · ')
        return {
          key: c.elementId,
          label: c.label ?? c.id,
          detail:
            c.form === 'raw'
              ? t('app:propertyPanel.radarCurveRaw')
              : summary !== ''
                ? summary
                : undefined,
          depth: 1,
          selection: { kind: 'radar-curve', elementId: c.elementId },
          onKeyDown: radarEntryKeyDown(p, 'radar-curve', c.elementId),
        }
      }),
    },
    {
      key: 'options',
      heading: t('app:propertyPanel.radarOptions'),
      count: p.options.length,
      entries: p.options.map((o) => ({
        key: o.elementId,
        label: o.name,
        detail: o.value,
        depth: 1,
        // 选项无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
        selection: DIAGRAM_SELECTION,
      })),
    },
  ]
}
