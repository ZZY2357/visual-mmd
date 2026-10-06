import { Window } from 'happy-dom'

/**
 * Vitest 全局 setup：修 Node >= 22 的**实验性全局 `localStorage`** 遮蔽 happy-dom 存储。
 *
 * 症状：`typeof localStorage === 'undefined'`（连 `window.localStorage` 也是），而
 * happy-dom 本该提供它。原因：Node 22+ 在全局定义了一个 `localStorage` 访问器
 * （未传 `--localstorage-file` 时求值为 `undefined`），vitest 把 happy-dom window 的
 * 属性往 `globalThis` 上搬时**跳过已存在的键**，于是 happy-dom 那份可用的存储被
 * 永久遮蔽。
 *
 * 影响：任何在模块顶层读**裸全局** `localStorage` 的依赖都会炸。当前唯一受害者是
 * `@mermaid-js/mermaid-zenuml`（`@zenuml/core/src/store/utils.ts` 顶层
 * `localStorage.getItem`），使 zenuml 注册在测试环境恒失败
 * （`Failed to load 1 external diagrams`）——生产浏览器里没有这个问题。
 *
 * 修法：全局缺失时，用 happy-dom 的存储补上（`new Window()` 的实例仍能拿到，
 * 只是没被搬到 globalThis）；拿不到时退回一个最小内存实现。
 */
if (typeof globalThis.localStorage === 'undefined') {
  const storage = (() => {
    try {
      return new Window({ url: 'http://localhost/' }).localStorage
    } catch {
      const map = new Map<string, string>()
      return {
        get length() {
          return map.size
        },
        clear: () => map.clear(),
        getItem: (k: string) => map.get(k) ?? null,
        key: (i: number) => [...map.keys()][i] ?? null,
        removeItem: (k: string) => void map.delete(k),
        setItem: (k: string, v: string) => void map.set(k, String(v)),
      } satisfies Storage
    }
  })()

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
}

export {}
