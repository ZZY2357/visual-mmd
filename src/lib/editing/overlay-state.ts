import { linkModeTransition, type LinkModeState } from './link-mode'
import type { ContextMenuTarget } from './context-menu'

/**
 * 画布覆盖层状态机（architecture-deepening-2 工单 05）：右键菜单 / 样式表单 / 节点表单 /
 * 连线模式 / 内联编辑五个浮层的状态收成纯函数，与 DOM / React / store 完全解耦。
 *
 * 动工前核实的产品事实（以现状建模，本票不改行为）：
 * - menu / styleForm / nodeForm / linkMode **四者互斥**：每条打开路径都先收起其它浮层
 *   （openStyleForm / openNodeForm 收菜单、onContextMenu 与 enterLinkMode 收全部）→
 *   收进单个 `open` 字段。
 * - **内联编辑与任一浮层可并存**：beginEdit 不收菜单、开菜单 / 表单也不取消编辑
 *   （例如菜单开着时双击节点，编辑与菜单同时在场）→ 内联编辑不进互斥的 `open`，
 *   用独立布尔位建模，只经 begin / end 两个动作翻转。
 * - 点击画布的裁定（现状逐字保持）：菜单 / 节点表单打开 → 关浮层、不吃掉点击；
 *   连线模式 → 点击被连线消费（节点推进、空白取消）；样式表单与无浮层 → 落到选中链路
 *   （样式表单今天**不**被画布点击关闭）。内联编辑不改变点击裁定。
 * - 背景拖拽让位裁定（现状逐字保持）：内联编辑与 menu / styleForm / nodeForm 打开时
 *   不启动拖拽（setPointerCapture 会把后续指针事件连派生的 click 一起劫持到容器，
 *   菜单项永远收不到点击——工单 08）；连线模式不挡拖拽。
 * - Escape 的「全关」：`escape` 动作是代码库中**唯一**一份定义——四个互斥浮层一律回
 *   idle，内联编辑不动（它的 Esc 是输入框自己的取消路径，不走容器监听）。
 *
 * 浮层的坐标 / 目标等负载随 `open` 一起放进状态；连线模式的内部阶段沿用 link-mode.ts
 * 的纯状态机（工单 07），本机在 linkMode 分支上委托它。
 */

/** 菜单浮层负载（原 use-canvas-context-menu 私有 MenuState，工单 05 收进状态机） */
export interface MenuState {
  target: ContextMenuTarget
  /** 菜单相对画布容器的位置 */
  x: number
  y: number
}

/** 「添加样式」小表单负载：表单相对画布容器的位置（在菜单打开处浮出） */
export interface StyleFormState {
  x: number
  y: number
}

/** 菜单上浮出的添加型小表单种类（工单 06 三项 + 工单 04 补三项 + state 转移）：
 * 'note' 同时服务 sequence（注释）与 class（浮动 / note for X），由投影图种决定渲染哪个表单。 */
export type NodeFormKind = 'member' | 'relation' | 'message' | 'note' | 'block' | 'transition'

export interface NodeFormState {
  kind: NodeFormKind
  /** 落码锚点：右键元素的声明 elementId（新元素插到它之后）。
   * 缺省 = 空白处右键，由各管线回退到文档最后一个元素。 */
  anchorElementId?: string
  /** class 表单：预选类名（右键的那个类）；class 的 note 表单用它预选 `note for` 目标 */
  className?: string
  /** sequence 消息表单：预选起点参与者（右键的那个参与者） */
  from?: string
  /** 表单相对画布容器的位置（在菜单打开处浮出） */
  x: number
  y: number
}

/** 互斥浮层（四者任一时刻至多一个在场；idle = 全部关闭） */
export type OverlayOpen =
  | { kind: 'idle' }
  | ({ kind: 'menu' } & MenuState)
  | ({ kind: 'styleForm' } & StyleFormState)
  | { kind: 'nodeForm'; form: NodeFormState }
  | { kind: 'linkMode'; link: LinkModeState }

export interface OverlayState {
  open: OverlayOpen
  /** 内联编辑在场（与浮层并存，见顶部核实说明） */
  inlineEdit: boolean
}

export const IDLE_OPEN: OverlayOpen = { kind: 'idle' }
export const IDLE_OVERLAY: OverlayState = { open: IDLE_OPEN, inlineEdit: false }

