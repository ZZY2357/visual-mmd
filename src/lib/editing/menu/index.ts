import type { RegisteredDiagramTypeId } from '../../diagram-registry'
import type { DiagramMenuDefinition } from '../context-menu'
import { flowchartMenu } from './flowchart'
import { sequenceMenu } from './sequence'
import { classMenu } from './class'
import { mindmapMenu } from './mindmap'
import { stateMenu } from './state'
import { erMenu } from './er'
import { gitgraphMenu } from './gitgraph'
import { timelineMenu } from './timeline'
import { kanbanMenu } from './kanban'
import { requirementMenu } from './requirement'
import { journeyMenu } from './journey'
import { pieMenu } from './pie'
import { blockMenu } from './block'
import { sankeyMenu } from './sankey'
import { ganttMenu } from './gantt'
import { quadrantMenu } from './quadrant'
import { packetMenu } from './packet'
import { xychartMenu } from './xychart'
import { radarMenu } from './radar'
import { architectureMenu } from './architecture'
import { treemapMenu } from './treemap'
import { ishikawaMenu } from './ishikawa'
import { wardleyMenu } from './wardley'
import { vennMenu } from './venn'
import { cynefinMenu } from './cynefin'
import { usecaseMenu } from './usecase'
import { treeviewMenu } from './treeview'
import { eventmodelingMenu } from './eventmodeling'
import { agentflowMenu } from './agentflow'
import { zenumlMenu } from './zenuml'
import { c4Menu } from './c4'

/**
 * 图种 → 右键菜单定义（registry `menu` 字段的实参表，architecture-deepening-3 工单 04）。
 * 各图种自己的定义在 `src/lib/editing/menu/<id>.ts`（该图种「菜单长什么样」的成文处，
 * 文案键也随行）。Record 对 RegisteredDiagramTypeId 穷尽——新增图种缺项 tsc 直接红
 * （穷尽性钩子，与 structure-tree/partitions 的 treePartitions 同范式）。
 */
export const diagramMenus: Record<RegisteredDiagramTypeId, DiagramMenuDefinition> = {
  flowchart: flowchartMenu,
  sequence: sequenceMenu,
  class: classMenu,
  mindmap: mindmapMenu,
  state: stateMenu,
  er: erMenu,
  gitgraph: gitgraphMenu,
  timeline: timelineMenu,
  kanban: kanbanMenu,
  requirement: requirementMenu,
  journey: journeyMenu,
  pie: pieMenu,
  block: blockMenu,
  sankey: sankeyMenu,
  gantt: ganttMenu,
  quadrant: quadrantMenu,
  packet: packetMenu,
  xychart: xychartMenu,
  radar: radarMenu,
  architecture: architectureMenu,
  treemap: treemapMenu,
  ishikawa: ishikawaMenu,
  wardley: wardleyMenu,
  venn: vennMenu,
  cynefin: cynefinMenu,
  usecase: usecaseMenu,
  treeview: treeviewMenu,
  eventmodeling: eventmodelingMenu,
  agentflow: agentflowMenu,
  zenuml: zenumlMenu,
  c4: c4Menu,
}
