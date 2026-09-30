import type { SourceDocument } from '../pipeline/document'
import {
  type StateDeclData,
  type StateDescData,
  type StateDirectionData,
  type StateNoteData,
  type StateTransitionData,
} from '../pipeline/state'
import type { Selection } from './selection'

/**
 * state 投影（more-diagrams 工单 02，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 状态按 id 唯一：`state "desc" as X` / `X : desc` 声明与转移引用归并到同一状态；
 *   仅被转移引用的状态为**隐式状态**（elementId null，没有声明行）。
 * - 复合状态 = composite 声明（`state X {`），作为分组节点进结构树；并发分区 `--`
 *   不是元素（只做逐字保留），其成员的 parentId 仍是复合状态。
 * - `[*]` 起止伪状态不是状态：只在转移端点出现（from/to 保留原文 `[*]`）。
 */

export type StatePseudoKind = 'choice' | 'fork' | 'join'

export interface ProjectionState {
  /** 状态 id（语法标识，画布 data-id 与编辑意图都用它） */
  id: string
  /** 声明行 elementId（`state:<id>`）；仅被转移引用的隐式状态为 null */
  elementId: string | null
  /** 同级插入 / 删除块清理的锚点：描述行 ?? 复合的 `}` ?? 声明行；隐式状态 null */
  tailElementId: string | null
  /** 描述（`id : desc` 的 desc 段或引号描述） */
  desc: string | null
  /** 描述的源码形态：'quoted' = `state "desc" as id`；'line' = `id : desc` */
  descForm: 'quoted' | 'line' | null
  /** 伪状态标注（`<<choice>>` 等）；普通状态 null */
  pseudo: StatePseudoKind | null
  /** 是否复合状态（`state X {`） */
  composite: boolean
  /** 父复合状态 id；顶层状态 null */
  parentId: string | null
}

export interface ProjectionStateTransition {
  /** `transition:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  from: string
  to: string
  /** 无标签时 null */
  label: string | null
}

export interface ProjectionStateNote {
  /** `note:N` */
  elementId: string
  side: 'left' | 'right'
  target: string
  text: string
}

export interface StateProjection {
  /** 图表级 direction 行取值；没有该行时 null（表单显示「跟随 Mermaid 默认」） */
  direction: string | null
  /** 按文档顺序（父先于子）；隐式状态在首次被引用处出现 */
  states: ProjectionState[]
  transitions: ProjectionStateTransition[]
  notes: ProjectionStateNote[]
}

/** 从解析产物构建 state 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildStateProjection(doc: SourceDocument): StateProjection {
  const directionValues: string[] = []
  const states: ProjectionState[] = []
  const transitions: ProjectionStateTransition[] = []
  const notes: ProjectionStateNote[] = []
  const byId = new Map<string, ProjectionState>()
  // 复合状态块栈：栈顶 = 当前内部状态的 parentId
  const compositeStack: ProjectionState[] = []

  const ensureState = (id: string): ProjectionState => {
    const existing = byId.get(id)
    if (existing !== undefined) return existing
    const state: ProjectionState = {
      id,
      elementId: null,
      tailElementId: null,
      desc: null,
      descForm: null,
      pseudo: null,
      composite: false,
      parentId: compositeStack[compositeStack.length - 1]?.id ?? null,
    }
    byId.set(id, state)
    states.push(state)
    return state
  }

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'state-decl') {
      const decl = data as StateDeclData
      const state = ensureState(decl.id)
      state.elementId = part.id
      state.tailElementId = part.id
      if (decl.desc !== null) {
        state.desc = decl.desc
        state.descForm = 'quoted'
      }
      if (decl.pseudo === 'choice' || decl.pseudo === 'fork' || decl.pseudo === 'join') {
        state.pseudo = decl.pseudo
      }
      if (decl.openBrace) {
        state.composite = true
        compositeStack.push(state)
      }
    } else if (data.kind === 'state-desc') {
      const desc = data as StateDescData
      const state = ensureState(desc.id)
      // `idle : 文本` 冒号后的前导空白是源码习惯（`: x`），投影按显示文本去除
      state.desc = desc.desc.trim()
      state.descForm = 'line'
      state.tailElementId = part.id
    } else if (data.kind === 'state-end') {
      const composite = compositeStack.pop()
      if (composite !== undefined) composite.tailElementId = part.id
    } else if (data.kind === 'state-transition') {
      const t = data as StateTransitionData
      if (t.from !== '[*]') ensureState(t.from)
      if (t.to !== '[*]') ensureState(t.to)
      transitions.push({ elementId: part.id, from: t.from, to: t.to, label: t.label !== '' ? t.label : null })
    } else if (data.kind === 'state-note') {
      const n = data as StateNoteData
      notes.push({ elementId: part.id, side: n.side, target: n.target, text: n.body.trim() })
    } else if (data.kind === 'state-direction') {
      directionValues.push((data as StateDirectionData).value)
    }
  }

  return { direction: directionValues[0] ?? null, states, transitions, notes }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveStateSelection(projection: StateProjection, selection: Selection | null): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'state':
      return projection.states.some((s) => s.id === selection.id) ? selection : null
    case 'state-transition':
      return projection.transitions.some((t) => t.elementId === selection.elementId) ? selection : null
    case 'state-note':
      return projection.notes.some((n) => n.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
