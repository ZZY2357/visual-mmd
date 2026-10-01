import mermaid from 'mermaid'

/**
 * zenuml 外部渲染器注册（more-diagrams 工单 19）。
 *
 * zenuml 与其它图种不同：它不在 mermaid 内核里，需要经 `mermaid.registerExternalDiagrams`
 * 注册 `@mermaid-js/mermaid-zenuml` 插件才能识别与渲染（research §10：接入成本最高）。
 * 注册是**异步**的（`registerExternalDiagrams` 返回 Promise，插件内部懒加载
 * `@zenuml/core`）——因此渲染管线必须在渲染 zenuml 前 **await 注册完成**，否则
 * `mermaid.render` 会以「未知图种」失败（白屏）。
 *
 * 本模块把注册收敛成一个**模块级一次性 ready promise**：
 * - 首次调用 `ensureZenumlRegistered()` 触发注册（`lazyLoad: false`，注册当次即加载
 *   图种定义，避免 mermaid 内部再异步等待）；
 * - 成功 → resolve；失败 → reject（缓存失败态，不重复重试，避免每次渲染都卡在加载）。
 * 调用方（`use-mermaid-preview`）在渲染 zenuml 前 await 它：pending 态显示「注册中」、
 * reject 态显示降级提示，都**不白屏**。
 *
 * 只对 zenuml 源码触发注册（懒加载）：其它图种的渲染路径完全不触碰本模块，
 * 37M 的 zenuml 插件不会拖慢日常启动。
 */

/** 注册状态（供渲染管线区分「注册中 / 已就绪 / 失败」三态） */
let zenumlReadyPromise: Promise<void> | null = null

/**
 * 确保 zenuml 外部图种已注册（幂等）。返回的 Promise：
 * - resolve = 可安全渲染 zenuml；
 * - reject = 注册失败（下游转降级提示，不白屏）。
 * 首次调用即开始注册并缓存 promise；失败态也被缓存（不无限重试）。
 */
export function ensureZenumlRegistered(): Promise<void> {
  if (zenumlReadyPromise !== null) return zenumlReadyPromise
  zenumlReadyPromise = (async () => {
    const mod = await import('@mermaid-js/mermaid-zenuml')
    // 插件默认导出即 ExternalDiagramDefinition（detector.d.ts）；`lazyLoad: false`
    // 让注册当次就加载图种定义，之后 mermaid.render 同步可用
    const plugin = (mod as { default: unknown }).default ?? mod
    await mermaid.registerExternalDiagrams([plugin as never], { lazyLoad: false })
  })()
  return zenumlReadyPromise
}

/** 源码是否声明了 zenuml（表头首非空行恰为 `zenuml`；与 registry 探测器同口径） */
export function isZenumlSource(source: string): boolean {
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    return /^zenuml[ \t\r]*$/.test(line)
  }
  return false
}
