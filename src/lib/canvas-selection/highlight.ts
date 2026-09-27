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
  const all = Array.from(root.querySelectorAll('[data-id]'))
  for (const el of all) {
    if (el.getAttribute('data-id') === dataId) {
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
