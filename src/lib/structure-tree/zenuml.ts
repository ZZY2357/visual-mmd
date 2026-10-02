// zenuml 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyboardEvent } from 'react'
import type { AnyProjection } from '../diagram-registry'
import type { ProjectionZenumlFragment, ProjectionZenumlMessage, ZenumlProjection } from '../projection/zenuml-projection'
import type { Selection } from '../projection/selection'
import { zenumlKeyPlan } from '../pipeline/zenuml-keyboard'
import { applyPlan } from '../pipeline/key-plan'
import { useEditorStore } from '../../store/editor'
import { diagramSection, withDiagramLabel, type TreeSection, type TreePartitionsContext } from './partitions'

/** zenuml 结构树行内键（Tab 加消息 / Delete 删元素）：与画布键盘共用同一份
 * zenumlKeyPlan（ADR-0013），执行交给 applyPlan。zenuml 画布无 data-id（任务 0 实测），
 * 结构树选中是键路径的实际驱动。 */
function zenumlEntryKeyDown(
  projection: ZenumlProjection,
  selection: Selection,
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.shiftKey) return
    if (e.key !== 'Tab' && e.key !== 'Delete' && e.key !== 'Backspace') return
    const plan = zenumlKeyPlan(projection, { key: e.key, mods: { shift: e.shiftKey }, selection })
    if (plan === null) return
    const { commitIntent, select } = useEditorStore.getState()
    applyPlan(plan, { commitIntent, select, preventDefault: () => e.preventDefault() })
  }
}

/**
 * zenuml 结构树（工单 19）：参与者 / 消息 / 片段三个分区（文档序）。
 * 消息是**平铺位置序**（`message:N`，ADR-0012）：片体内消息也展平进消息序列，detail
 * 携带种类与所属片段；片段（分组）detail 携带关键字 + 直接消息数（嵌套片段关系由
 * detail 呈现，不做树形嵌套——与位置序身份一致）。画布 DOM 无 data-id（任务 0 实测），
 * 结构树 + 属性表单是完整编辑入口。
 */
export function zenumlPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'zenuml') return []
  const p: ZenumlProjection = projection.zenuml

  const messageKindLabel = (kind: ProjectionZenumlMessage['messageKind']): string =>
    t(
      kind === 'sync'
        ? 'app:propertyPanel.zenumlMessageKindSync'
        : kind === 'async'
          ? 'app:propertyPanel.zenumlMessageKindAsync'
          : kind === 'new'
            ? 'app:propertyPanel.zenumlMessageKindNew'
            : 'app:propertyPanel.zenumlMessageKindReturn',
    )

  return [
    withDiagramLabel(
      diagramSection(p.title ?? undefined),
      t('app:propertyPanel.diagram'),
    ),
    {
      key: 'participants',
      heading: t('app:propertyPanel.zenumlParticipants'),
      count: p.participants.length,
      entries: p.participants.map((part) => ({
        key: part.elementId,
        label: part.alias ?? part.id,
        detail: part.annotation !== null ? `@${part.annotation}` : part.id,
        depth: 1,
        selection: { kind: 'zenuml-participant', elementId: part.elementId } as Selection,
        onKeyDown: zenumlEntryKeyDown(p, { kind: 'zenuml-participant', elementId: part.elementId }),
      })),
    },
    {
      key: 'fragments',
      heading: t('app:propertyPanel.zenumlFragments'),
      count: p.fragments.length,
      entries: p.fragments.map((frag: ProjectionZenumlFragment) => ({
        key: frag.elementId,
        label: frag.condition !== '' ? `${frag.keyword} ${frag.condition}` : frag.keyword,
        detail: t('app:propertyPanel.zenumlFragmentDetail', { count: frag.directMessageCount }),
        depth: 1,
        selection: { kind: 'zenuml-fragment', elementId: frag.elementId } as Selection,
        onKeyDown: zenumlEntryKeyDown(p, { kind: 'zenuml-fragment', elementId: frag.elementId }),
      })),
    },
    {
      key: 'messages',
      heading: t('app:propertyPanel.zenumlMessages'),
      count: p.messages.length,
      entries: p.messages.map((msg: ProjectionZenumlMessage) => ({
        key: msg.elementId,
        label: msg.label,
        detail: messageKindLabel(msg.messageKind),
        depth: msg.parentFragmentId !== null ? 2 : 1,
        selection: { kind: 'zenuml-message', elementId: msg.elementId } as Selection,
        onKeyDown: zenumlEntryKeyDown(p, { kind: 'zenuml-message', elementId: msg.elementId }),
      })),
    },
  ]
}
