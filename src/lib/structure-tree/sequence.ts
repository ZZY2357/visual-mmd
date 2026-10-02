// sequence 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { SequenceProjection } from '../projection/sequence-projection'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

// ---------- sequence ----------

export function sequencePartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'sequence') return []
  const p: SequenceProjection = projection.sequence
  return [
    withDiagramLabel(diagramSection(p.autonumber ? 'autonumber' : undefined), t('app:propertyPanel.diagram')),
    {
      key: 'participants',
      heading: t('app:propertyPanel.participants'),
      count: p.participants.length,
      entries: p.participants.map((participant) => ({
        key: participant.actorId,
        label: participant.alias ?? participant.actorId,
        detail:
          [
            participant.alias !== null
              ? participant.actorId
              : participant.active
                ? 'activate'
                : undefined,
            participant.created === true ? t('app:propertyPanel.createdByCreate') : undefined,
          ]
            .filter((x) => x !== undefined)
            .join(' · ') || undefined,
        depth: 1,
        selection: { kind: 'participant', actorId: participant.actorId },
      })),
    },
    {
      key: 'messages',
      heading: t('app:propertyPanel.messages'),
      count: p.messages.length,
      entries: p.messages.map((m) => ({
        key: m.elementId,
        label: `${m.from} → ${m.to}`,
        detail: m.text || undefined,
        depth: 1,
        selection: { kind: 'message', elementId: m.elementId },
      })),
    },
    {
      key: 'notes',
      heading: t('app:propertyPanel.notes'),
      count: p.notes.length,
      entries: p.notes.map((n) => ({
        key: n.elementId,
        label: t(`app:notePos.${n.pos}`),
        detail: n.text || undefined,
        depth: 1,
        selection: { kind: 'note', elementId: n.elementId },
      })),
    },
    {
      key: 'blocks',
      heading: t('app:propertyPanel.blocks'),
      count: p.blocks.length,
      entries: p.blocks.map((b) => ({
        key: b.elementId,
        label:
          b.keyword === 'else' || b.keyword === 'and'
            ? t(`app:elseKeywords.${b.keyword}`)
            : t(`app:blockKeywords.${b.keyword}`),
        detail: b.label ?? undefined,
        depth: b.depth,
        selection: { kind: 'block', elementId: b.elementId },
      })),
    },
    {
      key: 'regions',
      heading: t('app:propertyPanel.regions'),
      count: p.regions.length,
      entries: p.regions.map((r) => ({
        key: r.elementId,
        label:
          r.kind === 'box' ? (r.label ?? t('app:propertyPanel.boxRegion')) : t('app:propertyPanel.rectRegion'),
        detail: r.kind === 'box' ? (r.color ?? undefined) : r.color,
        depth: 1,
        selection: { kind: 'seq-region', elementId: r.elementId },
      })),
    },
  ]
}
