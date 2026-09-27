import type { EditIntent } from '../pipeline/parser'
import { isValidMindmapNodeText } from '../pipeline/mindmap'
import type { ProjectionMindmapNode } from '../projection/mindmap-projection'
import { selectionFromEventTarget, type CanvasSelection, type DataIdResolver } from '../canvas-selection/data-id'

/**
 * 内联编辑（工单 05）：双击节点 / 新建节点后，在画布原位浮出输入框编辑显示文本。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦：
 * - 双击目标 → 编辑对象（flowchart 用 data-id 精确匹配；mindmap 无 data-id，
 *   按可见文本对投影节点尽力匹配——mermaid 未给 mindmap 节点稳定 id 的事实约定）
 * - 输入值 → 编辑意图（未改动/清空不落码，mindmap 文本非法时报无效）
 * - 节点包围盒（屏幕坐标）→ 相对画布容器的浮层定位（视图变换已反映在
 *   getBoundingClientRect 里，这里是最后一层纯几何换算，便于单测）
 */
export type InlineEditTarget =
  | { kind: 'flowchart'; nodeId: string }
  | { kind: 'mindmap'; elementId: string }

export type InlineEditCommit =
  | { action: 'commit'; intent: EditIntent }
  /** 文本未变化或为空白：关闭输入框且不落码（新建节点保留默认名） */
  | { action: 'unchanged' }
  /** mindmap 文本非法（空文本）；flowchart 文本恒合法 */
  | { action: 'invalid' }

/** 从双击目标解析编辑对象：优先 data-id（flowchart 等有稳定 id 的图种） */
function targetFromDataId(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
): InlineEditTarget | null {
  const selection: CanvasSelection | null = selectionFromEventTarget(target, resolver)
  if (selection !== null && selection.kind === 'node') {
    return { kind: 'flowchart', nodeId: selection.id }
  }
  return null
}

/** mindmap：沿 DOM 向上找最近一个「可见文本 = 某投影节点文本」的祖先元素。
 * 取的是双击点周围的实际标签文本；同名节点匹配最先出现的那个（尽力而为）。 */
function targetFromMindmapText(target: EventTarget | null, nodes: ProjectionMindmapNode[]): InlineEditTarget | null {
  if (target === null || !(target instanceof Element)) return null
  const byText = new Map<string, string>() // 文本 → elementId（首个同名生效）
  for (const n of nodes) {
    if (!byText.has(n.text)) byText.set(n.text, n.elementId)
  }
  let el: Element | null = target
  while (el !== null) {
    const text = el.textContent?.trim() ?? ''
    const elementId = byText.get(text)
    if (elementId !== undefined) return { kind: 'mindmap', elementId }
    el = el.parentElement
  }
  return null
}

/**
 * 双击目标 → 编辑对象；两边都匹配不上时返回 null（如点在空白处/边上），
 * 安静地不进入编辑，不崩溃。
 */
export function inlineEditTargetFromEvent(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
  mindmapNodes: ProjectionMindmapNode[] = [],
): InlineEditTarget | null {
  return (
    targetFromDataId(target, resolver) ??
    targetFromMindmapText(target, mindmapNodes)
  )
}

/**
 * 输入值 → 提交动作：去首尾空白后与当前文本相同或为空 → unchanged（不落码）；
 * flowchart 用 set-node-text（nodeId 寻址），mindmap 用 set-node-text（elementId 寻址）。
 */
export function inlineEditCommitOf(target: InlineEditTarget, text: string, currentText: string): InlineEditCommit {
  const next = text.trim()
  if (next === '' || next === currentText.trim()) return { action: 'unchanged' }
  if (target.kind === 'flowchart') {
    return { action: 'commit', intent: { type: 'set-node-text', nodeId: target.nodeId, text: next } }
  }
  if (!isValidMindmapNodeText(next)) return { action: 'invalid' }
  return { action: 'commit', intent: { type: 'set-node-text', elementId: target.elementId, text: next } }
}

// ---------- 浮层定位 ----------

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 节点包围盒（相对页面/容器同一原点的屏幕坐标）→ 相对画布容器的浮层位置。
 * 浮层贴着节点整体（覆盖文本区域），随视图缩放/平移自动对准
 * ——节点的 getBoundingClientRect 已包含 CSS transform（工单 03 视图），此处只做减法。
 */
export function overlayRectInContainer(containerRect: Rect, nodeRect: Rect): Rect {
  return {
    left: nodeRect.left - containerRect.left,
    top: nodeRect.top - containerRect.top,
    width: nodeRect.width,
    height: nodeRect.height,
  }
}

/** DOMRect → 普通矩形（单测/纯换算用；DOMRect 可直接传入，字段同名） */
export function toRect(r: { left: number; top: number; width: number; height: number }): Rect {
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
