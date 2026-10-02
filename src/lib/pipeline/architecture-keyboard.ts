// architecture 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { isValidArchId, type ArchitectureIntent } from './architecture'
import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { ArchitectureProjection } from '../projection/architecture-projection'
import type { Selection } from '../projection/selection'

// ---------- architecture 编辑键（more-diagrams 工单 17 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（architecture）：service / junction（级联删触及边与 align）、
 * group（成员摘回顶层）、边、align 五类各映射到既有 delete-* 意图；已不在投影 /
 * null / 图表级 / 别种选中 → null。
 */
export function architectureDeleteIntent(
  projection: ArchitectureProjection,
  selection: Selection | null,
): ArchitectureIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'architecture-service':
      return projection.services.some((s) => s.id === selection.name)
        ? { type: 'delete-service', id: selection.name }
        : null
    case 'architecture-group':
      return projection.groups.some((g) => g.id === selection.name)
        ? { type: 'delete-group', id: selection.name }
        : null
    case 'architecture-junction':
      return projection.junctions.some((j) => j.id === selection.name)
        ? { type: 'delete-junction', id: selection.name }
        : null
    case 'architecture-edge':
      return projection.edges.some((e) => e.elementId === selection.elementId)
        ? { type: 'delete-edge', elementId: selection.elementId }
        : null
    case 'architecture-align':
      return projection.aligns.some((a) => a.elementId === selection.elementId)
        ? { type: 'delete-align', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/** 全部已用节点 id（service + group + junction）：mermaid db 的 registeredIds 共享命名空间 */
function architectureUsedIds(projection: ArchitectureProjection): string[] {
  return [
    ...projection.services.map((s) => s.id),
    ...projection.groups.map((g) => g.id),
    ...projection.junctions.map((j) => j.id),
  ]
}

/**
 * 键 → plan（architecture，工单 17 / ADR-0013，工单定案）：
 * - Delete = 删除选中元素（查 architectureDeleteIntent 唯一映射）
 * - 选中 service 上 Tab = 加 service（继承 `in` 分组，锚点插在该 service 声明之后），
 *   落码 + 选中 + 内联编辑标题
 * - 选中 service 上 Enter = 从该 service 拉一条边（落到 AddArchitectureEdgeInlineForm
 *   表单浮层，from 预选，不直接落码）
 * group / junction / 边 / align 上无 Tab/Enter 语义（不扩就近类比）。
 * 注：边画布 DOM 不可寻址（见 architecture-adapter），边选中来自结构树；service 等节点
 * 经反注可寻址，画布键盘与结构树键盘都可用。
 */
export function architectureKeyPlan(projection: ArchitectureProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = architectureDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'architecture-service') return null
  const service = projection.services.find((s) => s.id === selection.name)
  if (service === undefined) return null
  if (input.key === 'Enter') return { intents: [], form: 'architecture-edge' }
  // 生成式 id 无引用语义之外——id 会被边/align 引用，但新建时尚无引用；编号从 1 起
  const id = nextFreeName('service', architectureUsedIds(projection), { referential: false })
  if (!isValidArchId(id)) return null
  return {
    intents: [
      {
        type: 'add-service',
        id,
        title: id,
        parent: service.parent ?? undefined,
        afterElementId: service.elementId,
      } satisfies ArchitectureIntent,
    ],
    newElementTarget: {
      selection: { kind: 'architecture-service', name: id },
      inlineEdit: { kind: 'architecture', elementKind: 'service', id },
    },
  }
}
