/**
 * 节点 data-id 后处理（工单 08 验收发现的修复；工单 09 扩展到 class）
 *
 * mermaid v12 实测（neo look）：节点 <g.node> **不带 data-id**，只有 DOM id ——
 * - flowchart：`{svgId}-flowchart-{节点id}-{序号}`
 * - class：`{svgId}-classId-{类名}-{序号}`（实测 `mmd-preview-21-classId-BankAccount-14`）
 * （ADR-0007 的"节点 data-id = 源码节点 id"事实约定在 v12 渲染产物上不成立）
 *
 * 与工单 01 的连线命中路径同类：渲染 SVG 注入后的纯 DOM 后处理——把节点 DOM id
 * 反注为 `data-id`，使 data-id 选中解析（data-id.ts）、高亮（highlight.ts）、
 * 内联编辑寻址（inline-edit.ts）的既有链路原样生效。幂等（已有 data-id 不动）。
 *
 * 工单 09：class 图复用同一条链路（反注而非各自打补丁），于是「左键点选 / 高亮 /
 * 内联编辑定位 / 右键节点菜单」四处无需分别适配；mindmap 无法反注（其 DOM id 是
 * 位置序 `node_N`，不是源码 id），仍走 mindmap-adapter 的映射。
 * more-diagrams 工单 06：kanban 的卡片 / 列 DOM id 是 `${svgId}-${节点id}`（无词元），
 * 走 `annotateKanbanDataIds`，以 svg 根 id 前缀剥离（作用域限定在 `.sections` / `.items`）。
 *
 * 尽力而为：解析不出节点 id 的 g.node 安静跳过（保持"退化为仅结构树可选中"
 * 的既有约定）；反注错误的 id 也不可能凭空造出选中——resolver 只认投影已知节点。
 */

/** mermaid flowchart 节点 DOM id 形态：`{svgId}-flowchart-{节点id}-{序号}`；
 * 节点 id 自身可含 `-`，以尾部 `-数字` 为序号切分 */
const FLOWCHART_NODE_DOM_ID = /(?:^|-)flowchart-(.+)-(\d+)$/

/** mermaid v12 class 类框 DOM id 形态：`{svgId}-classId-{类名}-{序号}`；
 * 类名自身可含 `-`，同样以尾部 `-数字` 切分 */
const CLASS_NODE_DOM_ID = /(?:^|-)classId-(.+)-(\d+)$/

/** mermaid v12 state 状态节点 DOM id 形态：`{svgId}-state-{状态id}-{序号}`（stateDomId）；
 * note 块的 id 形如 `{svgId}-state-{目标}----note-{n}`，解析出的 `目标----note` 不是
 * 已知状态 id，被 resolver 安静拒绝（more-diagrams 工单 02） */
const STATE_NODE_DOM_ID = /(?:^|-)state-(.+)-(\d+)$/

/** mermaid v12 er 实体 DOM id 形态：`entity-{实体名}-{序号}`（erDb.addEntity 的
 * `entity-${name}-${n}`，unified 渲染器以 `node.domId ?? node.id` 落 DOM id，无 svgId 前缀；
 * more-diagrams 工单 03）。handDrawn look 的 `-background` 副本不以数字结尾，不命中。
 * 含空格的实体名 mermaid 会原样放进 id（非法 DOM id），此类实体安静降级为不可寻址。 */
const ER_ENTITY_DOM_ID = /(?:^)entity-(.+)-(\d+)$/

/**
 * mermaid v12 requirementDiagram 节点寻址（more-diagrams 工单 07）：`annotateRequirementDataIds`
 * 专责反注。DOM id 形态是**宽口径**的 `{svgId}-{名字}`（requirementDb.getData 直接以
 * `node.id = requirement.name` / `element.name` 建节点，不追加 `-序号`；unified 渲染器
 * 再拼上 `data4Layout.diagramId` = 预览 render id `mmd-preview-N` 前缀），**不能**进
 * `nodeIdOfDomId` 的通用循环——kanban（工单 06）已用「孤立 g.node 不反注」钉住了
 * 通用循环的收口约定，宽口径会误伤。故与 kanban 同款：按渲染器专属作用域限定
 * （requirement 走 unified → dagre 布局器，`g.node` 落在 `g.root > g.nodes`；
 * 证据：`chunk-GNY47TPC` render → `dagre-6A5THRUB` 的 createLayoutElementGroups）。
 * mindmap 的 DOM id 也是 `{svgId}-` 前缀（`node_{N}`），显式让位（其身份由
 * mindmap-adapter 的后缀匹配承担）：名字恰为 `node_<数字>` 的节点不被反注（安静降级）。
 * 含空格的引号名 mermaid 原样放进 DOM id（非法 DOM id），同样安静降级为不可寻址。
 */

