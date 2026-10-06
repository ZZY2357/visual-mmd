/**
 * 跟随行为的程序化更新守卫（self-grill-hardening 工单 16）。
 *
 * 双向跟随的反馈循环风险：选中元素 → 代码面板滚动/回写 → 编辑器派发事务 →
 * 「光标活动 → 画布提示」方向又跑一遍 → …。本守卫把「由跟随逻辑自己发起的事务」
 * 显式标记出来，光标→画布方向据此忽略之——循环在源头被切断，而不是靠阈值掩盖。
 *
 * 计数器而非布尔：`runProgrammatic` 可嵌套（reveal 中又触发一次程序化回写），
 * 内层结束时不应提前解除外层的标记。
 *
 * 纯对象、无 DOM、无 React，独立可测。
 */
export interface FollowGuard {
  /** 在程序化更新期间为 true；光标→画布方向必须跳过 */
  isProgrammatic(): boolean
  /** 标记一段程序化更新；无论 fn 是否抛错都保证退出时解除 */
  runProgrammatic<T>(fn: () => T): T
}

export function createFollowGuard(): FollowGuard {
  let depth = 0
  return {
    isProgrammatic: () => depth > 0,
    runProgrammatic: <T,>(fn: () => T): T => {
      depth++
      try {
        return fn()
      } finally {
        depth--
      }
    },
  }
}

/**
 * 共享守卫实例：代码面板的两个方向（选中→滚动回写、光标→画布提示）必须看到
 * 同一个标记，故默认用同一份。测试可自建独立实例验证语义。
 */
export const followGuard: FollowGuard = createFollowGuard()
