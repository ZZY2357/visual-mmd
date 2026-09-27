/**
 * 防抖工具：自动保存与输入会话合并共用。
 * 返回 [防抖后的函数, 取消函数, 立即冲刷函数]。
 */
export interface Debounced<F extends (...args: never[]) => void> {
  (...args: Parameters<F>): void
  cancel(): void
  flush(): void
}

export function debounce<F extends (...args: never[]) => void>(
  fn: F,
  waitMs: number,
): Debounced<F> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<F> | null = null

  const debounced = (...args: Parameters<F>): void => {
    lastArgs = args
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const argsToCall = lastArgs
      lastArgs = null
      if (argsToCall !== null) fn(...argsToCall)
    }, waitMs)
  }

  debounced.cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    lastArgs = null
  }

  debounced.flush = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    const argsToCall = lastArgs
    lastArgs = null
    if (argsToCall !== null) fn(...argsToCall)
  }

  return debounced
}