export type OverlayAction =
  | { type: 'open-menu'; menu: MenuState }
  | { type: 'open-style-form'; x: number; y: number }
  | { type: 'open-node-form'; form: NodeFormState }
  | { type: 'enter-link-mode'; preselectedFrom?: string }
  /** 连线模式中的画布单击：节点 = 推进（两步完成时产出端点），空白 = 取消 */
  | { type: 'link-click-node'; nodeId: string }
  | { type: 'link-click-blank' }
  /** 关闭当前互斥浮层（画布点击裁定 / 表单提交成功等的落点） */
  | { type: 'close-float' }
  /** Escape 全关：四个互斥浮层一律回 idle；内联编辑不动（唯一一份定义，见顶部注释） */
  | { type: 'escape' }
  | { type: 'begin-inline-edit' }
  | { type: 'end-inline-edit' }

export interface OverlayTransition {
  state: OverlayState
  /** 连线两步完成时产出端点（落码交使用方，纯函数不碰 store）；其余动作 null */
  completedLink: { from: string; to: string } | null
}

/** 覆盖层状态迁移：`useReducer` 风格的纯函数，转换表直接单测（overlay-state.test.ts） */
export function overlayTransition(state: OverlayState, action: OverlayAction): OverlayTransition {
  const keep = (open: OverlayOpen = state.open): OverlayTransition => ({
    state: { ...state, open },
    completedLink: null,
  })
  switch (action.type) {
    case 'open-menu':
      return keep({ kind: 'menu', ...action.menu })
    case 'open-style-form':
      return keep({ kind: 'styleForm', x: action.x, y: action.y })
    case 'open-node-form':
      return keep({ kind: 'nodeForm', form: action.form })
    case 'enter-link-mode':
      return keep({
        kind: 'linkMode',
        link: linkModeTransition({ stage: 'idle' }, { type: 'enter', preselectedFrom: action.preselectedFrom }).state,
      })
    case 'link-click-node': {
      if (state.open.kind !== 'linkMode') return keep()
      const t = linkModeTransition(state.open.link, { type: 'click-node', nodeId: action.nodeId })
      // 连线落定（或任何回 idle 的迁移）即收掉浮层：cursor 与点击裁定都以 open 为准
      return {
        state: { ...state, open: t.state.stage === 'idle' ? IDLE_OPEN : { kind: 'linkMode', link: t.state } },
        completedLink: t.completed,
      }
    }
    case 'link-click-blank': {
      if (state.open.kind !== 'linkMode') return keep()
      const t = linkModeTransition(state.open.link, { type: 'click-blank' })
      return keep(t.state.stage === 'idle' ? IDLE_OPEN : { kind: 'linkMode', link: t.state })
    }
    case 'close-float':
      return keep(IDLE_OPEN)
    case 'escape':
      // 「全关」的唯一定义：互斥浮层清空；inlineEdit 有自己的取消路径，这里不动
      return keep(IDLE_OPEN)
    case 'begin-inline-edit':
      return { state: { ...state, inlineEdit: true }, completedLink: null }
    case 'end-inline-edit':
      return { state: { ...state, inlineEdit: false }, completedLink: null }
  }
}

/** 画布单击裁定（谁消费这次点击）：表驱动、脱离 DOM 可测 */
export type CanvasClickRuling =
  /** 关闭当前浮层，点击到此为止（不落入选中链路） */
  | 'close-float'
  /** 点击交给连线模式（hook 内解析节点 / 空白后 dispatch link-click-*） */
  | 'link-mode'
  /** 无浮层主张：落到既有选中链路 */
  | 'select'

export function canvasClickRuling(state: OverlayState): CanvasClickRuling {
  switch (state.open.kind) {
    case 'menu':
    case 'nodeForm':
      return 'close-float'
    case 'linkMode':
      return 'link-mode'
    case 'styleForm':
    case 'idle':
      // 样式表单今天不被画布点击关闭（现状逐字保持）
      return 'select'
  }
}

/** 背景拖拽让位裁定（工单 08 的死守卫收进表）：返回 true = 本次按下不启动背景拖拽 */
export function pointerDownBlocksDrag(state: OverlayState): boolean {
  if (state.inlineEdit) return true
  const kind = state.open.kind
  return kind === 'menu' || kind === 'styleForm' || kind === 'nodeForm'
}
