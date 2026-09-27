/**
 * 连线模式（工单 07）：右键菜单「添加连线 / 从这里连线」进入的交互状态。
 *
 * 状态机（纯逻辑，与 DOM/React 解耦）：
 * - idle → pick-start：进入连线模式，等待单击起点
 * - pick-start → pick-end：单击节点即定为起点（「从这里连线」可带预选起点，
 *   直接落在 pick-end，省一步）
 * - pick-end + 单击节点：完成连线（产出端点，落码交编辑意图管线）
 * - Esc 或点击空白：任何阶段取消回 idle
 *
 * 光标样式（十字）与事件接线在使用方（画布容器），本模块只管状态迁移。
 */

export type LinkModeState =
  | { stage: 'idle' }
  | { stage: 'pick-start' }
  | { stage: 'pick-end'; from: string }

export type LinkModeAction =
  | { type: 'enter'; preselectedFrom?: string }
  | { type: 'click-node'; nodeId: string }
  | { type: 'click-blank' }
  | { type: 'cancel' }

export interface LinkModeTransition {
  state: LinkModeState
  /** 完成的连线端点（pick-end 阶段单击终点时非空）；null = 本次操作没有产生连线 */
  completed: { from: string; to: string } | null
}

const IDLE: LinkModeState = { stage: 'idle' }

/** 连线模式状态迁移：`useReducer` 风格的纯函数，便于单测与复用 */
export function linkModeTransition(state: LinkModeState, action: LinkModeAction): LinkModeTransition {
  if (action.type === 'enter') {
    return action.preselectedFrom !== undefined
      ? { state: { stage: 'pick-end', from: action.preselectedFrom }, completed: null }
      : { state: { stage: 'pick-start' }, completed: null }
  }
  if (action.type === 'click-node') {
    if (state.stage === 'pick-start') {
      return { state: { stage: 'pick-end', from: action.nodeId }, completed: null }
    }
    if (state.stage === 'pick-end') {
      return { state: IDLE, completed: { from: state.from, to: action.nodeId } }
    }
    return { state, completed: null }
  }
  // click-blank / cancel：任何非 idle 阶段都回到 idle
  return { state: IDLE, completed: null }
}
