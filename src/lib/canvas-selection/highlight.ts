/**
 * 画布选中高亮（工单 05）：对渲染 SVG 中 data-id 匹配的元素打标记属性，
 * 实际视觉效果由 index.css 的 `[data-vm-selected]` 规则提供（filter 光晕，
 * 不与 mermaid 自身的描边样式冲突，也不污染主题）。
 *
 * 纯 DOM 操作，不做任何 React / store 依赖，方便单测与图种复用。
 */

const HIGHLIGHT_ATTR = 'data-vm-selected'
/** 光标跟随提示标记（工单 16）：与选中高亮分离，视觉更轻（见 index.css） */
const HINT_ATTR = 'data-vm-hinted'

/** 参与 data-id 匹配的候选元素（`[data-id]` 或带 DOM id 的元素） */
export const DATA_ID_CANDIDATE_SELECTOR = '[data-id], [id]'

/**
 * data-id 匹配谓词（工单 14 抽出共享）：`data-id` 相等、DOM id 相等、或 DOM id 以 `-{dataId}` 结尾。
 *
 * 工单 06/08 的由来：data-id 之外也匹配 DOM id——mermaid mindmap 节点无 data-id，
 * 只有含 `node_N` 的 DOM id；mermaid v12 的 id 带 svgId 前缀（`{svgId}-node_N`），
 * 故相等与"按 `-` 后缀"两种方式都比较（后缀以 `-node_N` 结尾，不会误标其它元素）。
 *
 * **必须只有这一份实现**：高亮（本模块）与方位导航的位置测量
 * （`editing/canvas-measure.ts`）共用它，才能保证「高亮标出的元素」与
 * 「参与导航的可视范围」永远是同一集合（工单 14 §4 的硬要求）。
 */
export function matchesDataId(el: Element, dataId: string): boolean {
  const id = el.getAttribute('id')
  return (
    el.getAttribute('data-id') === dataId ||
    id === dataId ||
    (dataId !== '' && id !== null && id.endsWith(`-${dataId}`))
  )
}

function findMarked(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(`[${HIGHLIGHT_ATTR}]`))
}

/**
 * 高亮 data-id 等于给定值的全部元素（flowchart 节点是一个 <g>）。
 * 同一容器内先清除旧标记（重复调用安全）。元素不存在时静默无事发生。
 */
export function applyHighlight(root: ParentNode, dataId: string): void {
  clearHighlight(root)
  for (const el of Array.from(root.querySelectorAll(DATA_ID_CANDIDATE_SELECTOR))) {
    if (matchesDataId(el, dataId)) el.setAttribute(HIGHLIGHT_ATTR, 'true')
  }
}

/** 清除容器内全部高亮标记 */
export function clearHighlight(root: ParentNode): void {
  for (const el of findMarked(root)) {
    el.removeAttribute(HIGHLIGHT_ATTR)
  }
}

/**
 * 轻量提示 data-id 匹配的元素（工单 16，光标→画布方向）：
 * 与选中高亮同款匹配、独立标记属性——不抢选中（不改 store.selection）、不弹层。
 * 先清除旧提示（同一容器同时至多一个提示）。元素不存在时静默无事发生。
 */
export function applyHint(root: ParentNode, dataId: string): void {
  clearHint(root)
  for (const el of Array.from(root.querySelectorAll(DATA_ID_CANDIDATE_SELECTOR))) {
    if (matchesDataId(el, dataId)) el.setAttribute(HINT_ATTR, 'true')
  }
}

/** 清除容器内全部提示标记 */
export function clearHint(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll(`[${HINT_ATTR}]`))) {
    el.removeAttribute(HINT_ATTR)
  }
}
