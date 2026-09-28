import type { EditIntent } from '../pipeline/parser'
import { isValidMindmapNodeText } from '../pipeline/mindmap'
import { isValidClassName } from '../pipeline/class'
import { isValidParticipantId } from '../pipeline/sequence'
import type { ProjectionMindmapNode } from '../projection/mindmap-projection'
import { selectionFromEventTarget, type CanvasSelection, type DataIdResolver } from '../canvas-selection/data-id'

/**
 * 内联编辑（工单 05/04）：双击节点 / 新建节点后，在画布原位浮出输入框编辑文本。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦：
 * - 双击目标 → 编辑对象（flowchart/class/sequence 用 data-id 精确匹配；mindmap 无
 *   data-id，按可见文本对投影节点尽力匹配——mermaid 未给 mindmap 节点稳定 id 的
 *   事实约定）
 * - 输入值 → 编辑意图（未改动/清空不落码，mindmap 文本非法时报无效）
 * - 节点包围盒（屏幕坐标）→ 相对画布容器的浮层定位（视图变换已反映在
 *   getBoundingClientRect 里，这里是最后一层纯几何换算，便于单测）
 *
 * 空白右键新建的 class / sequence 元素（工单 04）复用同一输入框：编辑的是**类名** /
 * **参与者 id**（不是 mindmap 的显示文本），落 rename-class / rename-participant。
 */
export type InlineEditTarget =
  | { kind: 'flowchart'; nodeId: string }
  | { kind: 'mindmap'; elementId: string }

/** 画布内联编辑目标（工单 04 扩展）：在键盘/双击目标（flowchart / mindmap）之上，
 * 增加空白右键新建的 class / sequence —— 这两者的落码分别是 rename-class /
 * rename-participant，与「改显示文本」不同，故与 InlineEditTarget 分开命名，
 * 免得扩大画布键盘（工单 03/06）的契约。 */
export type CanvasInlineEditTarget =
  | InlineEditTarget
  /** class 空白新建：编辑类名（isValidClassName 接受中文） */
  | { kind: 'class'; name: string }
  /** sequence 空白新建：编辑参与者 id（不生成 alias） */
  | { kind: 'sequence'; actorId: string }

export type InlineEditCommit =
  | { action: 'commit'; intent: EditIntent }
  /** 文本未变化或为空白：关闭输入框且不落码（新建节点保留默认名） */
  | { action: 'unchanged' }
  /** 文本非法（mindmap 空文本 / class 非法类名 / sequence 非法参与者 id） */
  | { action: 'invalid' }

/** 从双击目标解析编辑对象：优先 data-id（flowchart 等有稳定 id 的图种）。
 * 返回 flowchart 形目标，由 inlineEditTargetFromEvent 按图种改写 kind */
function targetFromDataId(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
): { kind: 'flowchart'; nodeId: string } | null {
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
 *
 * kind 指明图种（工单 06）：有 resolver 命中时按图种把 node 选择映射为对应编辑
 * 目标（mindmap 的画布选中 id 即 elementId）；仅 mindmap 才回落文本匹配。
 */
export function inlineEditTargetFromEvent(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
  mindmapNodes: ProjectionMindmapNode[] = [],
  kind: 'flowchart' | 'mindmap' = 'flowchart',
): InlineEditTarget | null {
  const byId = targetFromDataId(target, resolver)
  if (byId !== null) {
    return kind === 'mindmap' ? { kind: 'mindmap', elementId: byId.nodeId } : byId
  }
  return kind === 'mindmap' ? targetFromMindmapText(target, mindmapNodes) : null
}

/**
 * 输入值 → 提交动作：去首尾空白后与当前文本相同或为空 → unchanged（不落码）；
 * flowchart 用 set-node-text（nodeId 寻址），mindmap 用 set-node-text（elementId 寻址），
 * class / sequence 分别改类名 / 参与者 id（工单 04 新建后立即命名）。
 */
export function inlineEditCommitOf(target: CanvasInlineEditTarget, text: string, currentText: string): InlineEditCommit {
  const next = text.trim()
  if (next === '' || next === currentText.trim()) return { action: 'unchanged' }
  if (target.kind === 'flowchart') {
    return { action: 'commit', intent: { type: 'set-node-text', nodeId: target.nodeId, text: next } }
  }
  if (target.kind === 'class') {
    if (!isValidClassName(next)) return { action: 'invalid' }
    return { action: 'commit', intent: { type: 'rename-class', name: target.name, newName: next } }
  }
  if (target.kind === 'sequence') {
    if (!isValidParticipantId(next)) return { action: 'invalid' }
    return { action: 'commit', intent: { type: 'rename-participant', actorId: target.actorId, newId: next } }
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
