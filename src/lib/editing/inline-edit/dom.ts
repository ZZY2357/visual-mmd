import { selectionFromEventTarget, type CanvasSelection, type DataIdResolver } from '../../canvas-selection/data-id'

/**
 * 内联编辑的通用 DOM 勘察助手（工单 07 从 inline-edit.ts 迁出）：与图种知识无关、
 * 被多个图种的 targetFromEvent 共用的「沿 DOM 找身份」纯函数。图种特有的匹配范式
 * （mindmap / radar 文本匹配、class 类名命中）在各 `<id>.ts` 就近维护。
 */

/** 从双击目标解析 data-id 命中的 node 选择（flowchart 等有稳定 id 的图种）。
 * 返回 flowchart 形目标（nodeId 即 data-id 原文），由各图种 spec 按图种改写 kind */
export function targetFromDataId(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
): { kind: 'flowchart'; nodeId: string } | null {
  const selection: CanvasSelection | null = selectionFromEventTarget(target, resolver)
  if (selection !== null && selection.kind === 'node') {
    return { kind: 'flowchart', nodeId: selection.id }
  }
  return null
}

/**
 * 沿 DOM 向上找最近的 data-id 属性值（gantt 双击用，more-diagrams 工单 11）：
 * resolver 命中给出的是 elementId（`task:N`），而浮层定位要在 DOM 里找元素——
 * 那里的身份是 mermaid 渲染 id（data-id 原文，即 taskId）。两种身份在同一元素上，
 * 双击时一次取齐。找不到（点空白处）返回 null。
 */
export function closestDataId(target: EventTarget | null): string | null {
  if (target === null || !(target instanceof Element)) return null
  let el: Element | null = target
  while (el !== null) {
    const dataId = el.getAttribute('data-id')
    if (dataId !== null && dataId !== '') return dataId
    el = el.parentElement
  }
  return null
}
