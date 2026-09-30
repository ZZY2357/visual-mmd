import type { DiagramTypeId } from '../diagram-registry'
import type { Selection } from '../projection/selection'
import type { CanvasSelection } from './data-id'
import { toEditorSelection } from './flowchart-adapter'
import { edgeSelectionOf } from './edge-adapter'
import { mindmapDomIdOf } from './mindmap-adapter'
import { parseKanbanCardElementId, parseKanbanColumnElementId } from '../pipeline/element-id'
import { requirementSelectionOf } from './requirement-adapter'
import {
  parseRequirementBlockElementId,
  parseRequirementElemBlockElementId,
} from '../pipeline/element-id'
import type { ContextMenuTarget } from '../editing/context-menu'

/**
 * 选中的互逆映射收敛（工单 03）：Selection ↔ 画布 data-id ↔ ContextMenuTarget。
 *
 * 这三件事原先散成五份手写映射（CanvasPanel 的 `canvasToEditorSelection` /
 * `selectedDataIdOf`、`selectTarget` 的 9 分支、`contextMenuTargetFromSelection`、
 * `navigation.toSelection` 的组合），互为逆向却各写一遍——穷尽性靠人眼维护，
 * 任何一处漏一个 kind 的症状是「右键选中了但属性面板空白」：不抛错、不报红，静默。
 * 本模块把互为逆向的两对收进同一处：正解反解成对提供，改协议只改一个文件。
 *
 * 穷尽性的做法（已定案）：**不做类型层 `assertNever`**。画布本来就只可寻址一部分
 * kind（`diagram` / `subgraph` / `classdef` / `class-member` / `class-note` /
 * `seq-region` / `class-namespace` 无 data-id；flowchart 的 `edge` 走 mermaid
 * `L_{from}_{to}_{n}` 尽力匹配，不进高亮 data-id 链路），`default: return null`
 * 是有意的。改用「显式可寻址表 + 遍历全部 16 个 kind 的测试」
 * （`__tests__/selection-codec.test.ts` 的 `ADDRESSABLE` 表）——新增 kind 时测试
 * 逼你回答「它可寻址吗」，漏答是测试失败而不是线上静默。
 *
 * 形状沿用 `edge-identity.ts`（ADR-0012 已验证的 codec 样板）：纯函数、无 DOM、无
 * React；映射不出就返回 null，绝不凭空造出身份。依赖 01：`mindmapDomIdOf` 这类
 * 形态转换走 `pipeline/element-id.ts` 的 codec，本模块不自己拼串。
 *
 * 注意（工单 03 Decision）：`resolve*Selection`（「选中的图元在投影里还存在吗」）
 * **不在此处**——它属投影自己的事，四份各自 switch 的 kind 互不重叠，归工单 04
 * 的 `CanvasCapabilities.resolveSelection`。`projection/selection.ts` 的
 * `selectionKey` 是另一套命名空间（sameSelection 相等性比较用），也不在此处。
 */

/**
 * Selection → 画布 data-id（高亮用）。
 * 画布上不可寻址的 kind（diagram / subgraph / classdef / class-member / class-note /
 * seq-region / class-namespace，以及 flowchart 的 edge）返回 null——安静地不高亮。
 */
export function canvasIdOf(selection: Selection): string | null {
  switch (selection.kind) {
    case 'node':
      return selection.nodeId
    case 'participant':
      return selection.actorId
    case 'class':
      return selection.name
    // 位置序连线（工单 02）：elementId 即渲染后标注的 data-id。class 的成员/注释
    // 未纳入寻址，画布上没有对应 data-id，返回后安静地不高亮。
    case 'class-relation':
    case 'message':
    case 'note':
    case 'block':
      return selection.elementId
    case 'mindmap-node':
      // mindmap 无 data-id：高亮按节点 DOM id（node_{N-1}）匹配（highlight 已支持）
      return mindmapDomIdOf(selection.elementId)
    // state（more-diagrams 工单 02）：状态 data-id 即状态 id（渲染后从 DOM id 反注），
    // 转移走位置序身份 `transition:N`；note 块未纳入画布寻址，安静地不高亮。
    case 'state':
      return selection.id
    case 'state-transition':
      return selection.elementId
    // er（more-diagrams 工单 03）：实体 data-id 即实体名（渲染后从 DOM id `entity-{名}-{n}`
    // 反注）；关系走位置序身份 `relation:N`。属性未纳入画布寻址（属性行在实体框内部，
    // 无独立 DOM 元素），安静地不高亮——结构树与表单仍是完整编辑入口。
    case 'er-entity':
      return selection.name
    case 'er-relation':
      return selection.elementId
    // kanban（more-diagrams 工单 06）：列 / 卡片的 data-id 即节点 id（渲染后处理从
    // `.sections` / `.items` 内的 DOM id `${svgId}-${节点id}` 反注）。
    case 'kanban-column':
      return parseKanbanColumnElementId(selection.elementId)?.id ?? null
    case 'kanban-card':
      return parseKanbanCardElementId(selection.elementId)?.id ?? null
    // requirement（more-diagrams 工单 07）：两类节点 data-id 都是名字；关系走位置序
    case 'requirement':
    case 'requirement-element':
      return selection.name
    case 'requirement-relation':
      return selection.elementId
    default:
      return null
  }
}

