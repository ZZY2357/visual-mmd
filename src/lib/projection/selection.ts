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
  // kanban（more-diagrams 工单 06）：列是分组元素、卡片是节点元素
  | { kind: 'kanban-column'; elementId: string }
  | { kind: 'kanban-card'; elementId: string }

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
    case 'kanban-column':
      return `kanban-column:${sel.elementId}`
    case 'kanban-card':
      return `kanban-card:${sel.elementId}`
  }
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return selectionKey(a) === selectionKey(b)
}
