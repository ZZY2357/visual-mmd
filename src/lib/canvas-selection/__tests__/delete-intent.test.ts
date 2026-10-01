import { describe, expect, it } from 'vitest'
import {
  BLOCK_TEMPLATE,
  ARCHITECTURE_TEMPLATE,
  CLASS_TEMPLATE,
  GANTT_TEMPLATE,
  PACKET_TEMPLATE,
  KANBAN_TEMPLATE,
  MINDMAP_TEMPLATE,
  SANKEY_TEMPLATE,
  SEQUENCE_TEMPLATE,
  TIMELINE_TEMPLATE,
  XYCHART_TEMPLATE,
  ISHIKAWA_TEMPLATE,
  VENN_TEMPLATE,
  USECASE_TEMPLATE,
  type AnyProjection,
} from '../../diagram-registry'
import type { EditIntent } from '../../pipeline/parser'
import { classParser } from '../../pipeline/class'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { sequenceParser } from '../../pipeline/sequence'
import { timelineParser } from '../../pipeline/timeline'
import { kanbanParser } from '../../pipeline/kanban'
import { blockParser } from '../../pipeline/block'
import { sankeyParser } from '../../pipeline/sankey'
import { ganttParser } from '../../pipeline/gantt'
import { packetParser } from '../../pipeline/packet'
import { xychartParser } from '../../pipeline/xychart'
import { architectureParser } from '../../pipeline/architecture'
import { ishikawaParser } from '../../pipeline/ishikawa'
import { vennParser } from '../../pipeline/venn'
import { usecaseParser } from '../../pipeline/usecase'
import { buildClassProjection } from '../../projection/class-projection'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { buildSequenceProjection } from '../../projection/sequence-projection'
import { buildTimelineProjection } from '../../projection/timeline-projection'
import { buildKanbanProjection } from '../../projection/kanban-projection'
import { buildBlockProjection } from '../../projection/block-projection'
import { buildSankeyProjection } from '../../projection/sankey-projection'
import { buildGanttProjection } from '../../projection/gantt-projection'
import { buildPacketProjection } from '../../projection/packet-projection'
import { buildXychartProjection } from '../../projection/xychart-projection'
import { buildArchitectureProjection } from '../../projection/architecture-projection'
import { buildIshikawaProjection } from '../../projection/ishikawa-projection'
import { buildVennProjection } from '../../projection/venn-projection'
import { buildUsecaseProjection } from '../../projection/usecase-projection'
import type { Selection } from '../../projection/selection'
import {
  blockDeleteIntent,
  classDeleteIntent,
  ganttDeleteIntent,
  packetDeleteIntent,
  kanbanDeleteIntent,
  mindmapActionIntents,
  nodeActionIntents,
  sankeyDeleteIntent,
  sequenceDeleteIntent,
  timelineDeleteIntent,
  xychartDeleteIntent,
  architectureDeleteIntent,
  ishikawaDeleteIntent,
  vennDeleteIntent,
  usecaseDeleteIntent,
} from '../../editing/canvas-keyboard'
import {
  deleteClassDefIntent,
  deleteEdgeIntent,
  deleteNodeIntent,
  deleteSubgraphIntent,
} from '../../editing/flowchart-forms'
import {
  deleteClassIntent,
  deleteMemberIntent,
  deleteNoteIntent as deleteClassNoteIntent,
  deleteRelationIntent,
} from '../../editing/class-forms'
import {
  deleteBlockIntent,
  deleteMessageIntent,
  deleteNoteIntent as deleteSequenceNoteIntent,
  deleteParticipantIntent,
} from '../../editing/sequence-forms'
import { deleteMindmapNodeIntent } from '../../editing/mindmap-forms'
import { MENU_ACTIONS, type MenuActionContext } from '../../editing/menu-actions'
import { selectionOfMenuTarget } from '../selection-codec'
import type { ContextMenuTarget } from '../../editing/context-menu'
import { capabilitiesOf } from '../capabilities'