/**
 * 画布 CanvasSelection + 图种 → Selection。
 * flowchart 走 `toEditorSelection`（节点按 ADR-0007、边按 `L_{from}_{to}_{n}` 尽力匹配），
 * 与其它三个图种不同——保留这个分支，不为统一而统一。
 * mindmap 画布选中只可能是节点（无连线）；canvas id 即 elementId（`mindmap-node:N`）。
 * 位置序连线（工单 02）：elementId 直接落成 class-relation / message / note / block。
 */
export function fromCanvasId(diagramType: DiagramTypeId, canvas: CanvasSelection): Selection | null {
  if (diagramType === 'flowchart') return toEditorSelection(canvas)
  if (diagramType === 'mindmap') {
    return canvas.kind === 'node' ? { kind: 'mindmap-node', elementId: canvas.id } : null
  }
  if (diagramType === 'state') {
    if (canvas.kind === 'element') return edgeSelectionOf(diagramType, canvas.elementId)
    return canvas.kind === 'node' ? { kind: 'state', id: canvas.id } : null
  }
  if (diagramType === 'er') {
    if (canvas.kind === 'element') return edgeSelectionOf(diagramType, canvas.elementId)
    return canvas.kind === 'node' ? { kind: 'er-entity', name: canvas.id } : null
  }
  if (diagramType === 'gitgraph') {
    // gitGraph（more-diagrams 工单 04）：画布 DOM 无 data-id（实测降级），画布选中不产生
    return null
  }
  if (diagramType === 'journey') {
    // journey（more-diagrams 工单 08）：画布 DOM 无 data-id（实测降级），画布选中不产生
    return null
  }
  if (diagramType === 'pie') {
    // pie（more-diagrams 工单 10）：画布 DOM 无 data-id（实测降级），画布选中不产生
    return null
  }
  if (diagramType === 'gantt') {
    // gantt（more-diagrams 工单 11）：任务条 data-id = mermaid 渲染 id（渲染后处理
    // 反注），resolver 已把它映射回位置序 elementId（`task:N`）——node.id 即 elementId
    if (canvas.kind !== 'node') return null
    return { kind: 'gantt-task', elementId: canvas.id }
  }
  if (diagramType === 'kanban') {
    // resolver 返回的 node.id 即 elementId（`kanban-card:<id>` / `kanban-column:<id>`），按前缀判种类
    if (canvas.kind !== 'node') return null
    if (parseKanbanColumnElementId(canvas.id) !== null) return { kind: 'kanban-column', elementId: canvas.id }
    if (parseKanbanCardElementId(canvas.id) !== null) return { kind: 'kanban-card', elementId: canvas.id }
    return null
  }
  if (diagramType === 'requirement') {
    // requirement（more-diagrams 工单 07）：节点 data-id 即**投影 elementId**
    // （`requirement:<名>` / `requirement-element:<名>`，由 resolver 反注），关系走位置序
    return requirementSelectionOf(canvas)
  }
  if (canvas.kind === 'element') return edgeSelectionOf(diagramType, canvas.elementId)
  if (canvas.kind === 'node') {
    return diagramType === 'sequence'
      ? { kind: 'participant', actorId: canvas.id }
      : { kind: 'class', name: canvas.id }
  }
  return null
}

/**
 * ContextMenuTarget → Selection（右键目标 → 属性面板联动）。
 * blank 目标什么都不选（既有语义：空白菜单不 select）返回 null；其余 9 个元素目标
 * 一一对应各自的 Selection kind。
 */
export function selectionOfMenuTarget(target: ContextMenuTarget): Selection | null {
  switch (target.kind) {
    case 'flowchart-node':
      return { kind: 'node', nodeId: target.nodeId }
    case 'flowchart-edge':
      return { kind: 'edge', from: target.from, to: target.to, occurrence: target.occurrence }
    case 'mindmap-node':
      return { kind: 'mindmap-node', elementId: target.elementId }
    case 'class-node':
      return { kind: 'class', name: target.name }
    case 'sequence-participant':
      return { kind: 'participant', actorId: target.actorId }
    case 'class-relation':
      return { kind: 'class-relation', elementId: target.elementId }
    case 'sequence-message':
      return { kind: 'message', elementId: target.elementId }
    case 'sequence-note':
      return { kind: 'note', elementId: target.elementId }
    case 'sequence-block':
      return { kind: 'block', elementId: target.elementId }
    case 'state-node':
      return { kind: 'state', id: target.id }
    case 'state-transition':
      return { kind: 'state-transition', elementId: target.elementId }
    case 'er-entity':
      return { kind: 'er-entity', name: target.name }
    case 'er-relation':
      return { kind: 'er-relation', elementId: target.elementId }
    case 'er-attribute':
      return { kind: 'er-attribute', elementId: target.elementId }
    case 'timeline-period':
      return { kind: 'timeline-period', elementId: target.elementId }
    case 'timeline-event':
      return { kind: 'timeline-event', elementId: target.elementId }
    // kanban（more-diagrams 工单 06）：列 / 卡片菜单目标一一对应各自 Selection kind。
    case 'kanban-column':
      return { kind: 'kanban-column', elementId: target.elementId }
    case 'kanban-card':
      return { kind: 'kanban-card', elementId: target.elementId }
    case 'requirement-node':
      return { kind: 'requirement', name: target.name }
    case 'requirement-element':
      return { kind: 'requirement-element', name: target.name }
    case 'requirement-relation':
      return { kind: 'requirement-relation', elementId: target.elementId }
    case 'blank':
      return null
  }
}

