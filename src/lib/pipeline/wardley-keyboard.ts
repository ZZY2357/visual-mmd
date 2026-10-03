// wardley 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import { isValidWardleyCoord, isValidWardleyEvolutionTarget, type WardleyIntent } from './wardley'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { WardleyProjection } from '../projection/wardley-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

// ---------- wardley 编辑键（more-diagrams 工单 23 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（wardley）：节点（级联删同名触及连线与 evolve，由管线负责）、
 * 连线、evolve 三类各映射到既有 delete-* 意图；已不在投影 / null / 图表级 / 文档级属性行 /
 * 别种选中 → null。
 */
export function wardleyDeleteIntent(
  projection: WardleyProjection,
  selection: Selection | null,
): WardleyIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'wardley-node':
      return projection.nodes.some((n) => n.name === selection.name)
        ? { type: 'delete-node', elementId: `wardley-node:${selection.name}` }
        : null
    case 'wardley-link':
      return projection.links.some((l) => l.elementId === selection.elementId)
        ? { type: 'delete-link', elementId: selection.elementId }
        : null
    case 'wardley-evolve':
      return projection.evolves.some((e) => e.elementId === selection.elementId)
        ? { type: 'delete-evolve', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（wardley，工单 23 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中元素（查 wardleyDeleteIntent 唯一映射；节点级联删触及连线/evolve 由管线负责）
 * - 选中节点上 Tab = 加 component（名字避重、坐标落图正中 [0.5, 0.5]，锚点 = 该节点行，
 *   落码后选中新节点——不做内联编辑：画布无 data-id，键操作实际从结构树选中后经画布键盘生效，
 *   与 pie/journey/treemap 降级同口径）
 * - 选中节点上 Enter = 加 anchor（同上形态；wardley 的两类节点即「就近结构」的另一类）
 * - 连线 / evolve / 文档级属性行上无 Tab/Enter 语义（不扩就近类比）
 */
export function wardleyKeyPlan(projection: WardleyProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = wardleyDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'wardley-node') return null
  const node = projection.nodes.find((n) => n.name === selection.name)
  if (node === undefined) return null
  const nodeKind = input.key === 'Tab' ? 'component' : 'anchor'
  const name = nextFreeName(nodeKind === 'component' ? newElementName('component') : newElementName('anchor'), projection.nodes.map((n) => n.name))
  const intent: WardleyIntent = {
    type: 'add-node',
    nodeKind,
    name,
    coords: { visibility: '0.5', evolution: '0.5' },
    afterElementId: node.elementId,
  }
  return {
    intents: [intent],
    // 管线语义：锚点 = 该节点行，新节点位置序 = 该节点文档序 + 1
    newElementTarget: {
      selection: { kind: 'wardley-node', name },
    },
  }
}

// ---------- wardley 表单辅助（表单层共用：坐标 / evolve 目标校验） ----------

/** 节点坐标是否合法（表单 error 提示与提交门卫共用，与 pipeline 同界） */
export function isWardleyCoordsValid(visibility: string, evolution: string): boolean {
  return isValidWardleyCoord(visibility) && isValidWardleyCoord(evolution)
}

/** evolve 目标值是否合法（表单 error 提示与提交门卫共用） */
export function isWardleyTargetValid(target: string): boolean {
  return isValidWardleyEvolutionTarget(target)
}
