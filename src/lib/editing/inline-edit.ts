import type { EditIntent } from '../pipeline/parser'
import { isValidMindmapNodeText } from '../pipeline/mindmap'
import { isValidClassName } from '../pipeline/class'
import { isValidParticipantId } from '../pipeline/sequence'
import { isValidStateId } from '../pipeline/state'
import { isValidErName } from '../pipeline/er'
import { isValidKanbanText } from '../pipeline/kanban'
import { parseKanbanCardElementId, parseKanbanColumnElementId } from '../pipeline/element-id'
import { isValidRequirementFieldValue } from '../pipeline/requirement'
import { parseRequirementBlockElementId } from '../pipeline/element-id'
import { isValidBlockLabel } from '../pipeline/block'
import { parseBlockNodeElementId } from '../pipeline/element-id'
import { isValidGanttTaskName } from '../pipeline/gantt'
import { isValidRadarLabelText } from '../pipeline/radar'
import type { ProjectionMindmapNode } from '../projection/mindmap-projection'
import { selectionFromEventTarget, type CanvasSelection, type DataIdResolver } from '../canvas-selection/data-id'

/**
 * 内联编辑（工单 05/04/05）：双击节点 / 新建节点后，在画布原位浮出输入框编辑文本。
 *
 * 本模块是纯逻辑，与 DOM/React 解耦：
 * - 双击目标 → 编辑对象（flowchart/class/sequence 用 data-id 精确匹配；mindmap 无
 *   data-id，按可见文本对投影节点尽力匹配——mermaid 未给 mindmap 节点稳定 id 的
 *   事实约定）
 * - 输入值 → 编辑意图（未改动/清空不落码，mindmap 文本非法时报无效）
 * - 节点包围盒（屏幕坐标）→ 相对画布容器的浮层定位（视图变换已反映在
 *   getBoundingClientRect 里，这里是最后一层纯几何换算，便于单测）
 *
 * 四图种的双击都**只改显示文本**（spec 决策：宁可少做，也不让双击不可预测）：
 * flowchart / mindmap 改节点文本，class 改类名（rename-class），sequence 改 `as` 别名
 * （set-participant）。class 的成员正文、class 的关系标签、sequence 的消息文本与 actorId
 * **不做双击**——前两者在节点内部/线上（编辑路径是"点选 → 右侧表单"），actorId 是语法标识。
 *
 * 空白右键新建的 class / sequence 元素（工单 04）复用同一输入框：编辑的是**类名** /
 * **参与者 id**（不是 mindmap 的显示文本），落 rename-class / rename-participant。
 */
export type InlineEditTarget =
  | { kind: 'flowchart'; nodeId: string }
  | { kind: 'mindmap'; elementId: string }

/** 画布内联编辑目标（工单 04/05）：在键盘/双击目标（flowchart / mindmap）之上，
 * 增加 class / sequence：
 * - `class`：空白新建后命名、或双击类名 → rename-class（类名即显示文本，两条入口同目标）
 * - `sequence`：空白新建后命名 → rename-participant（改语法 id，不生成 alias）
 * - `sequence-alias`：双击既有参与者 → set-participant（改 `as` 显示别名；actorId 不变）
 * 后两者分开命名：actorId 是语法标识，本票不做双击改它（走属性面板既有字段）。 */
