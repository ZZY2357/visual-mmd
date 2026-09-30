import { describe, expect, it } from 'vitest'
import {
  CLASS_TEMPLATE,
  MINDMAP_TEMPLATE,
  SEQUENCE_TEMPLATE,
  TIMELINE_TEMPLATE,
  type AnyProjection,
} from '../../diagram-registry'
import type { EditIntent } from '../../pipeline/parser'
import { classParser } from '../../pipeline/class'
import { flowchartParser } from '../../pipeline/flowchart'
import { mindmapParser } from '../../pipeline/mindmap'
import { sequenceParser } from '../../pipeline/sequence'
import { timelineParser } from '../../pipeline/timeline'
import { buildClassProjection } from '../../projection/class-projection'
import { buildFlowchartProjection } from '../../projection/flowchart-projection'
import { buildMindmapProjection } from '../../projection/mindmap-projection'
import { buildSequenceProjection } from '../../projection/sequence-projection'
import { buildTimelineProjection } from '../../projection/timeline-projection'
import type { Selection } from '../../projection/selection'
import {
  classDeleteIntent,
  mindmapActionIntents,
  nodeActionIntents,
  sequenceDeleteIntent,
  timelineDeleteIntent,
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

const SUITES = [
  { type: 'flowchart' as const, projection: flowProjection, cases: flowchartCases },
  { type: 'class' as const, projection: classProjection, cases: classCases },
  { type: 'sequence' as const, projection: seqProjection, cases: sequenceCases },
  { type: 'mindmap' as const, projection: mindProjection, cases: mindmapCases },
  { type: 'timeline' as const, projection: timelineProjection, cases: timelineCases },
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
            }
          })()
          // 键盘按选中种类设门（flowchart/mindmap 只删节点）；门内的种类必须与能力包等价
          const keyboardHandles =
            (suite.type === 'flowchart' && sel.kind === 'node') ||
            (suite.type === 'mindmap' && sel.kind === 'mindmap-node') ||
            suite.type === 'class' ||
            suite.type === 'sequence' ||
            suite.type === 'timeline'
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
