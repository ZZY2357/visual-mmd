// xychart 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { XychartProjection } from '../projection/xychart-projection'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- xychart（more-diagrams 工单 14） ----------

/**
 * xychart 结构树（工单 14）：三个分区——标题与轴（文档级属性元素，固定身份）、
 * 系列（位置序身份 `series:N`）。系列 label = 名字 ?? 「未命名系列」，detail 携带
 * 类型与数值个数；**手写源码的非法名字 / 非法数值 / 点标签系列原样展示并标注**
 * （不静默改写，工单定案）。xychart 画布经类名组反注可寻址（见 xychart-adapter），
 * 画布键盘直接生效，树条目不挂 onKeyDown（与 flowchart 同口径）。
 */
export function xychartPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'xychart') return []
  const p: XychartProjection = projection.xychart

  const docEntries: TreeEntry[] = []
  if (p.title !== null) {
    docEntries.push({
      key: 'xychart-title',
      label: p.title.text,
      detail: p.title.textValid ? undefined : t('app:propertyPanel.xychartTextInvalidShort', { text: p.title.text }),
      depth: 1,
      selection: { kind: 'xychart-title' },
    })
  }
  for (const axis of [p.xAxis, p.yAxis]) {
    const formLabel =
      axis.form === 'categories'
        ? t('app:propertyPanel.xychartUseCategories')
        : axis.form === 'range'
          ? `${axis.range?.min ?? ''} --> ${axis.range?.max ?? ''}`
          : t('app:propertyPanel.xychartAxisNoRest')
    docEntries.push({
      key: `xychart-${axis.axis}-axis`,
      label: t('app:propertyPanel.xychartAxisLabel', { axis: axis.axis.toUpperCase() }),
      detail:
        [
          axis.title ?? t('app:propertyPanel.xychartAxisNoTitle'),
          formLabel,
          axis.titleValid ? undefined : t('app:propertyPanel.xychartTextInvalidShort', { text: axis.title ?? '' }),
        ]
          .filter((x) => x !== undefined)
          .join(' · '),
      depth: 1,
      selection: { kind: 'xychart-axis', axis: axis.axis },
    })
  }

  return [
    withDiagramLabel(diagramSection('xychart-beta'), t('app:propertyPanel.diagram')),
    {
      key: 'doc-elements',
      heading: t('app:propertyPanel.xychartDocElements'),
      entries: docEntries,
    },
    {
      key: 'series',
      heading: t('app:propertyPanel.xychartSeries'),
      count: p.series.length,
      entries: p.series.map((s) => ({
        key: s.elementId,
        label: s.name ?? t('app:propertyPanel.xychartUnnamedSeries'),
        detail:
          [
            s.seriesType,
            t('app:propertyPanel.xychartValueCount', { count: s.values.length }),
            s.nameValid ? undefined : t('app:propertyPanel.xychartTextInvalidShort', { text: s.name ?? '' }),
            s.editable ? undefined : t('app:propertyPanel.xychartLabelsHint'),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'xychart-series', elementId: s.elementId },
      })),
    },
  ]
}
