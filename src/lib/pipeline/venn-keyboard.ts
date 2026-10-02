// venn 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { VennIntent } from './venn'
import type { ProjectionVennArea, VennProjection } from '../projection/venn-projection'
import type { Selection } from '../projection/selection'

// ---------- venn 编辑键（more-diagrams 工单 21 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（venn）：集合 / 交集都映射到既有 delete-area 意图
 * （删集合会连带删去引用它的交集，级联在 VennParser.resolveDeleteArea 内完成）；
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function vennDeleteIntent(projection: VennProjection, selection: Selection | null): VennIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'venn-set': {
      const area = projection.sets.find((s) => s.ids[0] === selection.id)
      return area === undefined ? null : { type: 'delete-area', elementId: area.elementId }
    }
    case 'venn-union':
      return projection.unions.some((u) => u.elementId === selection.elementId)
        ? { type: 'delete-area', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/** 选中目标（集合按名字、交集按 elementId）在投影中的区域 */
function vennAreaOf(projection: VennProjection, selection: Selection): ProjectionVennArea | null {
  if (selection.kind === 'venn-set') {
    return projection.sets.find((s) => s.ids[0] === selection.id) ?? null
  }
  if (selection.kind === 'venn-union') {
    return projection.unions.find((u) => u.elementId === selection.elementId) ?? null
  }
  return null
}

/**
 * 键 → plan（venn，工单 21 / ADR-0013）：
 * - Delete = 删除选中区域（集合或交集，查 vennDeleteIntent 唯一映射；级联删交集由管线负责）
 * - 选中集合上 Tab = 加一个新集合（`set <nextSetId>`，落在该集合之后；id 避重 placeholder）
 * - 选中集合/交集上 Enter = 加一个交集（`union <id1>,<id2>`——把选中区域的**首个 id** 与
 *   文档序中下一个集合的首个 id 组成二元交集，落在选中区域之后；不足两个集合则无动作）
 * - 不做内联编辑：画布 DOM 的 `data-venn-sets` 已由能力包 nodeAnnotator 反注 `data-id`
 *   （research §8 实测），点选可用；但新增区域用占位名/id 落码，命名交给结构树 / 属性表单
 *   （与 pie/treemap 降级同口径，不进内联命名）。
 */
export function vennKeyPlan(projection: VennProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = vennDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null
  if (selection.kind !== 'venn-set' && selection.kind !== 'venn-union') return null
  const area = vennAreaOf(projection, selection)
  if (area === null) return null

  if (input.key === 'Tab') {
    // 只在集合上挂「加集合」：交集上 Tab 无自然类比（交集不含「集合的兄弟」语义）→ 不做
    if (selection.kind !== 'venn-set') return null
    const id = projection.nextSetId
    return {
      intents: [{ type: 'add-set', id, afterElementId: area.elementId } satisfies VennIntent],
      newElementTarget: { selection: { kind: 'venn-set', id } },
    }
  }

  // Enter = 以选中区域首个 id 与下一个集合首个 id 组成新二元交集
  const anchorId = area.ids[0]
  const anchorSetIdx = projection.sets.findIndex((s) => s.ids[0] === anchorId)
  if (anchorSetIdx === -1) return null
  const nextSet = projection.sets[anchorSetIdx + 1]
  if (nextSet === undefined) return null
  const otherId = nextSet.ids[0]
  if (otherId === undefined || otherId === anchorId) return null
  const ordinal = projection.nextUnionOrdinal
  return {
    intents: [
      { type: 'add-union', ids: [anchorId, otherId], afterElementId: area.elementId } satisfies VennIntent,
    ],
    newElementTarget: { selection: { kind: 'venn-union', elementId: `venn-union:${ordinal}` } },
  }
}
