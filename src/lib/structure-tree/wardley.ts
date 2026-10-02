// wardley 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { WardleyProjection } from '../projection/wardley-projection'
import { DIAGRAM_SELECTION, type Selection } from '../projection/selection'
import { wardleyKeyPlan } from '../pipeline/wardley-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- wardley（more-diagrams 工单 23） ----------

/**
 * wardley 节点条目的键盘（工单 23 / ADR-0013）：焦点在节点条目上时
 * Tab = 加 component / Enter = 加 anchor / Delete = 删除该节点（连带触及的连线与 evolve，
 * preventDefault 压掉默认行为）。键 → plan 走能力包同一份 wardleyKeyPlan，执行交给唯一的
 * applyPlan。wardley 画布无 data-id（research §4 实测，见 wardley-adapter），
 * 结构树是唯一的键盘入口（与 treemap/timeline/journey 同口径）。
 */
function wardleyNodeKeyDown(
  projection: WardleyProjection,
  name: string,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const selection: Selection = { kind: 'wardley-node', name }
    const plan = wardleyKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * wardley 结构树（工单 23）：节点 / 连线 / evolve 三分区（另有文档级属性行并入节点分区
 * 之后的「文档行」分区）。节点是名字即身份（mermaid 按名引用连线/evolve），detail 携带
 * 节点种类与坐标原文——**越界/畸形坐标原样展示并标注**（不静默改写，工单定案）；
 * pipeline 内节点加标注（工单不做块内编辑）。连线 detail 携带箭头形态，**悬空引用标注**；
 * evolve detail 携带目标原文，**非法目标 / 悬空名字标注**。wardley 画布无 data-id
 * （research §4），结构树 + 属性表单是完整编辑入口。
 */
export function wardleyPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'wardley') return []
  const p: WardleyProjection = projection.wardley

  const nodeDetail = (node: (typeof p.nodes)[number]): string | undefined =>
    [
      node.nodeKind === 'anchor' ? t('app:propertyPanel.wardleyAnchor') : t('app:propertyPanel.wardleyComponent'),
      node.coordsValid
        ? `[${node.visibilityText}, ${node.evolutionText}]`
        : t('app:propertyPanel.wardleyCoordInvalidShort', {
            value: `[${node.visibilityText}, ${node.evolutionText}]`,
          }),
      node.inPipeline ? t('app:propertyPanel.wardleyInPipelineShort') : undefined,
    ]
      .filter((x) => x !== undefined)
      .join(' · ') || undefined

  return [
    withDiagramLabel(diagramSection(p.title ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'nodes',
      heading: t('app:propertyPanel.wardleyNodes'),
      count: p.nodes.length,
      entries: p.nodes.map((node) => ({
        key: node.elementId,
        label: node.name,
        detail: nodeDetail(node),
        depth: 1,
        selection: { kind: 'wardley-node', name: node.name },
        onKeyDown: wardleyNodeKeyDown(p, node.name),
      })),
    },
    {
      key: 'links',
      heading: t('app:propertyPanel.wardleyLinks'),
      count: p.links.length,
      entries: p.links.map((link) => ({
        key: link.elementId,
        label: `${link.from} ${link.arrow} ${link.to}`,
        detail: link.endpointsValid ? undefined : t('app:propertyPanel.wardleyDanglingShort'),
        depth: 1,
        selection: { kind: 'wardley-link', elementId: link.elementId },
      })),
    },
    {
      key: 'evolves',
      heading: t('app:propertyPanel.wardleyEvolves'),
      count: p.evolves.length,
      entries: p.evolves.map((evolve) => ({
        key: evolve.elementId,
        label: `${evolve.name} → ${evolve.targetText}`,
        detail:
          [
            evolve.nameValid ? undefined : t('app:propertyPanel.wardleyDanglingShort'),
            evolve.targetValid ? undefined : t('app:propertyPanel.wardleyTargetInvalidShort'),
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'wardley-evolve', elementId: evolve.elementId },
      })),
    },
    {
      key: 'docLines',
      heading: t('app:propertyPanel.wardleyDocLines'),
      count: p.docLines.length,
      entries: p.docLines.map((line) => ({
        key: line.elementId,
        label: line.text,
        detail: t(`app:propertyPanel.wardleyDocKinds.${line.docKind}`),
        depth: 1,
        // 文档级属性行无独立选中种类（编辑入口 = 图表级表单），点击回落图表级
        selection: DIAGRAM_SELECTION,
      })),
    },
  ]
}