/**
 * deleteIntent 等价性（architecture-deepening-2 工单 03）：
 * 「选中种类 → 删除意图」的唯一映射上能力包（与 resolveSelection 同形，ADR-0015），
 * 三个删除入口——键盘 Delete、右键菜单 deleteTarget、属性面板删除按钮——对同一
 * selection 必须产出同一意图。本文件用**替身语境 / 纯函数**钉住等价性，不依赖 DOM。
 *
 * - 能力包入口：capabilitiesOf(projection).deleteIntent(projection, selection)
 * - 键盘入口：canvas-keyboard 的纯函数（class/sequence 直呼；flowchart/mindmap 经
 *   nodeActionIntents / mindmapActionIntents 的 'delete' 动作）
 * - 右键菜单入口：MENU_ACTIONS 的 delete-* 动作经 MenuActionContext 替身分发，
 *   目标先经 selectionOfMenuTarget 转成 selection（与「选中该目标」同一份映射）
 * - 属性面板入口：各表单按钮调用的 delete*Intent 构造器（属性面板的选中先经
 *   能力包 resolveSelection 回落，存在性由它保证）
 */

const FLOW_SOURCE = `flowchart TD
    A[开始] --> B[处理]
    subgraph 组
        C[子]
    end
    classDef highlight fill:#fff3bf
`

function flowProjection(): Extract<AnyProjection, { type: 'flowchart' }> {
  const parsed = flowchartParser.parse(FLOW_SOURCE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'flowchart', flowchart: buildFlowchartProjection(parsed.doc) }
}
function classProjection(): Extract<AnyProjection, { type: 'class' }> {
  const parsed = classParser.parse(CLASS_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'class', class: buildClassProjection(parsed.doc) }
}
function seqProjection(): Extract<AnyProjection, { type: 'sequence' }> {
  const parsed = sequenceParser.parse(SEQUENCE_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'sequence', sequence: buildSequenceProjection(parsed.doc) }
}
function mindProjection(): Extract<AnyProjection, { type: 'mindmap' }> {
  const parsed = mindmapParser.parse(MINDMAP_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'mindmap', mindmap: buildMindmapProjection(parsed.doc) }
}
function timelineProjection(): Extract<AnyProjection, { type: 'timeline' }> {
  const parsed = timelineParser.parse(TIMELINE_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'timeline', timeline: buildTimelineProjection(parsed.doc) }
}
function kanbanProjection(): Extract<AnyProjection, { type: 'kanban' }> {
  const parsed = kanbanParser.parse(KANBAN_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'kanban', kanban: buildKanbanProjection(parsed.doc) }
}
function blockProjection(): Extract<AnyProjection, { type: 'block' }> {
  const parsed = blockParser.parse(BLOCK_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'block', block: buildBlockProjection(parsed.doc) }
}
function sankeyProjection(): Extract<AnyProjection, { type: 'sankey' }> {
  const parsed = sankeyParser.parse(SANKEY_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'sankey', sankey: buildSankeyProjection(parsed.doc) }
}
function ganttProjection(): Extract<AnyProjection, { type: 'gantt' }> {
  const parsed = ganttParser.parse(GANTT_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'gantt', gantt: buildGanttProjection(parsed.doc) }
}
function packetProjection(): Extract<AnyProjection, { type: 'packet' }> {
  const parsed = packetParser.parse(PACKET_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'packet', packet: buildPacketProjection(parsed.doc) }
}

/** 每个图种的一组「selection → 属性面板删除按钮会提交的意图」用例 */
interface DeleteCase {
  /** 用例名 */
  name: string
  selection: Selection
  /** 属性面板删除按钮提交的意图（delete*Intent 构造器的产物） */
  panelIntent: EditIntent
  /** 右键菜单目标（无对应菜单项的省略——如 classDef 不能右键） */
  menuTarget?: ContextMenuTarget
  /** 菜单项 id（menuTarget 存在时必填） */
  menuItemId?: string
}

