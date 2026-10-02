import type { KeyboardEvent } from 'react'
import type { AnyProjection, DiagramTypeId } from '../diagram-registry'
import type { Selection } from '../projection/selection'
import { DIAGRAM_SELECTION } from '../projection/selection'
import { flowchartPartitions } from './flowchart'
import { sequencePartitions } from './sequence'
import { classPartitions } from './class'
import { mindmapPartitions } from './mindmap'
import { statePartitions } from './state'
import { erPartitions } from './er'
import { gitgraphPartitions } from './gitgraph'
import { timelinePartitions } from './timeline'
import { kanbanPartitions } from './kanban'
import { requirementPartitions } from './requirement'
import { journeyPartitions } from './journey'
import { piePartitions } from './pie'
import { blockPartitions } from './block'
import { sankeyPartitions } from './sankey'
import { ganttPartitions } from './gantt'
import { quadrantPartitions } from './quadrant'
import { packetPartitions } from './packet'
import { xychartPartitions } from './xychart'
import { radarPartitions } from './radar'
import { architecturePartitions } from './architecture'
import { treemapPartitions } from './treemap'
import { ishikawaPartitions } from './ishikawa'
import { wardleyPartitions } from './wardley'
import { vennPartitions } from './venn'
import { cynefinPartitions } from './cynefin'
import { usecasePartitions } from './usecase'
import { treeviewPartitions } from './treeview'
import { eventModelingPartitions } from './eventmodeling'
import { agentflowPartitions } from './agentflow'
import { zenumlPartitions } from './zenuml'
import { c4Partitions } from './c4'

/**
 * 结构树分区的**跨图种通用件**（architecture-deepening-3 工单 02 物理归位后）：
 * 各图种自己的分区构造已迁到 `src/lib/structure-tree/<id>.ts`（该图种「结构树显示什么」
 * 的成文处；行内键盘 onKeyDown 也随分区同文件，键 → plan 走 `pipeline/<id>-keyboard`，
 * 执行交给 `pipeline/key-plan` 的唯一执行器 applyPlan——结构树层不再依赖编辑层）。
 * 本模块只保留：条目/分区的数据形状（TreeEntry / TreeSection）、求值语境与类型
 * （TreePartitionsContext / TreePartitions）、图表级首分区 helpers（diagramSection /
 * withDiagramLabel），以及 registry `tree` 字段的实参表 treePartitions——Record 对
 * DiagramTypeId 穷尽，新增图种缺项 tsc 直接红（穷尽性钩子）。
 *
 * StructureTree 的渲染 JSX 因此只有一份：图表级行 + 若干「标题（计数）+ 条目」分区。
 * mindmap 的树形缩进用条目的 `children` 表达（深度即缩进层级），渲染器递归展开。
 */

/** 树分区里的一个条目：显示 + 选中 + （mindmap）树形嵌套与键盘 */
export interface TreeEntry {
  /** React key（elementId / nodeId / 组合键） */
  key: string
  label: string
  detail?: string
  /** 缩进层级（TreeItem 的 paddingLeft 档位） */
  depth: number
  /** 点击后写入编辑器 store 的选中 */
  selection: Selection
  /** 子条目（mindmap 树形；平面分区不带） */
  children?: TreeEntry[]
  /** 键盘处理（mindmap 树节点的 Tab / Enter 增删层级；工单 08） */
  onKeyDown?: (e: KeyboardEvent) => void
}

/** 树的一个分区：可选标题行（带可选计数）+ 条目列表（可选空态文案） */
export interface TreeSection {
  /** React key */
  key: string
  /** 标题行文案；undefined = 无标题行（图表级首分区） */
  heading?: string
  /** 标题行尾的（N）计数；undefined = 不显示计数（mindmap 的提示行） */
  count?: number
  /** entries 为空时显示的占位文案（mindmap 空态） */
  emptyText?: string
  entries: TreeEntry[]
}

/** 图种 → 结构树分区描述（注册表 `tree` 字段的类型） */
/** i18n 文案函数（用窄签名而非 TFunction 品牌类型，测试可注纯函数） */
export type Translate = (key: string, opts?: Record<string, unknown>) => string

export interface TreePartitionsContext {
  t: Translate
}

/** 图种 → 结构树分区描述（注册表 `tree` 字段的类型） */
export type TreePartitions = (projection: AnyProjection, ctx: TreePartitionsContext) => TreeSection[]

/** 图表级首分区：四个图种共用（label = diagram，depth 0，选中 diagram） */
export function diagramSection(detail: string | undefined): TreeSection {
  return {
    key: 'diagram',
    entries: [
      {
        key: 'diagram',
        label: '@@DIAGRAM',
        detail,
        depth: 0,
        selection: DIAGRAM_SELECTION,
      },
    ],
  }
}

// label 的真实文案需要 t；图表级 label 在求值时由渲染器补（避免这里引 i18n）
export function withDiagramLabel(section: TreeSection, label: string): TreeSection {
  const [entry] = section.entries
  return { ...section, entries: [{ ...entry, label }, ...section.entries.slice(1)] }
}

/** 图种 → 分区描述（注册表 `tree` 字段的实参，registry 只持引用） */
export const treePartitions: Record<DiagramTypeId, TreePartitions> = {
  flowchart: flowchartPartitions,
  sequence: sequencePartitions,
  class: classPartitions,
  mindmap: mindmapPartitions,
  state: statePartitions,
  er: erPartitions,
  gitgraph: gitgraphPartitions,
  timeline: timelinePartitions,
  kanban: kanbanPartitions,
  requirement: requirementPartitions,
  journey: journeyPartitions,
  pie: piePartitions,
  block: blockPartitions,
  sankey: sankeyPartitions,
  gantt: ganttPartitions,
  quadrant: quadrantPartitions,
  packet: packetPartitions,
  xychart: xychartPartitions,
  radar: radarPartitions,
  architecture: architecturePartitions,
  treemap: treemapPartitions,
  ishikawa: ishikawaPartitions,
  wardley: wardleyPartitions,
  venn: vennPartitions,
  cynefin: cynefinPartitions,
  usecase: usecasePartitions,
  treeview: treeviewPartitions,
  eventmodeling: eventModelingPartitions,
  agentflow: agentflowPartitions,
  zenuml: zenumlPartitions,
  c4: c4Partitions,
}