/** DOM id → 节点 id（flowchart / class / state / er 四种形态）；不是节点 id 时 null */
function nodeIdOfDomId(domId: string): string | null {
  const flow = FLOWCHART_NODE_DOM_ID.exec(domId)
  if (flow !== null) return flow[1]
  const cls = CLASS_NODE_DOM_ID.exec(domId)
  if (cls !== null) return cls[1]
  const state = STATE_NODE_DOM_ID.exec(domId)
  if (state !== null) return state[1]
  const er = ER_ENTITY_DOM_ID.exec(domId)
  return er !== null ? er[1] : null
}

/**
 * mermaid v12 kanban（more-diagrams 工单 06）：渲染器把列放进 `<g class="sections">`、
 * 卡片放进 `<g class="items">`（kanban-definition 的 `draw`），两者的 DOM id 都是
 * `${svgId}-${节点id}`——**没有词元、没有序号后缀**，故 `nodeIdOfDomId` 无法反解。
 * 这里换一条路：以 **svg 根 id 为前缀**剥离（svgId 就在渲染产物里，取得到）。
 * 作用域严格限定在这两个 kanban 专属包裹组内，不会误伤其它图种的 g.node/g.cluster。
 *
 * DOM id 形态证据（离线核查 `kanban-definition-PNTS6WVX.mjs`）：
 * `draw` 里 `node.domId = \`${id}-${node.id}\``；列经 `insertCluster` 落 `<g class="cluster">`、
 * 卡片经 `insertNode`/`labelHelper` 落 `<g class="node">`，二者皆以 domId 为 DOM id。
 */
function annotateKanbanDataIds(root: ParentNode): void {
  const svgId = root.querySelector('svg')?.getAttribute('id') ?? ''
  if (svgId === '') return
  const prefix = `${svgId}-`
  for (const wrapper of root.querySelectorAll('g.sections, g.items')) {
    for (const g of wrapper.querySelectorAll('g.cluster, g.node')) {
      if (g.getAttribute('data-id') !== null) continue
      const domId = g.getAttribute('id')
      if (domId === null || !domId.startsWith(prefix)) continue
      const nodeId = domId.slice(prefix.length)
      if (nodeId !== '') g.setAttribute('data-id', nodeId)
    }
  }
}

/** requirement（more-diagrams 工单 07）：作用域限定在统一渲染器的 `g.root > g.nodes`，
 * 以 svg 根 id 前缀剥离得回名字（与 kanban 的前缀剥离同法）。flowchart / class / state /
 * er 在通用循环里由各自的专属形态先反注（此处跳过已标注者）；mindmap 的 `node_{N}`
 * 身份显式让位（由 mindmap-adapter 的后缀匹配承担）。 */
function annotateRequirementDataIds(root: ParentNode): void {
  const svgId = root.querySelector('svg')?.getAttribute('id') ?? ''
  if (svgId === '') return
  const prefix = `${svgId}-`
  for (const g of root.querySelectorAll('g.root g.nodes g.node')) {
    if (g.getAttribute('data-id') !== null) continue
    const domId = g.getAttribute('id')
    if (domId === null || !domId.startsWith(prefix)) continue
    const nodeId = domId.slice(prefix.length)
    if (nodeId === '' || /^node_[0-9]+$/.test(nodeId)) continue
    g.setAttribute('data-id', nodeId)
  }
}

/**
 * mermaid v12 block 图（more-diagrams 工单 09）：渲染器把所有节点/嵌套块装进
 * **自己的包裹组** `<g class="block">`（blockDiagram chunk 的 draw：
 * `svg.insert("g").attr("class", "block")`），节点经统一渲染器的形状处理器落
 * `<g class="node">`，DOM id 是 `${svgId}-${块id}`（`getNodeFromBlock` 的
 * `domId = db.getDiagramId() ? \`${diagramId}-${vertex.id}\` : vertex.id`，
 * 形状处理器 `attr("id", node.domId ?? node.id)`）——与 kanban 的 `${svgId}-${节点id}`
 * 同形，走前缀剥离。作用域严格限定在 `g.block` 内，不进 `nodeIdOfDomId` 通用循环
 * （kanban 已用「孤立 g.node 不反注」钉住收口约定）。
 * space 不渲染（`insertBlockPositioned` 对 type space 跳过），无对应 DOM；匿名嵌套块
 * （无 `block:gid` 显式 id）由 mermaid 生成随机 id，反注出的身份不在投影里，resolver
 * 安静拒绝（降级为不可寻址）。
 */
