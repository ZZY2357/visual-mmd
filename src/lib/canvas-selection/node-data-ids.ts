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
}
