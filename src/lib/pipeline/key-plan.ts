// 键事件的语义形状与唯一执行器（architecture-deepening-3 工单 02：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）。
// 落在 pipeline 层：editing（画布键盘 hook / 右键菜单）与 structure-tree（图种树条目 onKeyDown）
// 两个消费方都从这里取，恢复「结构树层不依赖编辑层」的方向；editing/canvas-keyboard.ts 对本模块
// 做同名 re-export，既有消费方与测试的 import 路径不变。

import type { EditIntent } from './parser'
import type { CanvasInlineEditTarget } from '../editing/inline-edit'
import type { Selection } from '../projection/selection'

/** 编辑键请求打开的添加表单种类：member / relation / message 落到已有表单浮层
 * （锚点/预选由右键菜单 hook 从选中推出），participant 走既有创建路径（内联命名） */
export type KeyFormKind =
  | 'member'
  | 'relation'
  | 'message'
  | 'participant'
  | 'transition'
  | 'er-relation'
  | 'requirement-relation'
  | 'block-edge'
  | 'sankey-link'
  // xychart（more-diagrams 工单 14）：加系列表单（line / bar 两形态分开，提交才落码）
  | 'xychart-line'
  | 'xychart-bar'
  // architecture（more-diagrams 工单 17）：加边表单（from 预选，提交才落码）
  | 'architecture-edge'
  // agentflow（more-diagrams 工单 27）：加边表单（from 预选，提交才落码）
  | 'agentflow-edge'
  // zenuml（more-diagrams 工单 19）：加消息表单（from 预选该消息的发起方，提交才落码）
  | 'zenuml-message'
  // C4（more-diagrams 工单 18）：从选中元素拉一条关系（from 预选，提交才落码）
  | 'c4-relation'

/** 键事件的语义 plan：执行器（applyPlan）按字段决定提交 / 选中 / 内联编辑 / 表单 */
export interface KeyPlan {
  /** 依次经管线落码的编辑意图序列（表单类 plan 为空——提交才落码） */
  intents: EditIntent[]
  /** 全部意图落码成功后：选中新元素，且（若有）进入内联编辑（删除类 plan 无此字段；
   * 属性类新元素不做内联编辑（er 属性无双击/内联，工单 03），inlineEdit 可省略） */
  newElementTarget?: { selection: Selection; inlineEdit?: CanvasInlineEditTarget }
  /** 编辑键要求打开的添加表单（class/sequence 的 Tab/Enter 落到已有表单，不直接落码） */
  form?: KeyFormKind
  /** 落码成功后清空选中（class/sequence 的删除，与右键菜单/属性面板删除一致；
   * flowchart/mindmap 的键盘删除保留原选中，由属性面板的 resolveSelection 回落） */
  clearSelection?: boolean
}

/** 键事件的纯描述（keydown 的 key / 修饰键 / 当前选中 / mindmap 占位文本） */
export interface KeyInput {
  key: string
  mods?: { shift?: boolean }
  selection: Selection | null
  /** mindmap 新节点占位文本（确认前落码用，内联命名确认后改写） */
  newNodeText?: string
}

/** 能力包上的键位处理器：`keyHandler(projection)` 一次绑定投影，之后每个键事件纯函数求值 */
export type KeyHandler = (input: KeyInput) => KeyPlan | null

/** plan 执行器消费的语境：提交 / 选中 / 内联编辑 / 表单 / preventDefault。
 * 键盘（hook）、右键菜单（menu-actions）、结构树三处共用同一份执行策略。 */
export interface PlanExecutor {
  /** 提交编辑意图（可撤销）；false = 被拒绝，中止后续步骤（含选中与内联编辑） */
  commitIntent: (intent: EditIntent) => boolean
  /** 多意图原子提交（可选）：同一动作的意图序列（如加节点+加边）合并为一个撤销快照；
   * 未接线时退化为逐个 commitIntent（每个意图各一个快照） */
  commitIntents?: (intents: EditIntent[]) => boolean
  /** 更新编辑器选中 */
  select: (selection: Selection | null) => void
  /** 进入内联编辑（新建元素的命名）；结构树路径经由 pendingInlineEdit 请求间接接入 */
  beginInlineEdit?: (target: CanvasInlineEditTarget) => void
  /** 打开添加表单（键盘路径 = 画布中位浮出，菜单路径 = 菜单位置浮出） */
  openForm?: (kind: KeyFormKind) => void
  /** preventDefault 的时机由 applyPlan 定义：plan 确定要处理（非 null）即调用一次 */
  preventDefault?: () => void
}

/**
 * plan 的唯一执行器（architecture-deepening-2 工单 02）：preventDefault 时机、
 * 依次提交意图（第一个失败即中止）、更新选中、进入内联编辑、清空选中、打开表单——
 * 这些编排放策略只在这一处定义。返回 false = 某个意图被拒绝（中止且未完成）。
 */
export function applyPlan(plan: KeyPlan, exec: PlanExecutor): boolean {
  exec.preventDefault?.()
  if (plan.form !== undefined) {
    exec.openForm?.(plan.form)
    return true
  }
  // 多意图 plan 优先走原子提交：添加节点 = 加节点 + 加边是同一个用户动作，
  // 撤销栈里不应出现「有节点无边」的中间态（browser-findings 2026-10-02 #1）
  if (plan.intents.length > 1 && exec.commitIntents !== undefined) {
    if (!exec.commitIntents(plan.intents)) return false
  } else {
    for (const intent of plan.intents) {
      if (!exec.commitIntent(intent)) return false
    }
  }
  if (plan.newElementTarget !== undefined) {
    exec.select(plan.newElementTarget.selection)
    if (plan.newElementTarget.inlineEdit !== undefined) exec.beginInlineEdit?.(plan.newElementTarget.inlineEdit)
  } else if (plan.clearSelection === true) {
    exec.select(null)
  }
  return true
}
