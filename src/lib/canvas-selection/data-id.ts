/**
 * 画布选中：data-id 匹配（工单 05，ADR-0007）
 *
 * mermaid 渲染的 SVG 在节点 <g>（部分图种含边 <path> / 参与者）上带有
 * `data-id` 属性（事实约定，未文档化、无稳定性承诺）。本模块把它抽象成
 * **图种无关**的通用选中能力：
 *
 * - `DataIdResolver`：data-id 值 → 选中描述（或 null = 无法匹配）。
 *   每种图种由自己的投影/适配器提供 resolver；新图种接入画布选中只需
 *   实现一个 resolver，无需改动画布组件与高亮逻辑。
 * - 无法匹配的 data-id 不报错、不崩溃：点击事件安静地不产生选中
 *   （画布侧退化为仅结构树可选中，工单验收项）。
 */

export interface CanvasNodeSelection {
  kind: 'node'
  /** 图种内的元素 id（flowchart 节点 id、sequence 参与者名……） */
  id: string
}

export interface CanvasEdgeSelection {
  kind: 'edge'
  from: string
  to: string
  /** 同一对节点的第几条连线（1 起） */
  occurrence: number
}

export type CanvasSelection = CanvasNodeSelection | CanvasEdgeSelection

/** data-id 值 → 选中描述；返回 null 表示该 data-id 无法匹配 */
export type DataIdResolver = (dataId: string) => CanvasSelection | null

/**
 * 节点 resolver：data-id 精确等于某个已知节点 id 时命中。
 * mermaid 各图种的节点 data-id 即源码中的节点 id（ADR-0007），
 * 因此该 resolver 对所有"节点有稳定 id"的图种通用。
 */
export function nodeDataIdResolver(ids: Iterable<string>): DataIdResolver {
  const known = new Set(ids)
  return (dataId) => (known.has(dataId) ? { kind: 'node', id: dataId } : null)
}

/**
 * 边 resolver（mermaid flowchart 边的 data-id 为 `L_{from}_{to}_{counter}`，
 * counter 0 起；节点 id 可含 `_`/`-`，格式有歧义）——**尽力而为**（ADR-0007：
 * 边没有稳定的选中映射承诺，结构树才是边的主入口）。
 *
 * 匹配策略：对 counter 的全部切分位置枚举 (from, to) 候选，命中已知边才返回。
 * 只与投影中实际存在的边匹配，绝不会凭空造出选中。
 */
export function edgeDataIdResolver(
  edges: Iterable<{ from: string; to: string; occurrence: number }>,
): DataIdResolver {
  const known = new Set(
    Array.from(edges, (e) => `${e.from}->${e.to}#${e.occurrence}`),
  )
  return (dataId) => {
    const m = /^L[-_](.+)[-_](\d+)$/.exec(dataId)
    if (m === null) return null
    const body = m[1]
    // counter（末段）+1 为 1 起的 occurrence；mermaid 平行边 counter 有跳号，
    // 两者都试，以已知边集合为准
    const occurrenceCandidates = [Number(m[2]) + 1, Number(m[2])]
    for (let i = 1; i < body.length; i++) {
      const from = body.slice(0, i)
      const to = body.slice(i + 1)
      if (from === '' || to === '') continue
      for (const occurrence of occurrenceCandidates) {
        if (known.has(`${from}->${to}#${occurrence}`)) {
          return { kind: 'edge', from, to, occurrence }
        }
      }
    }
    return null
  }
}

/**
 * 从点击目标解析选中：沿 DOM 向上找最近的带 data-id 的元素，交给 resolver。
 * 目标不是 Element、找不到 data-id、或 data-id 无法匹配 → 返回 null
 * （不选中、不崩溃——验收项：data-id 无法匹配的元素退化为仅结构树可选中）。
 */
export function selectionFromEventTarget(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
): CanvasSelection | null {
  if (resolver === null) return null
  if (target === null || !(target instanceof Element)) return null
  let el: Element | null = target
  while (el !== null) {
    const dataId = el.getAttribute('data-id')
    if (dataId !== null) {
      const selection = resolver(dataId)
      if (selection !== null) return selection
    }
    el = el.parentElement
  }
  return null
}