function flowchartCases(p: ReturnType<typeof flowProjection>): DeleteCase[] {
  const node = p.flowchart.nodes[0]
  const edge = p.flowchart.edges[0]
  const sg = p.flowchart.subgraphs[0]
  const cd = p.flowchart.classDefs[0]
  return [
    {
      name: 'node',
      selection: { kind: 'node', nodeId: node.nodeId },
      panelIntent: deleteNodeIntent(node.nodeId),
      menuTarget: { kind: 'flowchart-node', nodeId: node.nodeId },
      menuItemId: 'delete',
    },
    {
      name: 'edge',
      selection: { kind: 'edge', from: edge.from, to: edge.to, occurrence: edge.occurrence },
      panelIntent: deleteEdgeIntent(edge.from, edge.to, edge.occurrence),
      menuTarget: { kind: 'flowchart-edge', from: edge.from, to: edge.to, occurrence: edge.occurrence },
      menuItemId: 'delete',
    },
    { name: 'subgraph', selection: { kind: 'subgraph', elementId: sg.elementId }, panelIntent: deleteSubgraphIntent(sg.elementId) },
    { name: 'classdef', selection: { kind: 'classdef', name: cd.name }, panelIntent: deleteClassDefIntent(cd.name) },
  ]
}

function classCases(p: ReturnType<typeof classProjection>): DeleteCase[] {
  const cls = p.class.classes[0]
  const member = p.class.members[0]
  const relation = p.class.relations[0]
  const note = p.class.notes[0]
  return [
    {
      name: 'class',
      selection: { kind: 'class', name: cls.name },
      panelIntent: deleteClassIntent(cls.name),
      menuTarget: { kind: 'class-node', name: cls.name },
      menuItemId: 'delete-class',
    },
    { name: 'class-member', selection: { kind: 'class-member', elementId: member.elementId }, panelIntent: deleteMemberIntent(member.elementId) },
    {
      name: 'class-relation',
      selection: { kind: 'class-relation', elementId: relation.elementId },
      panelIntent: deleteRelationIntent(relation.elementId),
      menuTarget: { kind: 'class-relation', elementId: relation.elementId },
      menuItemId: 'delete-relation',
    },
    { name: 'class-note', selection: { kind: 'class-note', elementId: note.elementId }, panelIntent: deleteClassNoteIntent(note.elementId) },
  ]
}

function sequenceCases(p: ReturnType<typeof seqProjection>): DeleteCase[] {
  const participant = p.sequence.participants[0]
  const message = p.sequence.messages[0]
  const note = p.sequence.notes[0]
  const block = p.sequence.blocks.find((b) => b.keyword !== 'else' && b.keyword !== 'and')
  if (block === undefined) throw new Error('模板必须含逻辑块')
  return [
    {
      name: 'participant',
      selection: { kind: 'participant', actorId: participant.actorId },
      panelIntent: deleteParticipantIntent(participant.actorId),
      menuTarget: { kind: 'sequence-participant', actorId: participant.actorId },
      menuItemId: 'delete-participant',
    },
    {
      name: 'message',
      selection: { kind: 'message', elementId: message.elementId },
      panelIntent: deleteMessageIntent(message.elementId),
      menuTarget: { kind: 'sequence-message', elementId: message.elementId },
      menuItemId: 'delete-message',
    },
    {
      name: 'note',
      selection: { kind: 'note', elementId: note.elementId },
      panelIntent: deleteSequenceNoteIntent(note.elementId),
    },
    {
      name: 'block',
      selection: { kind: 'block', elementId: block.elementId },
      panelIntent: deleteBlockIntent(block.elementId),
      menuTarget: { kind: 'sequence-block', elementId: block.elementId },
      menuItemId: 'delete-block',
    },
  ]
}

function mindmapCases(p: ReturnType<typeof mindProjection>): DeleteCase[] {
  const node = p.mindmap.nodes[0]
  return [
    {
      name: 'mindmap-node',
      selection: { kind: 'mindmap-node', elementId: node.elementId },
      panelIntent: deleteMindmapNodeIntent(node.elementId),
      menuTarget: { kind: 'mindmap-node', elementId: node.elementId },
      menuItemId: 'delete',
    },
  ]
}