function annotateBlockDataIds(root: ParentNode): void {
  const svgId = root.querySelector('svg')?.getAttribute('id') ?? ''
  if (svgId === '') return
  const prefix = `${svgId}-`
  for (const wrapper of root.querySelectorAll('g.block')) {
    for (const g of wrapper.querySelectorAll('g.node')) {
      if (g.getAttribute('data-id') !== null) continue
      const domId = g.getAttribute('id')
      if (domId === null || !domId.startsWith(prefix)) continue
      const nodeId = domId.slice(prefix.length)
      if (nodeId !== '') g.setAttribute('data-id', nodeId)
    }
  }
}

/**
 * mermaid v12 gantt（more-diagrams 工单 11）：任务条 `rect` 与任务文本 `text` 的 DOM id
 * 是 `${svgId}-${taskId}` / `${svgId}-${taskId}-text`（ganttDiagram 渲染函数 1616–1617 /
 * 1688–1689 行，工单 Comments 记录证据）；taskId = 显式 id 或自动 `taskN`（parseId
 * 口径见 gantt-projection）。作用域严格限定在**带 svgId 前缀 id 的 rect / text**——
 * 注册图种中只有 gantt 给这两类元素挂 svgId 前缀 id（journey/timeline 的前缀 id 在
 * `line` 上、sequence 在 `line`/defs 上、gitGraph 在 defs 上），不会误伤其它图种。
 * `-text` 后缀只在 text 元素上剥离（rect 的显式 id 可能合法地以 `-text` 结尾，
 * 不能按后缀猜测）。幂等（已有 data-id 不动）；剥离后为空安静跳过。
 */
function annotateGanttDataIds(root: ParentNode): void {
  const svgId = root.querySelector('svg')?.getAttribute('id') ?? ''
  if (svgId === '') return
  const prefix = `${svgId}-`
  for (const el of root.querySelectorAll('svg rect[id], svg text[id]')) {
    if (el.getAttribute('data-id') !== null) continue
    const domId = el.getAttribute('id')
    if (domId === null || !domId.startsWith(prefix)) continue
    let taskId = domId.slice(prefix.length)
    if (el.tagName.toLowerCase() === 'text' && taskId.endsWith('-text')) {
      taskId = taskId.slice(0, -'-text'.length)
    }
    if (taskId !== '') el.setAttribute('data-id', taskId)
  }
}

/**
 * mermaid v12 quadrantChart（more-diagrams 工单 12）：渲染器（`quadrantDiagram-O4NWA36T.mjs`
 * 的 draw）**不写任何 id / data-id**，但包裹组结构稳定且类名专属（其余图种无
 * `g.quadrants` / `g.data-points` / `g.labels`），故按**位置序**在此反注（ADR-0012），
 * 作用域严格限定在这三个 quadrant 专属包裹内——绝不进 `nodeIdOfDomId` 通用循环
 * （工单 06 钉死的收口约定）。走专责 `nodeAnnotator`（需投影信息给条数门卫），
 * 不像 flowchart/class 那样由无参的 `annotateNodeDataIds` 承担。
 *
 * DOM 序证据（离线核查渲染器源码，已记入工单 Comments）：
 * - 象限：`getQuadrants` 数组序固定为 quadrant-1..4 → `g.quadrants > g.quadrant` 的
 *   DOM 序恒为 1..4。
 * - 点：`addPoint` → `addPoints` **头插**（`this.data.points = [...points, ...this.data.points]`），
 *   `getQuadrantPoints` 按数组序 map 后 d3 enter().append() —— DOM 序 = 源码点序的**逆序**。
 * - 轴标签：`getAxisLabels` 依条件 push，顺序恒为 x左 → x右 → y下 → y上；条数取决于
 *   各段文本有无（config 默认 showXAxis/showYAxis=true，用户手写 config 关闭时
 *   条数与预测不符 → 整体不标，绝不误归属——与 er 位置序反注同门卫）。
 */
export function annotateQuadrantDataIds(
  root: ParentNode,
  opts: { pointCount: number; axisLabels: readonly string[] },
): void {
  // 门卫：g.quadrants 是 quadrant 渲染器专属类名（其余图种的产物不含）
  if (root.querySelector('g.quadrants') === null) return
  // 象限：恒 4 个，DOM 序 = quadrant-1..4
  root.querySelectorAll('g.quadrants > g.quadrant').forEach((g, i) => {
    if (g.getAttribute('data-id') === null) g.setAttribute('data-id', `quadrant:${i + 1}`)
  })
  // 点：DOM 序 = 源码逆序（头插）；条数与投影不符整体不标（绝不误归属）
  const pointGroups = root.querySelectorAll('g.data-points > g.data-point')
  if (opts.pointCount > 0 && pointGroups.length === opts.pointCount) {
    pointGroups.forEach((g, i) => {
      if (g.getAttribute('data-id') === null) g.setAttribute('data-id', `point:${opts.pointCount - i}`)
    })
  }
  // 轴标签：DOM 序 = x左 → x右 → y下 → y上（条件渲染）；条数与预测不符整体不标
  const labels = root.querySelectorAll('g.labels > g.label')
  if (opts.axisLabels.length > 0 && labels.length === opts.axisLabels.length) {
    labels.forEach((g, i) => {
      const dataId = opts.axisLabels[i]
      if (dataId !== undefined && g.getAttribute('data-id') === null) g.setAttribute('data-id', dataId)
    })
  }
}