/**
 * CanvasSelection + 图种 → ContextMenuTarget：节点/连线按图种改写 kind（四种图种的
 * 节点都有菜单）；连线 flowchart 走 mermaid data-id，class / sequence 走**位置序身份**
 * （工单 02，经 edgeSelectionOf 收窄到本图种可寻址的种类）；空白处（canvas === null）
 * 一律返回 blank（图种随目标携带）；无法映射为菜单目标时返回 null——安静地不弹菜单，
 * 不崩溃。
 */
export function menuTargetOfCanvas(
  diagramType: DiagramTypeId,
  canvas: CanvasSelection | null,
): ContextMenuTarget | null {
  if (canvas === null) return { kind: 'blank', diagramType }
  if (canvas.kind === 'node') {
    if (diagramType === 'flowchart') return { kind: 'flowchart-node', nodeId: canvas.id }
    if (diagramType === 'mindmap') return { kind: 'mindmap-node', elementId: canvas.id }
    if (diagramType === 'class') return { kind: 'class-node', name: canvas.id }
    if (diagramType === 'state') {
      // composite 标志由调用方按投影补齐（menuTargetOfCanvas 不查投影，保持纯映射）
      return { kind: 'state-node', id: canvas.id }
    }
    if (diagramType === 'er') return { kind: 'er-entity', name: canvas.id }
    if (diagramType === 'gitgraph') return null // 无 data-id（实测降级），画布节点不可命中
    if (diagramType === 'journey') return null // 无 data-id（实测降级），画布节点不可命中
    if (diagramType === 'pie') return null // 无 data-id（实测降级），画布节点不可命中
    if (diagramType === 'gantt') {
      // gantt（more-diagrams 工单 11）：任务条虽可寻址，但元素级菜单不做（与 journey/pie
      // 同口径），编辑由结构树选中 + 属性表单承接——画布节点不产生菜单目标
      return null
    }
    if (diagramType === 'kanban') {
      // 列 / 卡片都渲染成 `g.node` / `g.cluster`，反注后的 canvas.id 带 elementId 前缀，
      // 按前缀还原菜单目标种类；前缀不认识返回 null（安静地不弹菜单）。
      if (parseKanbanColumnElementId(canvas.id) !== null) return { kind: 'kanban-column', elementId: canvas.id }
      if (parseKanbanCardElementId(canvas.id) !== null) return { kind: 'kanban-card', elementId: canvas.id }
      return null
    }
    // requirement（more-diagrams 工单 07）：node.id = 投影 elementId（`requirement:<名>` /
    // `requirement-element:<名>`），按前缀解回两类节点；都解不开（含空格的引号名在渲染
    // DOM 上不可寻址，本就到不了这里）→ null
    if (diagramType === 'requirement') {
      const requirement = parseRequirementBlockElementId(canvas.id)
      if (requirement !== null) return { kind: 'requirement-node', name: requirement.name }
      const element = parseRequirementElemBlockElementId(canvas.id)
      return element !== null ? { kind: 'requirement-element', name: element.name } : null
    }
    return { kind: 'sequence-participant', actorId: canvas.id }
  }
  if (canvas.kind === 'element') {
    // 复用「身份 → 编辑器选中」的收窄逻辑，保证路由与选中永远认同一批种类
    const editorSelection = edgeSelectionOf(diagramType, canvas.elementId)
    if (editorSelection === null) return null
    switch (editorSelection.kind) {
      case 'class-relation':
        return { kind: 'class-relation', elementId: editorSelection.elementId }
      case 'message':
        return { kind: 'sequence-message', elementId: editorSelection.elementId }
      case 'note':
        return { kind: 'sequence-note', elementId: editorSelection.elementId }
      case 'block':
        return { kind: 'sequence-block', elementId: editorSelection.elementId }
      case 'state-transition':
        return { kind: 'state-transition', elementId: editorSelection.elementId }
      case 'er-relation':
        return { kind: 'er-relation', elementId: editorSelection.elementId }
      case 'requirement-relation':
        return { kind: 'requirement-relation', elementId: editorSelection.elementId }
      default:
        return null
    }
  }
  return diagramType === 'flowchart'
    ? { kind: 'flowchart-edge', from: canvas.from, to: canvas.to, occurrence: canvas.occurrence }
    : null
}