function timelineCases(p: ReturnType<typeof timelineProjection>): DeleteCase[] {
  const period = p.timeline.periods[0]
  const event = p.timeline.events[0]
  return [
    {
      name: 'timeline-period',
      selection: { kind: 'timeline-period', elementId: period.elementId },
      panelIntent: timelineDeleteIntent(p.timeline, { kind: 'timeline-period', elementId: period.elementId })!,
      menuTarget: { kind: 'timeline-period', elementId: period.elementId },
      menuItemId: 'delete',
    },
    {
      name: 'timeline-event',
      selection: { kind: 'timeline-event', elementId: event.elementId },
      panelIntent: timelineDeleteIntent(p.timeline, { kind: 'timeline-event', elementId: event.elementId })!,
      menuTarget: { kind: 'timeline-event', elementId: event.elementId },
      menuItemId: 'delete',
    },
  ]
}

/** kanban（more-diagrams 工单 06）：列（级联卡片）与卡片各一条删除入口 */
function kanbanCases(p: ReturnType<typeof kanbanProjection>): DeleteCase[] {
  const column = p.kanban.columns[0]
  const card = p.kanban.cards[0]
  return [
    {
      name: 'kanban-column',
      selection: { kind: 'kanban-column', elementId: column.elementId },
      panelIntent: { type: 'delete-column', elementId: column.elementId },
      menuTarget: { kind: 'kanban-column', elementId: column.elementId },
      menuItemId: 'delete',
    },
    {
      name: 'kanban-card',
      selection: { kind: 'kanban-card', elementId: card.elementId },
      panelIntent: { type: 'delete-card', elementId: card.elementId },
      menuTarget: { kind: 'kanban-card', elementId: card.elementId },
      menuItemId: 'delete',
    },
  ]
}

/** block（more-diagrams 工单 09）：块节点（级联触及边）、嵌套块、边各一条删除入口 */
function blockCases(p: ReturnType<typeof blockProjection>): DeleteCase[] {
  const node = p.block.nodes[0]
  const group = p.block.groups[0]
  const edge = p.block.edges[0]
  return [
    {
      name: 'block-node',
      selection: { kind: 'block-node', id: node.id },
      panelIntent: { type: 'delete-node', id: node.id },
      menuTarget: { kind: 'block-node', id: node.id },
      menuItemId: 'delete',
    },
    {
      name: 'block-group',
      selection: { kind: 'block-group', id: group.id },
      panelIntent: { type: 'delete-group', id: group.id },
      menuTarget: { kind: 'block-group', id: group.id },
      menuItemId: 'delete',
    },
    {
      name: 'block-edge',
      selection: { kind: 'block-edge', elementId: edge.elementId },
      panelIntent: { type: 'delete-edge', elementId: edge.elementId },
      menuTarget: { kind: 'block-edge', elementId: edge.elementId },
      menuItemId: 'delete',
    },
  ]
}

/** sankey（more-diagrams 工单 13）：链路一条删除入口。节点不落码（链路行去重派生），
 * 没有「删除节点」的语法动作，不进 DeleteCase（能力包对 sankey-node 恒返回 null，
 * 由「存在性重校验」用例的 foreign / gone 分支覆盖） */
function sankeyCases(p: ReturnType<typeof sankeyProjection>): DeleteCase[] {
  const link = p.sankey.links[0]
  return [
    {
      name: 'sankey-link',
      selection: { kind: 'sankey-link', elementId: link.elementId },
      panelIntent: { type: 'delete-link', elementId: link.elementId },
      menuTarget: { kind: 'sankey-link', elementId: link.elementId },
      menuItemId: 'delete',
    },
  ]
}

/** gantt（more-diagrams 工单 11）：任务（section 级联）与 section（级联任务）各一条删除入口；
 * 画布无元素级菜单目标（工单定案，与 journey/pie 同口径）——panelIntent = 表单删除按钮直落的意图 */
function ganttCases(p: ReturnType<typeof ganttProjection>): DeleteCase[] {
  const task = p.gantt.tasks[0]
  const section = p.gantt.sections[0]
  return [
    {
      name: 'gantt-task',
      selection: { kind: 'gantt-task', elementId: task.elementId },
      panelIntent: { type: 'delete-task', elementId: task.elementId },
    },
    {
      name: 'gantt-section',
      selection: { kind: 'gantt-section', elementId: section.elementId },
      panelIntent: { type: 'delete-section', elementId: section.elementId },
    },
  ]
}