export type CanvasInlineEditTarget =
  | InlineEditTarget
  /** class 空白新建 / 双击类名：编辑类名（isValidClassName 接受中文） */
  | { kind: 'class'; name: string }
  /** sequence 空白新建：编辑参与者 id（不生成 alias） */
  | { kind: 'sequence'; actorId: string }
  /** sequence 双击既有参与者：编辑 `as` 显示别名（显示文本） */
  | { kind: 'sequence-alias'; actorId: string }
  /** state（more-diagrams 工单 02）：双击 / 键盘新建后编辑状态描述（`id : desc` 的 desc 段，
   * set-state-desc 意图；id 是语法标识，不在此改） */
  | { kind: 'state'; id: string }
  /** er（more-diagrams 工单 03）：双击实体改别名（set-alias 意图；实体名是语法标识，
   * 不在此改。属性不做双击——工单 03 明确） */
  | { kind: 'er'; name: string }
  /** kanban（more-diagrams 工单 06）：双击卡片改描述（set-description）；键盘 / 空白新建后命名同此 */
  | { kind: 'kanban-card'; elementId: string }
  /** kanban：双击列标题改标题（set-column-title）；键盘 / 空白新建后命名同此 */
  | { kind: 'kanban-column'; elementId: string }
  /** requirement（more-diagrams 工单 07）：双击 requirement 节点改 `text` 字段
   * （set-requirement-field 意图；名字是语法标识，不在此改。element 无双击编辑——
   * 工单 07 明确：element 的 type/docref 是元数据，展示与编辑都在右侧表单） */
  | { kind: 'requirement'; name: string }
  /** block（more-diagrams 工单 09）：双击块节点改标签（set-node-label 意图；id 是语法
   * 标识，不在此改。嵌套块无双击——组没有标签，宽度/列数在右侧属性表单改） */
  | { kind: 'block-node'; id: string }
  /** gantt（more-diagrams 工单 11）：双击任务条/任务文本改任务名（set-task-name）。
   * elementId 是位置序身份（`task:N`，提交寻址用）；taskId 是 mermaid 渲染 id
   * （画布 data-id，浮层定位用——DOM 上只有它，无法从位置序 elementId 反解） */
  | { kind: 'gantt-task'; elementId: string; taskId: string }
  /** radar（more-diagrams 工单 15）：双击轴标签改 label（set-axis-label）。
   * radar 渲染器无 data-id（全程只有 class），轴标签按 **class 文本匹配** 寻址
   * （`text.radarAxisLabel` 的可见文本 = 轴展示文本，与 mindmap 同范式）；
   * elementId 是位置序身份（`axis:N`）。曲线标签不做双击（多条曲线标签文本可重复，
   * 文本匹配不可消歧——曲线编辑入口 = 结构树 + 属性表单） */
  | { kind: 'radar-axis'; elementId: string }

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

/** class：双击是否落在**类名文本**上。沿 DOM 向上找最近的、可见文本恰等于类名的元素；
 * 类节点内部的成员正文（另一行文本）与类名不等，故不会进入改名——与 spec 决策
 * 「双击成员正文不做内联编辑」一致。双击类框本身（类无成员时其文本即类名）仍命中。 */
function classTitleClicked(target: EventTarget | null, name: string): boolean {
  if (!(target instanceof Element)) return false
  let el: Element | null = target
  while (el !== null) {
    if ((el.textContent?.trim() ?? '') === name) return true
    // 已到类节点本身（data-id = 类名）仍不是纯类名文本（说明是成员等）→ 不命中
    if (el.getAttribute('data-id') === name) return false
    el = el.parentElement
  }
  return false
}

/**
 * 沿 DOM 向上找最近的 data-id 属性值（gantt 双击用，more-diagrams 工单 11）：
 * resolver 命中给出的是 elementId（`task:N`），而浮层定位要在 DOM 里找元素——
 * 那里的身份是 mermaid 渲染 id（data-id 原文，即 taskId）。两种身份在同一元素上，
 * 双击时一次取齐。找不到（点空白处）返回 null。
 */
function closestDataId(target: EventTarget | null): string | null {
  if (target === null || !(target instanceof Element)) return null
  let el: Element | null = target
  while (el !== null) {
    const dataId = el.getAttribute('data-id')
    if (dataId !== null && dataId !== '') return dataId
    el = el.parentElement
  }
  return null
}

/** 参与双击寻址的图种（各图种都用 data-id；mindmap / radar 额外回落文本匹配） */
export type InlineEditDiagramKind =
  | 'flowchart'
  | 'mindmap'
  | 'class'
  | 'sequence'
  | 'state'
  | 'er'
  | 'kanban'
  | 'requirement'
  | 'block'
  | 'gantt'
  | 'radar'

/** radar 双击寻址的轴候选（文本 → elementId；由调用方从投影展开，展示文本 label ?? id） */
export interface RadarAxisCandidate {
  text: string
  elementId: string
}

/** radar：沿 DOM 向上找最近的「可见文本 = 某轴展示文本」的元素，且该元素（或祖先）
 * 带 `radarAxisLabel` class——渲染器的轴标签只有 class 可依（无 id / data-id）。
 * 同文本轴匹配最先出现的那个（尽力而为）。 */
