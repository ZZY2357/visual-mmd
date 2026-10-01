/**
 * 编辑器共享选中类型（工单 06 起）：flowchart 与 sequence 的选中种类并集。
 * 各图种的 resolveSelection 逻辑留在各自投影模块中。
 *
 * 注（工单 06）：`seq-region`（rect / box）与 `class-namespace` 这类无 data-id 的结构
 * 只能从结构树点选——画布上没有可命中的 DOM 元素（ADR-0014）。
 */

export type Selection =
  | { kind: 'diagram' }
  // flowchart（工单 04）
  | { kind: 'node'; nodeId: string }
  | { kind: 'edge'; from: string; to: string; occurrence: number }
  | { kind: 'subgraph'; elementId: string }
  | { kind: 'classdef'; name: string }
  // sequence（工单 06）
  | { kind: 'participant'; actorId: string }
  | { kind: 'message'; elementId: string }
  | { kind: 'note'; elementId: string }
  | { kind: 'block'; elementId: string }
  /** rect / box 区域块（工单 06：无 data-id、不进画布命中集合，只从结构树选中） */
  | { kind: 'seq-region'; elementId: string }
  // class（工单 07）
  | { kind: 'class'; name: string }
  | { kind: 'class-member'; elementId: string }
  | { kind: 'class-relation'; elementId: string }
  | { kind: 'class-note'; elementId: string }
  /** namespace 命名分组（工单 06：无 data-id、不构成 DOM 包含，只从结构树选中） */
  | { kind: 'class-namespace'; elementId: string }
  // mindmap（工单 08）
  | { kind: 'mindmap-node'; elementId: string }
  // state（more-diagrams 工单 02）
  | { kind: 'state'; id: string }
  | { kind: 'state-transition'; elementId: string }
  | { kind: 'state-note'; elementId: string }
  // er（more-diagrams 工单 03）
  | { kind: 'er-entity'; name: string }
  | { kind: 'er-attribute'; elementId: string }
  | { kind: 'er-relation'; elementId: string }
  // gitGraph（more-diagrams 工单 04）：语句序即拓扑，元素身份 = 位置序（分支按名）。
  // 画布 DOM 无 data-id（实测降级），选中只来自结构树 / 表单 / 键盘。
  | { kind: 'gitgraph-commit'; elementId: string }
  | { kind: 'gitgraph-branch'; name: string }
  | { kind: 'gitgraph-merge'; elementId: string }
  | { kind: 'gitgraph-cherry-pick'; elementId: string }
  // timeline（more-diagrams 工单 05）
  | { kind: 'timeline-period'; elementId: string }
  | { kind: 'timeline-event'; elementId: string }
  | { kind: 'timeline-section'; elementId: string }
  // kanban（more-diagrams 工单 06）：列是分组元素、卡片是节点元素
  | { kind: 'kanban-column'; elementId: string }
  | { kind: 'kanban-card'; elementId: string }
  // requirementDiagram（more-diagrams 工单 07）：requirement / element 是两类**名字即身份**
  // 的节点（名字可重名于彼此，画布 data-id 都是名字，由 resolver 按投影消歧）；
  // 关系走位置序身份（`relation:N`）。
  | { kind: 'requirement'; name: string }
  | { kind: 'requirement-element'; name: string }
  | { kind: 'requirement-relation'; elementId: string }
  // journey（more-diagrams 工单 08）：任务/section 走位置序身份（`task:N` / `section:N`，
  // journey 语法无节点 id）。画布 DOM 无 data-id（实测降级），选中只来自结构树 / 表单 / 键盘。
  | { kind: 'journey-task'; elementId: string }
  | { kind: 'journey-section'; elementId: string }
  // pie（more-diagrams 工单 10）：扇区走位置序身份（`sector:N`，pie 语法无节点 id）。
  // 画布 DOM 无 data-id（实测降级），选中只来自结构树 / 表单 / 键盘。
  | { kind: 'pie-sector'; elementId: string }
  // block(-beta)（more-diagrams 工单 09）：块节点与嵌套块是**名字即身份**（`block-node:<id>` /
  // `block-group:<gid>`，嵌套块是分组）；边走位置序身份（`edge:N`）。space 是布局空位，
  // 不构成选中种类。
  | { kind: 'block-node'; id: string }
  | { kind: 'block-group'; id: string }
  | { kind: 'block-edge'; elementId: string }
  // sankey-beta（more-diagrams 工单 13）：节点**不落码**（链路行 source/target 去重派生），
  // 名字即身份；链路走位置序身份（`link:N`）。画布 DOM 经位置序反注可寻址。
  | { kind: 'sankey-node'; name: string }
  | { kind: 'sankey-link'; elementId: string }
  // gantt（more-diagrams 工单 11）：任务走位置序身份（`task:N`——显式 id 可重复/省略，
  // 位置序是唯一稳定身份；mermaid 渲染 id 由投影预计算作画布 data-id，见 gantt-projection）。
  // section 与指令行无画布 DOM id（实测降级），选中只来自结构树 / 表单 / 键盘。
  | { kind: 'gantt-task'; elementId: string }
  | { kind: 'gantt-section'; elementId: string }
  | { kind: 'gantt-directive'; elementId: string }
  // quadrantChart（more-diagrams 工单 12）：点走位置序身份（`point:N`，quadrant 语法无
  // 节点 id）；轴（`x-axis` / `y-axis`）与象限标题（`quadrant:1..4`）是文档级属性元素。
  // 画布 DOM 的 data-id 由渲染后处理按位置序反注（见 quadrant-adapter / node-data-ids）。
  | { kind: 'quadrant-point'; elementId: string }
  | { kind: 'quadrant-axis'; elementId: string }
  | { kind: 'quadrant-quadrant'; elementId: string }
  // packet（more-diagrams 工单 16）：字段走位置序身份（`field:N`，packet 语法无字段 id）。
  // 画布 DOM 的 data-id 由渲染后处理按 start-bit 映射反注（见 packet-adapter / node-data-ids）。
  | { kind: 'packet-field'; elementId: string }
  // xychart（more-diagrams 工单 14）：系列 = 节点级元素（位置序身份 `series:N`）；
  // 标题与轴 = 文档级属性元素（固定身份，画布经类名组反注可寻址）。
  | { kind: 'xychart-series'; elementId: string }
  | { kind: 'xychart-axis'; axis: 'x' | 'y' }
  | { kind: 'xychart-title' }
  // radar-beta（more-diagrams 工单 15）：轴 / 曲线虽有语法 id 但 id 可改名，
  // 走位置序身份（`axis:N` / `curve:N`）。画布 DOM 无 data-id（实测降级——渲染器
  // 全程只有 class），选中只来自结构树 / 表单 / 键盘；轴 label 另有双击文本匹配
  // 内联编辑（inline-edit.ts，与 mindmap 同范式）。
  | { kind: 'radar-axis'; elementId: string }
  | { kind: 'radar-curve'; elementId: string }
  // architecture-beta（more-diagrams 工单 17）：三类节点（service / group / junction）
  // 是**名字即身份**（mermaid db 的 registeredIds 共享命名空间，重名抛出）；边走位置序
  // 身份（`edge:N`，与 block 边同前缀、图种先收窄）。节点 DOM id 带源码 id（渲染后反注
  // 可寻址）；边不可寻址（见 architecture-adapter），选中只来自结构树 / 表单 / 键盘。
  | { kind: 'architecture-service'; name: string }
  | { kind: 'architecture-group'; name: string }
  | { kind: 'architecture-junction'; name: string }
  | { kind: 'architecture-edge'; elementId: string }
  | { kind: 'architecture-align'; elementId: string }
  // treemap（more-diagrams 工单 20）：Section 分组与 Leaf 叶子统一走位置序身份
  // （`treemap-node:N`，文档序——渲染序按值降序、≠ 文档序，画布 DOM 无 data-id，
  // 实测降级见 treemap-adapter；选中只来自结构树 / 表单 / 键盘）。
  | { kind: 'treemap-node'; elementId: string }
  // ishikawa（more-diagrams 工单 22）：鱼头 / 主因 / 分支统一走位置序身份
  // （`ishikawa-node:N`，文档序——渲染序按深度奇偶 pre/post-order 重排、≠ 文档序，
  // 画布 DOM 无 data-id，实测降级见 ishikawa-adapter；选中只来自结构树 / 表单 / 键盘）。
  | { kind: 'ishikawa-node'; elementId: string }
  // treeView（more-diagrams 工单 24）：文件/目录统一走位置序身份
  // （`treeview-node:N`，文档序）。画布 DOM 无 data-id、无稳定 id（research §4 实测
  // 渲染器 0 处 data-、0 处 attr('id')），实测降级见 treeview-adapter；
  // 选中只来自结构树 / 表单 / 键盘。
  | { kind: 'treeview-node'; elementId: string }

