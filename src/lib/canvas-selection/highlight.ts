/**
 * 画布选中高亮（工单 05）：对渲染 SVG 中 data-id 匹配的元素打标记属性，
 * 实际视觉效果由 index.css 的 `[data-vm-selected]` 规则提供（filter 光晕，
 * 不与 mermaid 自身的描边样式冲突，也不污染主题）。
 *
 * 纯 DOM 操作，不做任何 React / store 依赖，方便单测与图种复用。
 */

const HIGHLIGHT_ATTR = 'data-vm-selected'

function findMarked(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(`[${HIGHLIGHT_ATTR}]`))
}

/**
 * 高亮 data-id 等于给定值的全部元素（flowchart 节点是一个 <g>）。
 * 同一容器内先清除旧标记（重复调用安全）。元素不存在时静默无事发生。
 */
export function applyHighlight(root: ParentNode, dataId: string): void {
  clearHighlight(root)
  // 工单 06/08：data-id 之外也匹配 DOM id——mermaid mindmap 节点无 data-id，
  // 只有含 `node_N` 的 DOM id；mermaid v12 的 id 带 svgId 前缀（`{svgId}-node_N`），
  // 故相等与"按 `-` 后缀"两种方式都比较（后缀以 `-node_N` 结尾，不会误标其它元素）。
  const all = Array.from(root.querySelectorAll('[data-id], [id]'))
  for (const el of all) {
    const id = el.getAttribute('id')
    if (
      el.getAttribute('data-id') === dataId ||
      id === dataId ||
      (dataId !== '' && id !== null && id.endsWith(`-${dataId}`))
    ) {
      el.setAttribute(HIGHLIGHT_ATTR, 'true')
    }
  }
}

/** 清除容器内全部高亮标记 */
export function clearHighlight(root: ParentNode): void {
  for (const el of findMarked(root)) {
    el.removeAttribute(HIGHLIGHT_ATTR)
  }
}
