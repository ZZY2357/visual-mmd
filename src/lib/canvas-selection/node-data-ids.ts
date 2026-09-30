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
 * mermaid v12 requirementDiagram 节点 DOM id 形态：`{svgId}-{名字}`（more-diagrams 工单 07）。
 * requirementDb.getData 直接以 `node.id = requirement.name` / `element.name` 建节点
 * （**不追加 `-序号`**），unified 渲染器再拼上 `data4Layout.diagramId`
 * （= 预览 render id `mmd-preview-N`）前缀，`requirementBox` 以 `node.domId ?? node.id` 落 DOM id。
 *
 * 排在最后（前面四种形态更具体，先匹配），并显式排除 mindmap 的 `node_{N}`——
 * mindmap 的 DOM id 也是 `{svgId}-` 前缀，但它的节点身份由 mindmap-adapter 自己的
 * **后缀**匹配（`node_{N}`）承担，若被反注成 data-id 会与既有约定冲突
 * （node-data-ids.test.ts 的「不误伤其它图种」用例钉住了这条）。
 * 副作用：名字恰为 `node_<数字>` 的 requirement 节点不被反注（安静降级，极少见）。
 * 含空格的引号名同理降级为不可寻址。
 */
const REQUIREMENT_NODE_DOM_ID = /^mmd-preview-[0-9]+-(?!node_[0-9]+$)(.+)$/

/** DOM id → 节点 id（flowchart / class / state / er / requirement 五种形态）；不是节点 id 时 null */
function nodeIdOfDomId(domId: string): string | null {
  const flow = FLOWCHART_NODE_DOM_ID.exec(domId)
  if (flow !== null) return flow[1]
  const cls = CLASS_NODE_DOM_ID.exec(domId)
  if (cls !== null) return cls[1]
  const state = STATE_NODE_DOM_ID.exec(domId)
  if (state !== null) return state[1]
  const er = ER_ENTITY_DOM_ID.exec(domId)
  if (er !== null) return er[1]
  const requirement = REQUIREMENT_NODE_DOM_ID.exec(domId)
  return requirement !== null ? requirement[1] : null
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
}
