// usecase 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { UsecaseIntent } from './usecase'
import type { UsecaseProjection } from '../projection/usecase-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

// ---------- usecase 编辑键（more-diagrams 工单 26 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（usecase）：actor / 用例 / 边界 / 注释都映射到既有
 * delete-usecase-element 意图（删节点会级联删去引用它的关系与 note、删边界级联删 end，
 * 级联在 UsecaseParser.resolveDeleteElement 内完成）；关系映射到 delete-usecase-relation。
 * 已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function usecaseDeleteIntent(
  projection: UsecaseProjection,
  selection: Selection | null,
): UsecaseIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'usecase-actor':
    case 'usecase-usecase':
    case 'usecase-boundary':
    case 'usecase-note':
      return projection.nodes.some((n) => n.elementId === selection.elementId)
        ? { type: 'delete-usecase-element', elementId: selection.elementId }
        : null
    case 'usecase-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId)
        ? { type: 'delete-usecase-relation', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（usecase，工单 26 / ADR-0013）：
 * - Delete = 删除选中元素（节点 / 边界 / 注释 / 关系，查 usecaseDeleteIntent 唯一映射）
 * - 选中 actor / 用例上 Tab = 加一个新用例（`<nextId>("<label>")`，落在选中元素之后；
 *   id 由 nextFreeName 避重，标签为占位「新用例」）
 * - 选中 actor / 用例上 Enter = 加一个 actor（`actor <nextId>`，落在选中元素之后）
 * - 不做内联编辑：画布 DOM 的 `data-id` 已由渲染器写入并由能力包 nodeAnnotator 归一
 *   （research §4 实测），点选可用；新增元素用占位 id/标签落码，命名交给结构树 / 属性表单
 *   （与 venn/treemap 降级同口径）。
 */
export function usecaseKeyPlan(projection: UsecaseProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = usecaseDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null) return null
  if (selection.kind !== 'usecase-actor' && selection.kind !== 'usecase-usecase') return null
  const node = projection.nodes.find((n) => n.elementId === selection.elementId)
  if (node === undefined) return null
  // 命名空间是全局的（actor / 用例 / 边界共享），避重基于全部已知标识符
  const used = projection.nodes.map((n) => n.id)
  if (input.key === 'Tab') {
    const id = nextFreeName('Usecase', used)
    return {
      intents: [
        { type: 'add-usecase', id, label: newElementName('usecase'), shape: 'ellipse' } satisfies UsecaseIntent,
      ],
      newElementTarget: { selection: { kind: 'usecase-usecase', elementId: `usecase:${id}` } },
    }
  }
  const id = nextFreeName('Actor', used)
  return {
    intents: [{ type: 'add-actor', id } satisfies UsecaseIntent],
    newElementTarget: { selection: { kind: 'usecase-actor', elementId: `actor:${id}` } },
  }
}