function targetFromRadarAxisText(
  target: EventTarget | null,
  axes: RadarAxisCandidate[],
): CanvasInlineEditTarget | null {
  if (target === null || !(target instanceof Element)) return null
  const byText = new Map<string, string>() // 文本 → elementId（首个同名生效）
  for (const a of axes) {
    if (!byText.has(a.text)) byText.set(a.text, a.elementId)
  }
  let el: Element | null = target
  while (el !== null) {
    if (el.classList.contains('radarAxisLabel')) {
      const elementId = byText.get(el.textContent?.trim() ?? '')
      if (elementId !== undefined) return { kind: 'radar-axis', elementId }
      // 已到轴标签本体仍匹配不上（文本已改过 / 奇异转义）→ 不命中
      return null
    }
    el = el.parentElement
  }
  return null
}

/**
 * 双击目标 → 编辑对象；两边都匹配不上时返回 null（如点在空白处/边上），
 * 安静地不进入编辑，不崩溃。
 *
 * kind 指明图种（工单 05 起四图种齐备）：有 resolver 命中时按图种把 node 选择映射为
 * 对应编辑目标（class → 类名、sequence → 参与者别名）；mindmap 回落文本匹配，
 * radar 的轴标签按 class + 文本匹配（渲染器无 data-id，工单 15）。
 * resolver 命中 `element`（连线）时不进入编辑——class 关系标签 / sequence 消息文本不做双击。
 */
export function inlineEditTargetFromEvent(
  target: EventTarget | null,
  resolver: DataIdResolver | null,
  mindmapNodes: ProjectionMindmapNode[] = [],
  kind: InlineEditDiagramKind = 'flowchart',
  radarAxes: RadarAxisCandidate[] = [],
): CanvasInlineEditTarget | null {
  const byId = targetFromDataId(target, resolver)
  if (byId !== null) {
    if (kind === 'mindmap') return { kind: 'mindmap', elementId: byId.nodeId }
    // class 只在类名文本上改类名；sequence 改显示别名（不碰 actorId）
    if (kind === 'class') return classTitleClicked(target, byId.nodeId) ? { kind: 'class', name: byId.nodeId } : null
    if (kind === 'sequence') return { kind: 'sequence-alias', actorId: byId.nodeId }
    // state：双击状态节点 = 编辑描述（set-state-desc；无描述状态输入即新增描述行）
    if (kind === 'state') return isValidStateId(byId.nodeId) ? { kind: 'state', id: byId.nodeId } : null
    // er：双击实体 = 编辑别名（set-alias；实体名是语法标识，不在此改）
    if (kind === 'er') return isValidErName(byId.nodeId) ? { kind: 'er', name: byId.nodeId } : null
    // kanban：resolver 返回 elementId（`kanban-card:<id>` / `kanban-column:<id>`），按前缀判种类
    if (kind === 'kanban') {
      if (parseKanbanCardElementId(byId.nodeId) !== null) return { kind: 'kanban-card', elementId: byId.nodeId }
      if (parseKanbanColumnElementId(byId.nodeId) !== null) return { kind: 'kanban-column', elementId: byId.nodeId }
      return null
    }
    // requirement（more-diagrams 工单 07）：data-id = 名字（渲染后处理反注），但节点
    // elementId 带 `requirement:` / `requirement-element:` 前缀——只有 requirement 块
    // 可双击（改 text 字段）；element 双击安静忽略（工单 07 明确不做）
    if (kind === 'requirement') {
      const requirement = parseRequirementBlockElementId(byId.nodeId)
      return requirement !== null ? { kind: 'requirement', name: requirement.name } : null
    }
    // block（more-diagrams 工单 09）：resolver 返回 elementId（`block-node:<id>` /
    // `block-group:<gid>`）；只有块节点可双击（改标签），嵌套块双击安静忽略
    if (kind === 'block') {
      const node = parseBlockNodeElementId(byId.nodeId)
      return node !== null ? { kind: 'block-node', id: node.id } : null
    }
    // gantt（more-diagrams 工单 11）：双击任务条/任务文本 = 改任务名（set-task-name）。
    // resolver 把渲染 id（data-id）映射回位置序 elementId；taskId 取 DOM 上的 data-id
    // 原文（浮层定位用，见 closestDataId）
    if (kind === 'gantt') {
      const taskId = closestDataId(target)
      return taskId !== null ? { kind: 'gantt-task', elementId: byId.nodeId, taskId } : null
    }
    return byId
  }
  return kind === 'mindmap'
    ? targetFromMindmapText(target, mindmapNodes)
    : kind === 'radar'
      ? targetFromRadarAxisText(target, radarAxes)
      : null
}