/** packet（more-diagrams 工单 16）：字段一条删除入口，字段有画布菜单目标
 *（start-bit 映射反注 data-id）；显式起点字段的删除由管线连续性校验拒绝落码（安静无动作） */
function packetCases(p: ReturnType<typeof packetProjection>): DeleteCase[] {
  const field = p.packet.fields[0]
  return [
    {
      name: 'packet-field',
      selection: { kind: 'packet-field', elementId: field.elementId },
      panelIntent: { type: 'delete-field', elementId: field.elementId },
      menuTarget: { kind: 'packet-field', elementId: field.elementId },
      menuItemId: 'delete',
    },
  ]
}

/** xychartProjection：xychart 投影（工单 14） */
function xychartProjection(): Extract<AnyProjection, { type: 'xychart' }> {
  const parsed = xychartParser.parse(XYCHART_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'xychart', xychart: buildXychartProjection(parsed.doc) }
}

/** xychart（more-diagrams 工单 14）：系列一条删除入口。轴与标题是文档级属性元素，
 * 没有「删除」的语法动作，不进 DeleteCase（能力包对 xychart-axis / xychart-title 恒返回
 * null，由「存在性重校验」用例的 foreign / gone 分支覆盖） */
function xychartCases(p: ReturnType<typeof xychartProjection>): DeleteCase[] {
  const series = p.xychart.series[0]
  return [
    {
      name: 'xychart-series',
      selection: { kind: 'xychart-series', elementId: series.elementId },
      panelIntent: { type: 'delete-series', elementId: series.elementId },
      menuTarget: { kind: 'xychart-series', elementId: series.elementId },
      menuItemId: 'delete',
    },
  ]
}

/** ishikawaProjection：ishikawa 投影（more-diagrams 工单 22） */
function ishikawaProjection(): Extract<AnyProjection, { type: 'ishikawa' }> {
  const parsed = ishikawaParser.parse(ISHIKAWA_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'ishikawa', ishikawa: buildIshikawaProjection(parsed.doc) }
}

/** ishikawa（more-diagrams 工单 22）：主因（一级因果，连同分支）一条删除入口。
 * 鱼头（root）没有删除的语法动作（删掉会让整图失去问题本身，工单定案），不进 DeleteCase
 * （能力包对鱼头恒返回 null，由「存在性重校验」用例的 foreign / gone 分支覆盖）。 */
function ishikawaCases(p: ReturnType<typeof ishikawaProjection>): DeleteCase[] {
  const cause = p.ishikawa.nodes.find((n) => n.depth === 1)
  if (cause === undefined) throw new Error('模板必须含主因')
  return [
    {
      name: 'ishikawa-node',
      selection: { kind: 'ishikawa-node', elementId: cause.elementId },
      panelIntent: { type: 'delete-node', elementId: cause.elementId },
    },
  ]
}

/** architectureProjection：architecture 投影（more-diagrams 工单 17） */
function architectureProjection(): Extract<AnyProjection, { type: 'architecture' }> {
  const parsed = architectureParser.parse(ARCHITECTURE_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'architecture', architecture: buildArchitectureProjection(parsed.doc) }
}

/** architecture（more-diagrams 工单 17）：service / group / junction / 边 / align 五类
 * 删除入口各一条（group 级联 = 成员摘回顶层；align 无画布菜单目标，只走能力包与表单） */
