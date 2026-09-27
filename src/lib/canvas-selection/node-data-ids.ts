/**
 * 节点 data-id 后处理（工单 08 验收发现的修复）
 *
 * mermaid v12 实测（neo look）：flowchart 的边 <path> 带 `data-id="L_{from}_{to}_{n}"`，
 * 但节点 <g.node> **不带 data-id**，只有 DOM id `{svgId}-flowchart-{节点id}-{序号}`
 * （ADR-0007 的"节点 data-id = 源码节点 id"事实约定在 v12 渲染产物上不成立）。
 *
 * 与工单 01 的连线命中路径同类：渲染 SVG 注入后的纯 DOM 后处理——把节点 DOM id
 * 反注为 `data-id`，使 data-id 选中解析（data-id.ts）、高亮（highlight.ts）、
 * 内联编辑寻址（inline-edit.ts）的既有链路原样生效。幂等（已有 data-id 不动）。
 *
 * 尽力而为：解析不出节点 id 的 g.node 安静跳过（保持"退化为仅结构树可选中"
 * 的既有约定）；反注错误的 id 也不可能凭空造出选中——resolver 只认投影已知节点。
 */

/** mermaid flowchart 节点 DOM id 形态：`{svgId}-flowchart-{节点id}-{序号}`；
 * 节点 id 自身可含 `-`，以尾部 `-数字` 为序号切分 */
const FLOWCHART_NODE_DOM_ID = /(?:^|-)flowchart-(.+)-(\d+)$/

export function annotateNodeDataIds(root: ParentNode): void {
  for (const g of root.querySelectorAll('g.node')) {
    if (g.getAttribute('data-id') !== null) continue
    const domId = g.getAttribute('id')
    if (domId === null) continue
    const m = FLOWCHART_NODE_DOM_ID.exec(domId)
    if (m === null) continue
    g.setAttribute('data-id', m[1])
  }
}