export const DIAGRAM_SELECTION: Selection = { kind: 'diagram' }

export function selectionKey(sel: Selection): string {
  switch (sel.kind) {
    case 'diagram':
      return 'diagram'
    case 'node':
      return `node:${sel.nodeId}`
    case 'edge':
      return `edge:${sel.from}->${sel.to}#${sel.occurrence}`
    case 'subgraph':
      return `subgraph:${sel.elementId}`
    case 'classdef':
      return `classdef:${sel.name}`
    case 'participant':
      return `participant:${sel.actorId}`
    case 'message':
      return `message:${sel.elementId}`
    case 'note':
      return `note:${sel.elementId}`
    case 'block':
      return `block:${sel.elementId}`
    case 'seq-region':
      return `seq-region:${sel.elementId}`
    case 'class':
      return `class:${sel.name}`
    case 'class-member':
      return `class-member:${sel.elementId}`
    case 'class-relation':
      return `class-relation:${sel.elementId}`
    case 'class-note':
      return `class-note:${sel.elementId}`
    case 'class-namespace':
      return `class-namespace:${sel.elementId}`
    case 'mindmap-node':
      return `mindmap-node:${sel.elementId}`
    case 'state':
      return `state:${sel.id}`
    case 'state-transition':
      return `state-transition:${sel.elementId}`
    case 'state-note':
      return `state-note:${sel.elementId}`
    case 'er-entity':
      return `er-entity:${sel.name}`
    case 'er-attribute':
      return `er-attribute:${sel.elementId}`
    case 'er-relation':
      return `er-relation:${sel.elementId}`
    case 'gitgraph-commit':
      return `gitgraph-commit:${sel.elementId}`
    case 'gitgraph-branch':
      return `gitgraph-branch:${sel.name}`
    case 'gitgraph-merge':
      return `gitgraph-merge:${sel.elementId}`
    case 'gitgraph-cherry-pick':
      return `gitgraph-cherry-pick:${sel.elementId}`
    case 'timeline-period':
      return `timeline-period:${sel.elementId}`
    case 'timeline-event':
      return `timeline-event:${sel.elementId}`
    case 'timeline-section':
      return `timeline-section:${sel.elementId}`
    case 'kanban-column':
      return `kanban-column:${sel.elementId}`
    case 'kanban-card':
      return `kanban-card:${sel.elementId}`
    case 'requirement':
      return `requirement:${sel.name}`
    case 'requirement-element':
      return `requirement-element:${sel.name}`
    case 'requirement-relation':
      return `requirement-relation:${sel.elementId}`
    case 'journey-task':
      return `journey-task:${sel.elementId}`
    case 'journey-section':
      return `journey-section:${sel.elementId}`
    case 'pie-sector':
      return `pie-sector:${sel.elementId}`
    case 'block-node':
      return `block-node:${sel.id}`
    case 'block-group':
      return `block-group:${sel.id}`
    case 'block-edge':
      return `block-edge:${sel.elementId}`
    case 'sankey-node':
      return `sankey-node:${sel.name}`
    case 'sankey-link':
      return `sankey-link:${sel.elementId}`
    case 'gantt-task':
      return `gantt-task:${sel.elementId}`
    case 'gantt-section':
      return `gantt-section:${sel.elementId}`
    case 'gantt-directive':
      return `gantt-directive:${sel.elementId}`
    case 'quadrant-point':
      return `quadrant-point:${sel.elementId}`
    case 'quadrant-axis':
      return `quadrant-axis:${sel.elementId}`
    case 'quadrant-quadrant':
      return `quadrant-quadrant:${sel.elementId}`
    case 'packet-field':
      return `packet-field:${sel.elementId}`
    case 'xychart-series':
      return `xychart-series:${sel.elementId}`
    case 'xychart-axis':
      return `xychart-axis:${sel.axis}`
    case 'xychart-title':
      return 'xychart-title'
    case 'radar-axis':
      return `radar-axis:${sel.elementId}`
    case 'radar-curve':
      return `radar-curve:${sel.elementId}`
    case 'architecture-service':
      return `architecture-service:${sel.name}`
    case 'architecture-group':
      return `architecture-group:${sel.name}`
    case 'architecture-junction':
      return `architecture-junction:${sel.name}`
    case 'architecture-edge':
      return `architecture-edge:${sel.elementId}`
    case 'architecture-align':
      return `architecture-align:${sel.elementId}`
    case 'treemap-node':
      return `treemap-node:${sel.elementId}`
    case 'ishikawa-node':
      return `ishikawa-node:${sel.elementId}`
    case 'treeview-node':
      return `treeview-node:${sel.elementId}`
  }
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return selectionKey(a) === selectionKey(b)
}
