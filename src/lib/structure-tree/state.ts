// state 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { StateProjection } from '../projection/state-projection'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- state（more-diagrams 工单 02） ----------

export function statePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'state') return []
  const p: StateProjection = projection.state

  const pseudoLabel = (pseudo: string) => t(`app:statePseudoKinds.${pseudo}`)

  // 复合状态作为分组节点：children 递归展开（与 mindmap 的树形缩进同一渲染器）
  const childrenOf = new Map<string | null, typeof p.states>()
  for (const state of p.states) {
    const list = childrenOf.get(state.parentId) ?? []
    list.push(state)
    childrenOf.set(state.parentId, list)
  }

  const toEntry = (state: (typeof p.states)[number]): TreeEntry => {
    const children = (childrenOf.get(state.id) ?? []).map(toEntry)
    return {
      key: state.id,
      label: state.desc ?? state.id,
      detail:
        [
          state.desc !== null ? state.id : undefined,
          state.pseudo !== null ? pseudoLabel(state.pseudo) : undefined,
          state.composite ? t('app:propertyPanel.stateComposite') : undefined,
        ]
          .filter((x) => x !== undefined)
          .join(' · ') || undefined,
      depth: 1,
      selection: { kind: 'state', id: state.id },
      children: children.length > 0 ? children : undefined,
    }
  }

  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'states',
      heading: t('app:propertyPanel.states'),
      count: p.states.length,
      entries: (childrenOf.get(null) ?? []).map(toEntry),
    },
    {
      key: 'transitions',
      heading: t('app:propertyPanel.stateTransitions'),
      count: p.transitions.length,
      entries: p.transitions.map((tr) => ({
        key: tr.elementId,
        label: `${tr.from} → ${tr.to}`,
        detail: tr.label ?? undefined,
        depth: 1,
        selection: { kind: 'state-transition', elementId: tr.elementId },
      })),
    },
    {
      key: 'notes',
      heading: t('app:propertyPanel.notes'),
      count: p.notes.length,
      entries: p.notes.map((n) => ({
        key: n.elementId,
        label: t(`app:notePos.${n.side}`),
        detail: n.text || undefined,
        depth: 1,
        selection: { kind: 'state-note', elementId: n.elementId },
      })),
    },
  ]
}