function architectureCases(p: ReturnType<typeof architectureProjection>): DeleteCase[] {
  const service = p.architecture.services[0]
  const group = p.architecture.groups[0]
  const junction = p.architecture.junctions[0]
  const edge = p.architecture.edges[0]
  const align = p.architecture.aligns[0]
  const cases: DeleteCase[] = [
    {
      name: 'architecture-service',
      selection: { kind: 'architecture-service', name: service.id },
      panelIntent: { type: 'delete-service', id: service.id },
      menuTarget: { kind: 'architecture-service', name: service.id },
      menuItemId: 'delete',
    },
    {
      name: 'architecture-group',
      selection: { kind: 'architecture-group', name: group.id },
      panelIntent: { type: 'delete-group', id: group.id },
      menuTarget: { kind: 'architecture-group', name: group.id },
      menuItemId: 'delete',
    },
    {
      name: 'architecture-junction',
      selection: { kind: 'architecture-junction', name: junction.id },
      panelIntent: { type: 'delete-junction', id: junction.id },
      menuTarget: { kind: 'architecture-junction', name: junction.id },
      menuItemId: 'delete',
    },
    {
      name: 'architecture-edge',
      selection: { kind: 'architecture-edge', elementId: edge.elementId },
      panelIntent: { type: 'delete-edge', elementId: edge.elementId },
    },
  ]
  if (align !== undefined) {
    cases.push({
      name: 'architecture-align',
      selection: { kind: 'architecture-align', elementId: align.elementId },
      panelIntent: { type: 'delete-align', elementId: align.elementId },
    })
  }
  return cases
}

/** vennProjection：venn 投影（more-diagrams 工单 21） */
function vennProjection(): Extract<AnyProjection, { type: 'venn' }> {
  const parsed = vennParser.parse(VENN_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'venn', venn: buildVennProjection(parsed.doc) }
}

/** venn（more-diagrams 工单 21）：集合 / 交集两类删除入口各一条（删集合连带删交集由管线负责） */
function vennCases(p: ReturnType<typeof vennProjection>): DeleteCase[] {
  const set = p.venn.sets[0]
  const union = p.venn.unions[0]
  return [
    {
      name: 'venn-set',
      selection: { kind: 'venn-set', id: set.ids[0] },
      panelIntent: { type: 'delete-area', elementId: set.elementId },
      menuTarget: { kind: 'venn-set', id: set.ids[0] },
      menuItemId: 'delete',
    },
    {
      name: 'venn-union',
      selection: { kind: 'venn-union', elementId: union.elementId },
      panelIntent: { type: 'delete-area', elementId: union.elementId },
      menuTarget: { kind: 'venn-union', elementId: union.elementId },
      menuItemId: 'delete',
    },
  ]
}

/** usecaseProjection：usecase 投影（more-diagrams 工单 26） */
function usecaseProjection(): Extract<AnyProjection, { type: 'usecase' }> {
  const parsed = usecaseParser.parse(USECASE_TEMPLATE)
  if (!parsed.ok) throw new Error(parsed.error.message)
  return { type: 'usecase', usecase: buildUsecaseProjection(parsed.doc) }
}

/** usecase（more-diagrams 工单 26）：actor / 用例 / 关系三类删除入口各一条
 *（删节点连带删关系与 note、删边界连带删 end 由管线负责） */
function usecaseCases(p: ReturnType<typeof usecaseProjection>): DeleteCase[] {
  const actor = p.usecase.nodes.find((n) => n.nodeKind === 'actor')
  const kase = p.usecase.nodes.find((n) => n.nodeKind === 'usecase')
  const relation = p.usecase.relations[0]
  if (actor === undefined || kase === undefined || relation === undefined) {
    throw new Error('USECASE_TEMPLATE 必须含 actor / 用例 / 关系')
  }
  return [
    {
      name: 'usecase-actor',
      selection: { kind: 'usecase-actor', elementId: actor.elementId },
      panelIntent: { type: 'delete-usecase-element', elementId: actor.elementId },
      menuTarget: { kind: 'usecase-actor', elementId: actor.elementId },
      menuItemId: 'delete',
    },
    {
      name: 'usecase-usecase',
      selection: { kind: 'usecase-usecase', elementId: kase.elementId },
      panelIntent: { type: 'delete-usecase-element', elementId: kase.elementId },
      menuTarget: { kind: 'usecase-usecase', elementId: kase.elementId },
      menuItemId: 'delete',
    },
    {
      name: 'usecase-relation',
      selection: { kind: 'usecase-relation', elementId: relation.elementId },
      panelIntent: { type: 'delete-usecase-relation', elementId: relation.elementId },
      menuTarget: { kind: 'usecase-relation', elementId: relation.elementId },
      menuItemId: 'delete',
    },
  ]
}