/**
 * 输入值 → 提交动作：去首尾空白后与当前文本相同或为空 → unchanged（不落码）；
 * flowchart / mindmap 用 set-node-text；class 改类名（rename-class）；sequence 空白新建改
 * 参与者 id（rename-participant）；sequence 双击改显示别名（set-participant，actorId 不变）。
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
  if (target.kind === 'sequence-alias') {
    // 只改显示别名（set-participant）；清空视为未改动（去掉别名走属性面板，spec：只做改显示文本）
    return { action: 'commit', intent: { type: 'set-participant', actorId: target.actorId, alias: next } }
  }
  if (target.kind === 'state') {
    if (!isValidStateId(target.id)) return { action: 'invalid' }
    // 空白/未改动已被顶部守卫短路（unchanged）；到这里的非空改动 = set-state-desc
    return { action: 'commit', intent: { type: 'set-state-desc', id: target.id, desc: next } }
  }
  if (target.kind === 'er') {
    if (!isValidErName(target.name)) return { action: 'invalid' }
    // 空白/未改动已被顶部守卫短路（unchanged）；到这里的非空改动 = set-alias
    return { action: 'commit', intent: { type: 'set-alias', name: target.name, alias: next } }
  }
  if (target.kind === 'kanban-card') {
    if (!isValidKanbanText(next)) return { action: 'invalid' }
    return { action: 'commit', intent: { type: 'set-description', elementId: target.elementId, description: next } }
  }
  if (target.kind === 'kanban-column') {
    if (!isValidKanbanText(next)) return { action: 'invalid' }
    return { action: 'commit', intent: { type: 'set-column-title', elementId: target.elementId, title: next } }
  }
  if (target.kind === 'requirement') {
    // requirement（more-diagrams 工单 07）：非空改动 = set text 字段（值含引号/换行非法；
    // 清空字段 = 删字段行，走属性表单而非双击——顶部守卫已把清空按 unchanged 关闭）
    if (!isValidRequirementFieldValue(next)) return { action: 'invalid' }
    return {
      action: 'commit',
      intent: { type: 'set-requirement-field', requirement: target.name, field: 'text', value: next },
    }
  }
  if (target.kind === 'block-node') {
    // block（more-diagrams 工单 09）：非空改动 = set-node-label（标签含引号/方括号/换行
    // 非法；清空 = 去掉标签变裸形状，走属性表单而非双击——顶部守卫已按 unchanged 关闭）
    if (!isValidBlockLabel(next)) return { action: 'invalid' }
    return { action: 'commit', intent: { type: 'set-node-label', id: target.id, label: next } }
  }
  if (target.kind === 'gantt-task') {
    // gantt（more-diagrams 工单 11）：非空改动 = set-task-name（任务名含 `:` `;` `#`
    // 换行非法；elementId 位置序寻址，taskId 只用于浮层定位）
    if (!isValidGanttTaskName(next)) return { action: 'invalid' }
    return { action: 'commit', intent: { type: 'set-task-name', elementId: target.elementId, name: next } }
  }
  if (target.kind === 'radar-axis') {
    // radar（more-diagrams 工单 15）：非空改动 = set-axis-label（label 转义统一由管线
    // 落码；清空 = 移除 label 回退 id 展示——顶部守卫已把清空按 unchanged 关闭，所以
    // 这里到不了空串；无 label 轴双击预填 id，改完即创建 label）
    if (!isValidRadarLabelText(next)) return { action: 'invalid' }
    return { action: 'commit', intent: { type: 'set-axis-label', elementId: target.elementId, label: next } }
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
