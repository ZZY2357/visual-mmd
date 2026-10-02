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
import { blockSelectionOf } from './block-adapter'
import { xychartSelectionOf } from './xychart-adapter'
import { vennSelectionOf } from './venn-adapter'
import { usecaseSelectionOf } from './usecase-adapter'
import { agentflowSelectionOf } from './agentflow-adapter'
import {
  parseArchitectureGroupElementId,
  parseArchitectureJunctionElementId,
  parseArchitectureServiceElementId,
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
 * 工单 architecture-deepening-3 03 起 Target 复用 Selection 词汇：元素目标**就是**选中
 * 本身，不再有第二套 kind 名字——原先 60+ case 的逐 kind 转写 switch 随之消失；
 * blank 目标什么都不选（既有语义：空白菜单不 select）返回 null。
 */
export function selectionOfMenuTarget(target: ContextMenuTarget): Selection | null {
  return target.kind === 'element' ? target.selection : null
}

/**
 * 菜单可寻址的选中种类表（工单 architecture-deepening-3 03）：Target 复用 Selection 词汇后，
 * 「哪些选中能弹菜单」收成这一张显式表（与 canvasIdOf 的「显式可寻址表 + 测试逼答」同范式）。
 * - 节点类：fromCanvasId 的 node 分支产出中可弹菜单的 kind（gantt-task 等虽有画布选中
 *   但无元素级菜单，不进表）；timeline / wardley / cynefin / zenuml / c4 / em 等
 *   画布不可寻址的 kind 也在表内——它们只由测试/程序构造目标，画布路径天然到不了。
 * - 连线类：edgeSelectionOf 的全部产出（class / sequence / state / er / requirement /
 *   block / sankey 的位置序连线）+ `edge` / `agentflow-edge`（flowchart / agentflow 的
 *   原生 `L_{from}_{to}_{n}` data-id 边）。
 */
const MENU_ADDRESSABLE_KINDS: ReadonlySet<Selection['kind']> = new Set([
  'node',
  'edge',
  'mindmap-node',
  'class',
  'participant',
  'class-relation',
  'message',
  'note',
  'block',
  'state',
  'state-transition',
  'er-entity',
  'er-relation',
  'er-attribute',
  'timeline-period',
  'timeline-event',
  'kanban-column',
  'kanban-card',
  'requirement',
  'requirement-element',
  'requirement-relation',
  'block-node',
  'block-group',
  'block-edge',
  'sankey-node',
  'sankey-link',
  'quadrant-point',
  'quadrant-axis',
  'quadrant-quadrant',
  'packet-field',
  'xychart-series',
  'xychart-axis',
  'xychart-title',
  'architecture-service',
  'architecture-group',
  'architecture-junction',
  'wardley-node',
  'wardley-link',
  'wardley-evolve',
  'venn-set',
  'venn-union',
  'cynefin-domain',
  'cynefin-item',
  'cynefin-transition',
  'usecase-actor',
  'usecase-usecase',
  'usecase-boundary',
  'usecase-relation',
  'usecase-note',
  'em-frame',
  'em-data',
  'agentflow-node',
  'agentflow-edge',
  'zenuml-participant',
  'zenuml-message',
  'zenuml-fragment',
  'c4-element',
  'c4-boundary',
  'c4-relation',
])

/**
 * CanvasSelection + 图种 → ContextMenuTarget（工单 architecture-deepening-3 03 重写）：
 * Target 复用 Selection 词汇后，菜单目标 = 「fromCanvasId 的选中 + 菜单可寻址过滤」——
 * 原先与 fromCanvasId 平行的 60+ 分支逐 kind 转写（每个 kind 的身份在两个 switch 各写一遍）
 * 收敛为一张 MENU_ADDRESSABLE_KINDS 表。空白处（canvas === null）一律返回 blank（图种随
 * 目标携带）；选中不可得或不在可寻址表内返回 null——安静地不弹菜单，不崩溃。
 */
export function menuTargetOfCanvas(
  diagramType: DiagramTypeId,
  canvas: CanvasSelection | null,
): ContextMenuTarget | null {
  if (canvas === null) return { kind: 'blank', diagramType }
  const selection = fromCanvasId(diagramType, canvas)
  if (selection === null || !MENU_ADDRESSABLE_KINDS.has(selection.kind)) return null
  return { kind: 'element', selection }
}