const SUITES = [
  { type: 'flowchart' as const, projection: flowProjection, cases: flowchartCases },
  { type: 'class' as const, projection: classProjection, cases: classCases },
  { type: 'sequence' as const, projection: seqProjection, cases: sequenceCases },
  { type: 'mindmap' as const, projection: mindProjection, cases: mindmapCases },
  { type: 'timeline' as const, projection: timelineProjection, cases: timelineCases },
  { type: 'kanban' as const, projection: kanbanProjection, cases: kanbanCases },
  { type: 'block' as const, projection: blockProjection, cases: blockCases },
  { type: 'sankey' as const, projection: sankeyProjection, cases: sankeyCases },
  { type: 'gantt' as const, projection: ganttProjection, cases: ganttCases },
  { type: 'packet' as const, projection: packetProjection, cases: packetCases },
  { type: 'xychart' as const, projection: xychartProjection, cases: xychartCases },
  { type: 'architecture' as const, projection: architectureProjection, cases: architectureCases },
  { type: 'ishikawa' as const, projection: ishikawaProjection, cases: ishikawaCases },
  { type: 'venn' as const, projection: vennProjection, cases: vennCases },
  { type: 'usecase' as const, projection: usecaseProjection, cases: usecaseCases },
]

describe('deleteIntent 等价性：三个删除入口对同一 selection 产出同一意图（工单 03）', () => {
  for (const suite of SUITES) {
    describe(suite.type, () => {
      const projection = suite.projection()
      const caps = capabilitiesOf(projection)

      // cases 函数各自收窄到具体图种投影；表驱动处统一按并集调用（一次收窄豁免）
      const casesOf = suite.cases as (p: typeof projection) => DeleteCase[]
      for (const c of casesOf(projection)) {
        it(`${c.name}：能力包 = 属性面板按钮意图`, () => {
          expect(caps.deleteIntent(projection, c.selection)).toEqual(c.panelIntent)
        })

        it(`${c.name}：能力包 = 键盘删除纯函数意图（键盘按选中种类设门，门外键不产出意图）`, () => {
          const sel = c.selection
          const viaKeyboard = (() => {
            // 按投影图种分发（与 suite.type 一致；switch 投影以收窄字段）
            switch (projection.type) {
              case 'flowchart':
                // 键盘只对 node 选中落删除意图（edge/subgraph/classdef 的删除入口是
                // 右键菜单与属性面板）；kind 门在 use-canvas-keyboard 内
                return sel.kind === 'node'
                  ? (nodeActionIntents(projection.flowchart, sel.nodeId, 'delete')?.intents[0] ?? null)
                  : null
              case 'mindmap':
                return sel.kind === 'mindmap-node'
                  ? (mindmapActionIntents(projection.mindmap, sel.elementId, 'delete', '新节点')?.intents[0] ?? null)
                  : null
              case 'class':
                return classDeleteIntent(projection.class, sel)
              case 'sequence':
                return sequenceDeleteIntent(projection.sequence, sel)
              case 'timeline':
                return timelineDeleteIntent(projection.timeline, sel)
              case 'kanban':
                return kanbanDeleteIntent(projection.kanban, sel)
              case 'block':
                return blockDeleteIntent(projection.block, sel)
              case 'sankey':
                return sankeyDeleteIntent(projection.sankey, sel)
              case 'gantt':
                return ganttDeleteIntent(projection.gantt, sel)
              case 'packet':
                return packetDeleteIntent(projection.packet, sel)
              case 'xychart':
                return xychartDeleteIntent(projection.xychart, sel)
              case 'architecture':
                return architectureDeleteIntent(projection.architecture, sel)
              case 'ishikawa':
                return ishikawaDeleteIntent(projection.ishikawa, sel)
              case 'venn':
                return vennDeleteIntent(projection.venn, sel)
              case 'usecase':
                return usecaseDeleteIntent(projection.usecase, sel)
            }
          })()
          // 键盘按选中种类设门（flowchart/mindmap 只删节点）；门内的种类必须与能力包等价
          const keyboardHandles =
            (suite.type === 'flowchart' && sel.kind === 'node') ||
            (suite.type === 'mindmap' && sel.kind === 'mindmap-node') ||
            suite.type === 'class' ||
            suite.type === 'sequence' ||
            suite.type === 'timeline' ||
            suite.type === 'kanban' ||
            suite.type === 'block' ||
            suite.type === 'sankey' ||
            suite.type === 'gantt' ||
            suite.type === 'packet' ||
            suite.type === 'xychart' ||
            suite.type === 'architecture' ||
            suite.type === 'ishikawa' ||
            suite.type === 'venn' ||
            suite.type === 'usecase'
          if (!keyboardHandles) {
            expect(viaKeyboard).toBeNull() // 门外：键盘安静地不产出意图（零变化护栏）
            return
          }
          expect(viaKeyboard).toEqual(c.panelIntent)
          expect(caps.deleteIntent(projection, sel)).toEqual(viaKeyboard)
        })

        if (c.menuTarget !== undefined && c.menuItemId !== undefined) {
          it(`${c.name}：能力包 = 右键菜单 deleteTarget 分发的意图`, () => {
            // 菜单目标先经 selectionOfMenuTarget（与「选中该目标」同一份映射）再查能力包
            const selection = selectionOfMenuTarget(c.menuTarget!)
            expect(selection).toEqual(c.selection)
            const intents: EditIntent[] = []
            const selections: (Selection | null)[] = []
            let closed = 0
            const ctx: MenuActionContext = {
              projection,
              selection: null,
              commitIntent: (intent) => {
                intents.push(intent)
                return true
              },
              select: (s) => selections.push(s),
              openForm: () => {},
              openStyleForm: () => {},
              beginInlineEdit: () => {},
              enterLinkMode: () => {},
              newNodeText: '新节点',
              close: () => {
                closed += 1
              },
            }
            const action = MENU_ACTIONS[c.menuItemId as keyof typeof MENU_ACTIONS]
            expect(action).toBeDefined()
            action(ctx, c.menuTarget)
            expect(intents).toEqual([c.panelIntent])
            expect(selections).toEqual([null])
            expect(closed).toBe(1)
          })
        }
      }

      it('存在性重校验归能力包：已不存在的选中 / null / 图表级 / 别种选中 → null', () => {
        expect(caps.deleteIntent(projection, null)).toBeNull()
        expect(caps.deleteIntent(projection, { kind: 'diagram' })).toBeNull()

        const gone: Record<string, Selection> = {
          flowchart: { kind: 'node', nodeId: '__不存在__' },
          class: { kind: 'class', name: '__不存在__' },
          sequence: { kind: 'participant', actorId: '__不存在__' },
          mindmap: { kind: 'mindmap-node', elementId: 'mindmap-node:999' },
          timeline: { kind: 'timeline-period', elementId: 'period:999' },
          kanban: { kind: 'kanban-card', elementId: 'kanban-card:__不存在__' },
          block: { kind: 'block-node', id: '__不存在__' },
          sankey: { kind: 'sankey-link', elementId: 'link:999' },
          gantt: { kind: 'gantt-task', elementId: 'task:999' },
          packet: { kind: 'packet-field', elementId: 'field:999' },
          xychart: { kind: 'xychart-series', elementId: 'series:999' },
          architecture: { kind: 'architecture-service', name: '__不存在__' },
          ishikawa: { kind: 'ishikawa-node', elementId: 'ishikawa-node:999' },
          venn: { kind: 'venn-set', id: '__不存在__' },
          usecase: { kind: 'usecase-usecase', elementId: 'usecase:__不存在__' },
        }
        expect(caps.deleteIntent(projection, gone[suite.type])).toBeNull()

        // 别种图种的选中种类不归本能力包解析
        const foreign: Selection =
          suite.type === 'flowchart'
            ? { kind: 'participant', actorId: '甲' }
            : { kind: 'node', nodeId: 'A' }
        expect(caps.deleteIntent(projection, foreign)).toBeNull()
      })
    })
  }
})
