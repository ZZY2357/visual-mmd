import type { DiagramTypeId } from '../diagram-registry'
import type { Selection } from '../projection/selection'
import type { CanvasSelection } from './data-id'
import { toEditorSelection } from './flowchart-adapter'
import { edgeSelectionOf } from './edge-adapter'
import { mindmapDomIdOf } from './mindmap-adapter'
import { parseKanbanCardElementId, parseKanbanColumnElementId } from '../pipeline/element-id'
import { requirementSelectionOf } from './requirement-adapter'
import { quadrantSelectionOf } from './quadrant-adapter'
import { packetSelectionOf } from './packet-adapter'
import {
  parseRequirementBlockElementId,
  parseRequirementElemBlockElementId,
} from '../pipeline/element-id'
import { blockSelectionOf } from './block-adapter'
import { xychartSelectionOf } from './xychart-adapter'
import { vennSelectionOf } from './venn-adapter'
import { usecaseSelectionOf } from './usecase-adapter'
import { agentflowSelectionOf } from './agentflow-adapter'
import {
  parseArchitectureGroupElementId,
  parseArchitectureJunctionElementId,
  parseArchitectureServiceElementId,
  parseBlockGroupElementId,
  parseBlockNodeElementId,
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
    // block（more-diagrams 工单 09）：节点/嵌套块 data-id 即语法 id（渲染后从
    // `g.block` 内的 DOM id 反注）；边走位置序身份 `edge:N`
    case 'block-node':
    case 'block-group':
      return selection.id
    case 'block-edge':
      return selection.elementId
    // sankey（more-diagrams 工单 13）：节点 data-id 即名字（渲染后从 `g.nodes` 内按
    // 位置序反注）；链路走位置序身份 `link:N`（渲染后从 `g.links` 内按位置序反注）
    case 'sankey-node':
      return selection.name
    case 'sankey-link':
      return selection.elementId
    // quadrant（more-diagrams 工单 12）：点/轴/象限的 data-id 即投影 elementId
    // （渲染后按位置序反注，见 quadrant-adapter / node-data-ids）
    case 'quadrant-point':
    case 'quadrant-axis':
    case 'quadrant-quadrant':
      return selection.elementId
    // packet（more-diagrams 工单 16）：字段的 data-id 即投影 elementId
    // （渲染后按 start-bit 映射反注，见 packet-adapter / node-data-ids）
    case 'packet-field':
      return selection.elementId
    // xychart（more-diagrams 工单 14）：系列 data-id = 位置序 `series:N`（渲染后从
    // `g.plot` 内按类名序号反注）；标题/轴 data-id 固定（渲染后按类名组反注）
    case 'xychart-series':
      return selection.elementId
    case 'xychart-title':
      return 'xychart-title'
    case 'xychart-axis':
      return selection.axis === 'x' ? 'xychart-x-axis' : 'xychart-y-axis'
    // architecture（more-diagrams 工单 17）：三类节点 data-id 即源码 id（渲染后从
    // `-service-` / `-node-` / `-group-` 词元的 DOM id 反注）；边不可寻址（DOM id 是
    // `L_{from}_{to}_0`，计数器恒 0、重复边互相覆盖，见 architecture-adapter），
    // align 不产生画布元素——安静地不高亮。
    case 'architecture-service':
    case 'architecture-group':
    case 'architecture-junction':
      return selection.name
    // wardley（more-diagrams 工单 23）：画布 DOM 无 data-id（research §4 实测：渲染器只写
    // class），三类选中都不可寻址——安静地不高亮（结构树选中仍在，属性表单可编）
    // venn（more-diagrams 工单 21）：集合 / 交集的 data-id 即投影 elementId
    // （渲染后从 `data-venn-sets` 内容键反注，见 venn-adapter / node-data-ids）
    case 'venn-set':
      return `venn-set:${selection.id}`
    case 'venn-union':
      return selection.elementId
    // usecase（more-diagrams 工单 26）：节点 / 关系的 data-id 即投影 elementId
    // （渲染器已写 data-id，由 nodeAnnotator 归一为 elementId，见 usecase-adapter）
    case 'usecase-actor':
    case 'usecase-usecase':
    case 'usecase-boundary':
    case 'usecase-relation':
    case 'usecase-note':
      return selection.elementId
    // agentflow（more-diagrams 工单 27）：节点 data-id 即源码节点 id（渲染后从
    // `{svgId}-agentflow-{id}-{n}` DOM id 反注，见 node-data-ids 的 agentflow 形态）；
    // 边走原生 `L_{from}_{to}_{n}` data-id（尽力而为，与 flowchart 同口径，不进高亮链路
    // ——只在 canvasIdOf 给出节点 id）；容器/文档行画布无 data-id，安静地不高亮。
    case 'agentflow-node':
      return selection.nodeId
    // zenuml（more-diagrams 工单 19）：画布 DOM 无 data-id（任务 0 实测：渲染产物无
    // data-id / 无 id，见 zenuml-adapter），三类选中都不可寻址——安静地不高亮
    //（结构树选中仍在，属性表单可编）
    case 'zenuml-participant':
    case 'zenuml-message':
    case 'zenuml-fragment':
      return null
    // c4（more-diagrams 工单 18）：画布 DOM 无 data-id（实测：渲染器 `data-*` 出现 0 次，
    // 8 处 `.attr("id", ...)` 全在 `<defs>` marker 上，class 只有 c4/c4-external/c4-shape），
    // 三类选中都不可寻址——安静地不高亮（结构树 + 属性表单是唯一完整编辑入口）
    case 'c4-element':
    case 'c4-boundary':
    case 'c4-relation':
      return null
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
  if (diagramType === 'radar') {
    // radar（more-diagrams 工单 15）：画布 DOM 无 data-id（实测降级），画布选中不产生
    return null
  }
  if (diagramType === 'treemap') {
    // treemap（more-diagrams 工单 20）：画布 DOM 无 data-id（research §4 实测：渲染器
    // 只有 class + d3 值降序索引），画布选中不产生
    return null
  }
  if (diagramType === 'ishikawa') {
    // ishikawa（more-diagrams 工单 22）：画布 DOM 无 data-id（research §4 实测：渲染器
    // `data-` 出现 0 次，只有 class；且 flattenTree 按深度奇偶重排、渲染序 ≠ 源码序），
    // 画布选中不产生
    return null
  }
  if (diagramType === 'wardley') {
    // wardley（more-diagrams 工单 23）：画布 DOM 无 data-id（research §4 实测：渲染器
    // 只写 class `wardley-node` + `<defs>` 箭头 marker），画布选中不产生
    return null
  }
  if (diagramType === 'cynefin') {
    // cynefin（more-diagrams 工单 25）：画布 DOM 无 data-id（research §4/§8.1 实测：
    // 渲染器 `data-` 出现 0 次，仅 `<defs>` 箭头 marker 有 id），画布选中不产生
    return null
  }
  if (diagramType === 'treeview') {
    // treeView（more-diagrams 工单 24）：画布 DOM 无 data-id（research §4 实测：渲染器
    // `data-` 与 `.attr('id')` 各 0 次；且节点是 d3-hierarchy tidy tree 布局的「行」，
    // 与源码行序无一一对应），画布选中不产生
    return null
  }
  if (diagramType === 'gantt') {
    // gantt（more-diagrams 工单 11）：任务条 data-id = mermaid 渲染 id（渲染后处理
    // 反注），resolver 已把它映射回位置序 elementId（`task:N`）——node.id 即 elementId
    if (canvas.kind !== 'node') return null
    return { kind: 'gantt-task', elementId: canvas.id }
  }
  if (diagramType === 'quadrant') {
    // quadrant（more-diagrams 工单 12）：node.id 即投影 elementId（`point:N` / `x-axis` /
    // `y-axis` / `quadrant:N`，渲染后按位置序反注），按形态解回三类选中
    return quadrantSelectionOf(canvas)
  }
  if (diagramType === 'packet') {
    // packet（more-diagrams 工单 16）：node.id 即投影 elementId（`field:N`，渲染后按
    // start-bit 映射反注），按形态解回字段选中
    return packetSelectionOf(canvas)
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
  if (diagramType === 'block') {
    // block（more-diagrams 工单 09）：节点 data-id 即语法 id，resolver 反注成
    // `block-node:<id>` / `block-group:<gid>`，按前缀解回；边走位置序（edgeSelectionOf 收窄）
    return blockSelectionOf(canvas)
  }
  if (diagramType === 'sankey') {
    // sankey（more-diagrams 工单 13）：节点 data-id 即名字（位置序反注），名字即身份；
    // 链路走位置序（edgeSelectionOf 收窄）
    if (canvas.kind === 'node') return { kind: 'sankey-node', name: canvas.id }
    if (canvas.kind === 'element') return edgeSelectionOf(diagramType, canvas.elementId)
    return null
  }
  if (diagramType === 'xychart') {
    // xychart（more-diagrams 工单 14）：node.id = `series:N` / 固定身份（类名组反注），
    // 唯一映射在 xychartSelectionOf
    if (canvas.kind === 'node') return xychartSelectionOf(canvas)
    return null
  }
  if (diagramType === 'architecture') {
    // architecture（more-diagrams 工单 17）：node.id = 投影 elementId（带前缀，按前缀解回
    // 三类节点）；边不可寻址（element 分支收不到），画布元素选中不产生
    if (canvas.kind === 'node') {
      const service = parseArchitectureServiceElementId(canvas.id)
      if (service !== null) return { kind: 'architecture-service', name: service.id }
      const group = parseArchitectureGroupElementId(canvas.id)
      if (group !== null) return { kind: 'architecture-group', name: group.id }
      const junction = parseArchitectureJunctionElementId(canvas.id)
      return junction !== null ? { kind: 'architecture-junction', name: junction.id } : null
    }
    return null
  }
  if (diagramType === 'venn') {
    // venn（more-diagrams 工单 21）：node.id = 投影 elementId（`venn-set:<id>` /
    // `venn-union:N`，渲染后从 `data-venn-sets` 反注），按前缀解回两类选中
    return vennSelectionOf(canvas)
  }
  if (diagramType === 'usecase') {
    // usecase（more-diagrams 工单 26）：node.id = 投影 elementId（`actor:<id>` /
    // `usecase:<id>` / `boundary:<id>` / `relation:N`，渲染器已写 data-id 由 nodeAnnotator
    // 归一），按前缀解回四类选中
    return usecaseSelectionOf(canvas)
  }
  if (diagramType === 'eventmodeling') {
    // eventmodeling（more-diagrams 工单 28）：画布 DOM 无 data-id（research §4/§8.3 实测：
    // `em-box` / `em-swimlane` / `em-relation` 均无 data-id，唯一 id 是 `<defs>` 箭头
    // marker），画布选中不产生
    return null
  }
  if (diagramType === 'agentflow') {
    // agentflow（more-diagrams 工单 27）：节点 data-id 即源码节点 id（反注）；边是原生
    // `L_{from}_{to}_{n}` data-id，edgeDataIdResolver 已解回 (from,to,occurrence) ——
    // 走 agentflowSelectionOf 收窄成 `agentflow-edge`（elementId 由三元组重建）
    return agentflowSelectionOf(canvas)
  }
  if (diagramType === 'zenuml') {
    // zenuml（more-diagrams 工单 19）：画布 DOM 无 data-id（任务 0 实测），画布选中不产生
    return null
  }
  if (diagramType === 'c4') {
    // c4（more-diagrams 工单 18）：画布 DOM 无 data-id（实测降级，见 c4-adapter 顶注），
    // 画布选中不产生
    return null
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
    // block（more-diagrams 工单 09）：节点 / 嵌套块 / 边菜单目标一一对应各自 Selection kind
    case 'block-node':
      return { kind: 'block-node', id: target.id }
    case 'block-group':
      return { kind: 'block-group', id: target.id }
    case 'block-edge':
      return { kind: 'block-edge', elementId: target.elementId }
    // sankey（more-diagrams 工单 13）：节点 / 链路菜单目标一一对应各自 Selection kind
    case 'sankey-node':
      return { kind: 'sankey-node', name: target.name }
    case 'sankey-link':
      return { kind: 'sankey-link', elementId: target.elementId }
    // quadrant（more-diagrams 工单 12）：点/轴/象限菜单目标一一对应各自 Selection kind
    case 'quadrant-point':
      return { kind: 'quadrant-point', elementId: target.elementId }
    case 'quadrant-axis':
      return { kind: 'quadrant-axis', elementId: target.elementId }
    case 'quadrant-quadrant':
      return { kind: 'quadrant-quadrant', elementId: target.elementId }
    // packet（more-diagrams 工单 16）：字段菜单目标一一对应 Selection kind
    case 'packet-field':
      return { kind: 'packet-field', elementId: target.elementId }
    // xychart（more-diagrams 工单 14）：系列 / 轴 / 标题菜单目标一一对应各自 Selection kind
    case 'xychart-series':
      return { kind: 'xychart-series', elementId: target.elementId }
    case 'xychart-axis':
      return { kind: 'xychart-axis', axis: target.axis }
    case 'xychart-title':
      return { kind: 'xychart-title' }
    // architecture（more-diagrams 工单 17）：三类节点 / 边菜单目标一一对应各自 Selection kind
    case 'architecture-service':
      return { kind: 'architecture-service', name: target.name }
    case 'architecture-group':
      return { kind: 'architecture-group', name: target.name }
    case 'architecture-junction':
      return { kind: 'architecture-junction', name: target.name }
    case 'architecture-edge':
      return { kind: 'architecture-edge', elementId: target.elementId }
    // wardley（more-diagrams 工单 23）：节点 / 连线 / evolve 菜单目标一一对应各自 Selection kind
    case 'wardley-node':
      return { kind: 'wardley-node', name: target.name }
    case 'wardley-link':
      return { kind: 'wardley-link', elementId: target.elementId }
    case 'wardley-evolve':
      return { kind: 'wardley-evolve', elementId: target.elementId }
    // venn（more-diagrams 工单 21）：集合 / 交集菜单目标一一对应各自 Selection kind
    case 'venn-set':
      return { kind: 'venn-set', id: target.id }
    case 'venn-union':
      return { kind: 'venn-union', elementId: target.elementId }
    // cynefin（more-diagrams 工单 25）：域 / 条目 / 转移菜单目标一一对应各自 Selection kind
    case 'cynefin-domain':
      return { kind: 'cynefin-domain', name: target.name }
    case 'cynefin-item':
      return { kind: 'cynefin-item', elementId: target.elementId }
    case 'cynefin-transition':
      return { kind: 'cynefin-transition', elementId: target.elementId }
    // usecase（more-diagrams 工单 26）：actor / 用例 / 边界 / 关系菜单目标一一对应
    case 'usecase-actor':
      return { kind: 'usecase-actor', elementId: target.elementId }
    case 'usecase-usecase':
      return { kind: 'usecase-usecase', elementId: target.elementId }
    case 'usecase-boundary':
      return { kind: 'usecase-boundary', elementId: target.elementId }
    case 'usecase-relation':
      return { kind: 'usecase-relation', elementId: target.elementId }
    case 'usecase-note':
      return { kind: 'usecase-note', elementId: target.elementId }
    // eventmodeling（more-diagrams 工单 28）：帧 / 数据块菜单目标一一对应各自 Selection kind
    case 'em-frame':
      return { kind: 'em-frame', elementId: target.elementId }
    case 'em-data':
      return { kind: 'em-data', elementId: target.elementId }
    // agentflow（more-diagrams 工单 27）：节点 / 边 / 容器 / 文档行菜单目标一一对应各自
    // Selection kind
    case 'agentflow-node':
      return { kind: 'agentflow-node', nodeId: target.nodeId }
    case 'agentflow-edge':
      return { kind: 'agentflow-edge', elementId: target.elementId }
    case 'agentflow-flow':
      return { kind: 'agentflow-flow', elementId: target.elementId }
    case 'agentflow-doc':
      return { kind: 'agentflow-doc', elementId: target.elementId }
    // zenuml（more-diagrams 工单 19）：参与者 / 消息 / 片段菜单目标一一对应各自 Selection kind
    case 'zenuml-participant':
      return { kind: 'zenuml-participant', elementId: target.elementId }
    case 'zenuml-message':
      return { kind: 'zenuml-message', elementId: target.elementId }
    case 'zenuml-fragment':
      return { kind: 'zenuml-fragment', elementId: target.elementId }
    // c4（more-diagrams 工单 18）：元素 / 边界 / 关系菜单目标一一对应各自 Selection kind
    case 'c4-element':
      return { kind: 'c4-element', elementId: target.elementId }
    case 'c4-boundary':
      return { kind: 'c4-boundary', elementId: target.elementId }
    case 'c4-relation':
      return { kind: 'c4-relation', elementId: target.elementId }
    case 'blank':
      return null
  }
}

/**
 * xychart（more-diagrams 工单 14）：画布 node.id → 菜单目标（固定身份 + 位置序系列）。
 * Selection 与 ContextMenuTarget 的 xychart 形态同构，经 xychartSelectionOf 唯一映射后转形。
 */
function xychartMenuTargetOf(canvas: { kind: 'node'; id: string }): ContextMenuTarget | null {
  const selection = xychartSelectionOf(canvas)
  switch (selection?.kind) {
    case 'xychart-series':
      return { kind: 'xychart-series', elementId: selection.elementId }
    case 'xychart-axis':
      return { kind: 'xychart-axis', axis: selection.axis }
    case 'xychart-title':
      return { kind: 'xychart-title' }
    default:
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
    if (diagramType === 'radar') return null // 无 data-id（实测降级），画布节点不可命中
    if (diagramType === 'treemap') return null // 无 data-id（实测降级，research §4），画布节点不可命中
    if (diagramType === 'ishikawa') return null // 无 data-id 且渲染序 ≠ 源码序（实测降级，research §4），画布节点不可命中
    if (diagramType === 'wardley') return null // 无 data-id（实测降级，research §4），画布节点不可命中
    if (diagramType === 'cynefin') return null // 无 data-id（实测降级，research §4/§8.1），画布节点不可命中
    if (diagramType === 'treeview') return null // 无 data-id 且渲染布局与源码行序无对应（实测降级，research §4），画布节点不可命中
    if (diagramType === 'zenuml') return null // 无 data-id（任务 0 实测降级），画布节点不可命中
    if (diagramType === 'c4') return null // 无 data-id（实测降级，见 c4-adapter 顶注），画布节点不可命中
    if (diagramType === 'gantt') {
      // gantt（more-diagrams 工单 11）：任务条虽可寻址，但元素级菜单不做（与 journey/pie
      // 同口径），编辑由结构树选中 + 属性表单承接——画布节点不产生菜单目标
      return null
    }
    // quadrant（more-diagrams 工单 12）：node.id = 投影 elementId（渲染后位置序反注），
    // 三类元素都有画布菜单
    if (diagramType === 'quadrant') {
      const selection = quadrantSelectionOf(canvas)
      if (selection === null) return null
      switch (selection.kind) {
        case 'quadrant-point':
          return { kind: 'quadrant-point', elementId: selection.elementId }
        case 'quadrant-axis':
          return { kind: 'quadrant-axis', elementId: selection.elementId }
        case 'quadrant-quadrant':
          return { kind: 'quadrant-quadrant', elementId: selection.elementId }
        default:
          return null
      }
    }
    // packet（more-diagrams 工单 16）：node.id = 投影 elementId（渲染后 start-bit 映射
    // 反注），字段有画布菜单
    if (diagramType === 'packet') {
      const selection = packetSelectionOf(canvas)
      return selection !== null && selection.kind === 'packet-field'
        ? { kind: 'packet-field', elementId: selection.elementId }
        : null
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
    // block（more-diagrams 工单 09）：node.id = 投影 elementId（`block-node:<id>` /
    // `block-group:<gid>`），按前缀解回两类节点；都解不开 → null（安静地不弹菜单）
    if (diagramType === 'block') {
      const node = parseBlockNodeElementId(canvas.id)
      if (node !== null) return { kind: 'block-node', id: node.id }
      const group = parseBlockGroupElementId(canvas.id)
      return group !== null ? { kind: 'block-group', id: group.id } : null
    }
    // sankey（more-diagrams 工单 13）：node.id = 节点名（位置序反注），名字即身份
    if (diagramType === 'sankey') return { kind: 'sankey-node', name: canvas.id }
    // xychart（more-diagrams 工单 14）：node.id = `series:N` / 固定身份（类名组反注），
    // 唯一映射在 xychartSelectionOf
    if (diagramType === 'xychart') return xychartMenuTargetOf(canvas)
    // architecture（more-diagrams 工单 17）：node.id = 投影 elementId（带前缀），按前缀
    // 解回三类节点；都解不开 → null（安静地不弹菜单）。边不可寻址，无边菜单目标。
    if (diagramType === 'architecture') {
      const service = parseArchitectureServiceElementId(canvas.id)
      if (service !== null) return { kind: 'architecture-service', name: service.id }
      const group = parseArchitectureGroupElementId(canvas.id)
      if (group !== null) return { kind: 'architecture-group', name: group.id }
      const junction = parseArchitectureJunctionElementId(canvas.id)
      return junction !== null ? { kind: 'architecture-junction', name: junction.id } : null
    }
    // venn（more-diagrams 工单 21）：node.id = 投影 elementId（`venn-set:<id>` /
    // `venn-union:N`，渲染后从 `data-venn-sets` 反注），两类元素都有画布菜单
    if (diagramType === 'venn') {
      const selection = vennSelectionOf(canvas)
      switch (selection?.kind) {
        case 'venn-set':
          return { kind: 'venn-set', id: selection.id }
        case 'venn-union':
          return { kind: 'venn-union', elementId: selection.elementId }
        default:
          return null
      }
    }
    // usecase（more-diagrams 工单 26）：node.id = 投影 elementId（`actor:` / `usecase:` /
    // `boundary:` / `relation:`，渲染器已写 data-id 由 nodeAnnotator 归一），四类都有菜单
    if (diagramType === 'usecase') {
      const selection = usecaseSelectionOf(canvas)
      switch (selection?.kind) {
        case 'usecase-actor':
          return { kind: 'usecase-actor', elementId: selection.elementId }
        case 'usecase-usecase':
          return { kind: 'usecase-usecase', elementId: selection.elementId }
        case 'usecase-boundary':
          return { kind: 'usecase-boundary', elementId: selection.elementId }
        case 'usecase-relation':
          return { kind: 'usecase-relation', elementId: selection.elementId }
        case 'usecase-note':
          return { kind: 'usecase-note', elementId: selection.elementId }
        default:
          return null
      }
    }
    // eventmodeling（more-diagrams 工单 28）：画布 DOM 无 data-id（research §4/§8.3 实测），
    // 画布节点不产生菜单目标
    if (diagramType === 'eventmodeling') return null
    // agentflow（more-diagrams 工单 27）：node.id = 源码节点 id（反注），节点有画布菜单
    if (diagramType === 'agentflow') return { kind: 'agentflow-node', nodeId: canvas.id }
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
      case 'block-edge':
        return { kind: 'block-edge', elementId: editorSelection.elementId }
      case 'sankey-link':
        return { kind: 'sankey-link', elementId: editorSelection.elementId }
      default:
        return null
    }
  }
  // canvas.kind === 'edge'（原生 `L_{from}_{to}_{n}` data-id 命中的边）：flowchart 与
  // agentflow 都走这条路径——agentflow 边身份同 flowchart 口径（`L_{from}_{to}_{n}`），
  // 用 (from,to,occurrence) 重建成位置序 elementId 后给菜单目标
  if (diagramType === 'flowchart') {
    return { kind: 'flowchart-edge', from: canvas.from, to: canvas.to, occurrence: canvas.occurrence }
  }
  if (diagramType === 'agentflow') {
    const selection = agentflowSelectionOf(canvas)
    return selection !== null && selection.kind === 'agentflow-edge'
      ? { kind: 'agentflow-edge', elementId: selection.elementId }
      : null
  }
  return null
}
