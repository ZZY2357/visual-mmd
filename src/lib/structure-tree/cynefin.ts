// cynefin 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { CynefinProjection } from '../projection/cynefin-projection'
import { DIAGRAM_SELECTION, type Selection } from '../projection/selection'
import { cynefinKeyPlan } from '../pipeline/cynefin-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- cynefin（more-diagrams 工单 25） ----------

/**
 * cynefin 结构树条目的键盘（工单 25 / ADR-0013）：焦点在条目 / 域名词行条目上时
 * Tab = 加条目（条目上 = 同域内该条目之后；域上 = 该域下；落到键语义唯一映射
 * cynefinKeyPlan），Delete/Backspace = 删除条目 / 转移（域名词行不可删）。
 * 执行交给唯一的 applyPlan。cynefin 画布无 data-id（research §4/§8.1 实测，
 * 见 cynefin-adapter），结构树是唯一的键盘入口（与 ishikawa/treemap 同口径）。
 */
function cynefinEntryKeyDown(
  projection: CynefinProjection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = cynefinKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * cynefin 结构树（工单 25）：五个固定域各一分区（域即分组，条目挂其下——
 * 归属纯由位置决定，research §8.2），另有「转移」分区（顶层单行）与「文档行」分区
 * （title / accTitle / accDescr）。五个域恒定展示（未声明的域为空分区），
 * 便于用户在任意域下加条目。cynefin 画布 DOM 无 data-id（research §4/§8.1：
 * 渲染器 `data-` 出现 0 次，仅 <defs> marker 有 id），结构树 + 属性表单是完整编辑入口。
 */
export function cynefinPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'cynefin') return []
  const p: CynefinProjection = projection.cynefin

  const domainSection = (domain: (typeof p.domains)[number]): TreeSection => ({
    key: `domain-${domain.name}`,
    heading: t(`app:propertyPanel.cynefinDomains.${domain.name}`),
    count: domain.items.length,
    entries: [
      {
        key: domain.elementId,
        label: t(`app:propertyPanel.cynefinDomains.${domain.name}`),
        detail: t('app:propertyPanel.cynefinDomainShort'),
        depth: 1,
        selection: { kind: 'cynefin-domain', name: domain.name },
        onKeyDown: cynefinEntryKeyDown(p, { kind: 'cynefin-domain', name: domain.name }),
        children: domain.items.map((item) => ({
          key: item.elementId,
          label: item.text,
          depth: 2,
          selection: { kind: 'cynefin-item', elementId: item.elementId },
          onKeyDown: cynefinEntryKeyDown(p, { kind: 'cynefin-item', elementId: item.elementId }),
        })),
      },
    ],
  })

  return [
    withDiagramLabel(
      diagramSection(p.docLines.find((dl) => dl.docKind === 'title')?.text ?? undefined),
      t('app:propertyPanel.diagram'),
    ),
    ...p.domains.map(domainSection),
    {
      key: 'transitions',
      heading: t('app:propertyPanel.cynefinTransitions'),
      count: p.transitions.length,
      entries: p.transitions.map((transition) => ({
        key: transition.elementId,
        label:
          transition.label === ''
            ? `${transition.from} --> ${transition.to}`
            : `${transition.from} --> ${transition.to} : ${transition.label}`,
        depth: 1,
        selection: { kind: 'cynefin-transition', elementId: transition.elementId },
        onKeyDown: cynefinEntryKeyDown(p, { kind: 'cynefin-transition', elementId: transition.elementId }),
      })),
    },
    {
      key: 'docLines',
      heading: t('app:propertyPanel.cynefinDocLines'),
      count: p.docLines.length,
      entries: p.docLines.map((line) => ({
        key: line.elementId,
        label: line.text,
        detail: t(`app:propertyPanel.cynefinDocKinds.${line.docKind}`),
        depth: 1,
        // 文档级属性行无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
        selection: DIAGRAM_SELECTION,
      })),
    },
  ]
}