export function annotateNodeDataIds(root: ParentNode): void {
  for (const g of root.querySelectorAll('g.node')) {
    if (g.getAttribute('data-id') !== null) continue
    const domId = g.getAttribute('id')
    if (domId === null) continue
    const nodeId = nodeIdOfDomId(domId)
    if (nodeId === null) continue
    g.setAttribute('data-id', nodeId)
  }
  annotateKanbanDataIds(root)
  annotateRequirementDataIds(root)
  annotateBlockDataIds(root)
  annotateGanttDataIds(root)
}

/**
 * mermaid v12 packetChart（more-diagrams 工单 16）：渲染器（`diagram-MLGK6HIB.mjs` 的
 * draw/drawWord）**不写任何 id / data-id**（全文件 0 处），但块级结构专属且稳定：
 * 每行一个 `g`（无类名），行内每块依次 `rect.packetBlock` + `text.packetLabel` +
 * `text.packetByte.start`（+ 非单 bit 块的 `text.packetByte.end`，showBits 关闭时
 * 两者皆无）。故在此按 **start-bit 映射**反注（ADR-0012 位置序的精确形态），作用域
 * 严格限定在 packet 专属结构内——绝不进 `nodeIdOfDomId` 通用循环（工单 06 约定）。
 * 走专责 `nodeAnnotator`（需投影的绝对区间做归属门卫），不进无参 `annotateNodeDataIds`。
 *
 * DOM 序证据（离线核查渲染器源码，已记入工单 Comments）：
 * - `draw` 按行序（words.entries()）逐行 append `g`；行内块按位序 append。
 *   字段绝对区间连续时，块 DOM 序 = 起始位升序 = 源码字段序。
 * - `text.packetByte.start` 的文本 = 该块的绝对起始位（block.start）——据此把块
 *   归属到投影字段（start ∈ [absStart, absEnd]），**不依赖 bitsPerRow**（字段跨行
 *   拆块也能归属）。任一块归属失败（DOM 与投影不符 / showBits 关闭 / 手写非法源码）
 *   → 整体不标，绝不误归属——与 er/quadrant 位置序反注同门卫。
 */
export function annotatePacketDataIds(
  root: ParentNode,
  fields: ReadonlyArray<{ elementId: string; absStart: number; absEnd: number }>,
): void {
  // 门卫：rect.packetBlock 是 packet 渲染器专属类名（其余图种的产物不含）
  const rects = root.querySelectorAll('rect.packetBlock')
  if (rects.length === 0) return
  const startTexts = root.querySelectorAll('text.packetByte.start')
  // showBits 关闭（手写 config）时 start 位号文本缺失 → 无法归属，整体不标
  if (startTexts.length !== rects.length) return
  // 先整体归属、再统一落标（两趟）：任一块归属失败 → 整体不标（绝不留下部分标注，
  // 与 er/quadrant 位置序反注的「绝不误归属」同门卫）
  const assigned: Array<string | null> = new Array(rects.length).fill(null)
  let fieldIndex = 0
  for (let i = 0; i < rects.length; i++) {
    // start 位号文本必须是十进制非负整数（Number('') = 0 会把空文本误归到 bit 0）
    const raw = startTexts[i].textContent?.trim() ?? ''
    if (!/^[0-9]+$/.test(raw)) return
    const startBit = Number(raw)
    // 块起始位升序（DOM 序），字段区间按序推进；落不到任何字段区间 → 整体不标
    while (fieldIndex < fields.length && fields[fieldIndex].absEnd < startBit) fieldIndex++
    const field = fields[fieldIndex]
    if (field === undefined || field.absStart > startBit) return
    assigned[i] = field.elementId
  }
  for (let i = 0; i < rects.length; i++) {
    const elementId = assigned[i]
    if (elementId === null) continue
    const rect = rects[i]
    if (rect.getAttribute('data-id') !== null) continue
    rect.setAttribute('data-id', elementId)
    // 块标签紧跟块矩形（drawWord 的 append 序），同属一个源码字段——同亮
    const label = rect.nextElementSibling
    if (label !== null && label.classList.contains('packetLabel')) {
      label.setAttribute('data-id', elementId)
    }
  }
}
