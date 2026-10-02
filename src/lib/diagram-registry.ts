import type { SourceDocument } from './pipeline/document'
import type { DiagramParser } from './pipeline/parser'
import { flowchartParser } from './pipeline/flowchart'
import { sequenceParser } from './pipeline/sequence'
import { classParser } from './pipeline/class'
import { mindmapParser } from './pipeline/mindmap'
import { stateParser } from './pipeline/state'
import { erParser } from './pipeline/er'
import { gitgraphParser } from './pipeline/gitgraph'
import { timelineParser } from './pipeline/timeline'
import { kanbanParser } from './pipeline/kanban'
import { requirementParser } from './pipeline/requirement'
import { journeyParser } from './pipeline/journey'
import { pieParser } from './pipeline/pie'
import { blockParser } from './pipeline/block'
import { sankeyParser } from './pipeline/sankey'
import { ganttParser } from './pipeline/gantt'
import { quadrantParser } from './pipeline/quadrant'
import { xychartParser } from './pipeline/xychart'
import { radarParser } from './pipeline/radar'
import { architectureParser } from './pipeline/architecture'
import { treemapParser } from './pipeline/treemap'
import { ishikawaParser } from './pipeline/ishikawa'
import { wardleyParser } from './pipeline/wardley'
import { vennParser } from './pipeline/venn'
import { cynefinParser } from './pipeline/cynefin'
import { usecaseParser } from './pipeline/usecase'
import { treeviewParser } from './pipeline/treeview'
import { eventModelingParser } from './pipeline/eventmodeling'
import { agentflowParser } from './pipeline/agentflow'
import { zenumlParser } from './pipeline/zenuml'
import { c4Parser } from './pipeline/c4'
import { frontmatterEnd } from './pipeline/frontmatter'
import { buildFlowchartProjection, type FlowchartProjection } from './projection/flowchart-projection'
import { buildSequenceProjection, type SequenceProjection } from './projection/sequence-projection'
import { buildClassProjection, type ClassProjection } from './projection/class-projection'
import { buildMindmapProjection, type MindmapProjection } from './projection/mindmap-projection'
import { buildStateProjection, type StateProjection } from './projection/state-projection'
import { buildErProjection, type ErProjection } from './projection/er-projection'
import { buildGitgraphProjection, type GitgraphProjection } from './projection/gitgraph-projection'
import { buildTimelineProjection, type TimelineProjection } from './projection/timeline-projection'
import { buildKanbanProjection, type KanbanProjection } from './projection/kanban-projection'
import {
  buildRequirementProjection,
  type RequirementProjection,
} from './projection/requirement-projection'
import { buildJourneyProjection, type JourneyProjection } from './projection/journey-projection'
import { buildPieProjection, type PieProjection } from './projection/pie-projection'
import { buildBlockProjection, type BlockProjection } from './projection/block-projection'
import { buildSankeyProjection, type SankeyProjection } from './projection/sankey-projection'
import { buildGanttProjection, type GanttProjection } from './projection/gantt-projection'
import {
  buildQuadrantProjection,
  type QuadrantProjection,
} from './projection/quadrant-projection'
import { buildPacketProjection, type PacketProjection } from './projection/packet-projection'
import { packetParser } from './pipeline/packet'
import { packetCanvasCapabilities } from './canvas-selection/packet-adapter'
import { buildXychartProjection, type XychartProjection } from './projection/xychart-projection'
import { buildRadarProjection, type RadarProjection } from './projection/radar-projection'
import {
  buildArchitectureProjection,
  type ArchitectureProjection,
} from './projection/architecture-projection'
import { buildTreemapProjection, type TreemapProjection } from './projection/treemap-projection'
import { buildIshikawaProjection, type IshikawaProjection } from './projection/ishikawa-projection'
import { buildWardleyProjection, type WardleyProjection } from './projection/wardley-projection'
import { buildVennProjection, type VennProjection } from './projection/venn-projection'
import { buildCynefinProjection, type CynefinProjection } from './projection/cynefin-projection'
import { buildUsecaseProjection, type UsecaseProjection } from './projection/usecase-projection'
import { buildTreeviewProjection, type TreeviewProjection } from './projection/treeview-projection'
import { buildEventModelingProjection, type EventModelingProjection } from './projection/eventmodeling-projection'
import { buildAgentflowProjection, type AgentflowProjection } from './projection/agentflow-projection'
import { buildZenumlProjection, type ZenumlProjection } from './projection/zenuml-projection'
import { buildC4Projection, type C4Projection } from './projection/c4-projection'
import { flowchartCanvasCapabilities } from './canvas-selection/flowchart-adapter'
import { sequenceCanvasCapabilities } from './canvas-selection/sequence-adapter'
import { classCanvasCapabilities } from './canvas-selection/class-adapter'
import { mindmapCanvasCapabilities } from './canvas-selection/mindmap-adapter'
import { stateCanvasCapabilities } from './canvas-selection/state-adapter'
import { erCanvasCapabilities } from './canvas-selection/er-adapter'
import { gitgraphCanvasCapabilities } from './canvas-selection/gitgraph-adapter'
import { timelineCanvasCapabilities } from './canvas-selection/timeline-adapter'
import { kanbanCanvasCapabilities } from './canvas-selection/kanban-adapter'
import { requirementCanvasCapabilities } from './canvas-selection/requirement-adapter'
import { journeyCanvasCapabilities } from './canvas-selection/journey-adapter'
import { pieCanvasCapabilities } from './canvas-selection/pie-adapter'
import { blockCanvasCapabilities } from './canvas-selection/block-adapter'
import { sankeyCanvasCapabilities } from './canvas-selection/sankey-adapter'
import { ganttCanvasCapabilities } from './canvas-selection/gantt-adapter'
import { quadrantCanvasCapabilities } from './canvas-selection/quadrant-adapter'
import { xychartCanvasCapabilities } from './canvas-selection/xychart-adapter'
import { radarCanvasCapabilities } from './canvas-selection/radar-adapter'
import { architectureCanvasCapabilities } from './canvas-selection/architecture-adapter'
import { treemapCanvasCapabilities } from './canvas-selection/treemap-adapter'
import { ishikawaCanvasCapabilities } from './canvas-selection/ishikawa-adapter'
import { wardleyCanvasCapabilities } from './canvas-selection/wardley-adapter'
import { vennCanvasCapabilities } from './canvas-selection/venn-adapter'
import { cynefinCanvasCapabilities } from './canvas-selection/cynefin-adapter'
import { usecaseCanvasCapabilities } from './canvas-selection/usecase-adapter'
import { treeviewCanvasCapabilities } from './canvas-selection/treeview-adapter'
import { eventModelingCanvasCapabilities } from './canvas-selection/eventmodeling-adapter'
import { agentflowCanvasCapabilities } from './canvas-selection/agentflow-adapter'
import { zenumlCanvasCapabilities } from './canvas-selection/zenuml-adapter'
import { c4CanvasCapabilities } from './canvas-selection/c4-adapter'
import type { CanvasCapabilities } from './canvas-selection/capabilities'
import { treePartitions, type TreePartitions } from './structure-tree/partitions'
import { DEFAULT_DIAGRAM_SOURCE } from './storage'
import type { ReactNode } from 'react'
import type { ComponentType } from 'react'
import type { Selection } from './projection/selection'

/**
 * 图种注册表（工单 06 建立，供 07/08 复用）：
 * 每种图表类型注册 模板 / 解析器 / 投影构建 / 源码识别 / 画布能力包。
 * store 的 commitIntent 与 App 的投影派生都经此分发，新图种接入只需在此注册。
 */

/**
 * 图种 id（more-diagrams 工单 01）：**开放类型**（string），不再是封闭字面量联合——
 * 加一种图只改注册表（ProjectionTypes 加一行 + DIAGRAM_TYPE_LIST 挂一条），不牵动
 * selection-codec / capabilities / partitions 等地基文件的类型。封闭性由
 * ProjectionTypes（id → 投影类型的穷尽映射）承担，见下。
 */
export type DiagramTypeId = string

/** 已注册图种 id → 投影类型的穷尽映射。加一种图在此加一行；
 * AnyProjection 与 DIAGRAM_TYPES 的键都由它推导，漏注册是编译错误。 */
export interface ProjectionTypes {
  flowchart: FlowchartProjection
  sequence: SequenceProjection
  class: ClassProjection
  mindmap: MindmapProjection
  state: StateProjection
  er: ErProjection
  gitgraph: GitgraphProjection
  timeline: TimelineProjection
  kanban: KanbanProjection
  requirement: RequirementProjection
  journey: JourneyProjection
  pie: PieProjection
  block: BlockProjection
  sankey: SankeyProjection
  gantt: GanttProjection
  quadrant: QuadrantProjection
  packet: PacketProjection
  xychart: XychartProjection
  radar: RadarProjection
  architecture: ArchitectureProjection
  treemap: TreemapProjection
  ishikawa: IshikawaProjection
  wardley: WardleyProjection
  venn: VennProjection
  cynefin: CynefinProjection
  usecase: UsecaseProjection
  treeview: TreeviewProjection
  eventmodeling: EventModelingProjection
  agentflow: AgentflowProjection
  zenuml: ZenumlProjection
  c4: C4Projection
}

/** 已注册图种的 id 集合（字面量联合，随 ProjectionTypes 增长） */
export type RegisteredDiagramTypeId = keyof ProjectionTypes & string

/** 投影包装：type 与承载投影的同名字段（如 `{ type: 'flowchart', flowchart }`） */
export type ProjectionWrapper<K extends RegisteredDiagramTypeId> = { type: K } & { [p in K]: ProjectionTypes[K] }

/** 全部已注册图种的投影包装并集（由 ProjectionTypes 推导，加图种自动扩展） */
export type AnyProjection = {
  [K in RegisteredDiagramTypeId]: ProjectionWrapper<K>
}[RegisteredDiagramTypeId]

/** 各图种**去包装**投影（ProjectionTypes 值）的并集——表单路由条目消费的形状 */
export type AnyDiagramProjection = {
  [K in RegisteredDiagramTypeId]: ProjectionTypes[K]
}[RegisteredDiagramTypeId]

/** 去掉投影包装：`{ type, [type]: projection }` → projection（表单路由壳用） */
export function unwrapProjection(projection: AnyProjection): AnyDiagramProjection {
  // 投影包装与其承载字段同名（ProjectionWrapper 的恒等式，注册表自洽性测试钉住）；
  // 联合类型不能直接按联合键索引，这里经同名字段表转发
  return (projection as unknown as Record<RegisteredDiagramTypeId, AnyDiagramProjection>)[
    projection.type
  ]
}

/**
 * 表单路由条目的 props（architecture-deepening-3 工单 05）：图种投影 + 已按 kind 收窄的选中。
 * 条目是小函数组件——在投影中寻回元素（原各 case 的 find）与渲染表单都收在条目里。
 */
export interface SelectionFormEntryProps<P, K extends Selection['kind']> {
  projection: P
  selection: Extract<Selection, { kind: K }>
}

/**
 * 每图种的表单路由表（工单 05）：selection.kind → 表单条目。条目缺省 = 该图种不响应
 * 此 kind（原 switch 的 default 分支，渲染 null）。
 */
export type SelectionFormTable<P> = {
  [K in Selection['kind']]?: ComponentType<SelectionFormEntryProps<P, K>>
}

/**
 * 表单路由挂点（工单 05）：注册表只持引用、不含实现——每图种的路由表由
 * components/selection-form-routes.tsx 定义（表单组件在 components 层），并在该模块
 * 加载时挂到各注册项的 forms 槽位（注册表在 lib 层，不能反向 import 组件层——
 * 会成 store → registry → 路由表 → store 的环）。
 */
export interface DiagramSelectionForms {
  /** 壳（selection-forms.tsx）的唯一入口：按 selection.kind 查表渲染；
   * 未收录的 kind 返回 null（与原 default 分支同口径）。
   * 接收**已去包装**的图种投影（`projection[projection.type]`，即 ProjectionTypes[id]）。 */
  render(projection: AnyDiagramProjection, selection: Selection): ReactNode
}

export interface DiagramTypeRegistration {
  id: RegisteredDiagramTypeId
  parser: DiagramParser
  /** 新建图表时的起步模板（spec 用户故事 1） */
  template: string
  /** 源码识别：首个语句行是否为该图种的声明 */
  detect(source: string): boolean
  buildProjection(doc: SourceDocument): AnyProjection
  /** 结构树分区描述（architecture-deepening-2 工单 06）：该图种的结构树由哪些分区组成、
   * 每个元素如何显示与选中。**独立字段，不进画布能力包**（守 ADR-0015 的范围——
   * 结构树展示分区不是画布知识）。registry 只持引用、不含实现。 */
  tree: TreePartitions
  /** 画布能力包（工单 04，ADR-0015）：该图种接入画布所需的全部静态图种知识。
   * registry 只持引用、不含实现——「加一种图」= 新建一个 adapter + 在这里挂一行。 */
  canvas: CanvasCapabilities
  /** 表单路由（architecture-deepening-3 工单 05）：selection.kind → 属性表单的路由表。
   * registry 只声明槽位；实现见 DiagramSelectionForms 注释（组件层模块加载时挂入）。 */
  forms?: DiagramSelectionForms
}

/** 跳过 frontmatter 块、空行与注释后的首个语句行 */
function firstStatementLine(source: string): string {
  const body = source.slice(frontmatterEnd(source))
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('%%')) continue
    return line
  }
  return ''
}

const FLOWCHART_TEMPLATE = DEFAULT_DIAGRAM_SOURCE

export const SEQUENCE_TEMPLATE = `sequenceDiagram
    autonumber
    actor 使用者
    participant 系统 as Visual MMD
    使用者->>系统: 打开图表
    activate 系统
    系统-->>使用者: 渲染预览
    deactivate 系统
    使用者->>系统: 修改属性
    系统-->>使用者: 源码实时更新
    Note over 使用者,系统: 左侧代码随表单变化
    loop 每次编辑
        系统->>系统: 保存到 localStorage
    end
`

export const CLASS_TEMPLATE = `classDiagram
    class BankAccount
    BankAccount : +String owner
    BankAccount : +deposit(amount) bool
    class Account~T~{
        +T value
        +get() T
    }
    BankAccount <|-- Account~T~
    Customer "1" o-- "*" Account : 持有
    Account ..> Ledger : 记账
    note for BankAccount "银行账户"
    classDef highlight fill:#fff3bf,stroke:#f08c00
`

export const MINDMAP_TEMPLATE = `mindmap
  root((Visual MMD))
    双面板同步
      代码面板
        源码是唯一真相源
      画布
        实时渲染预览
    属性面板
      结构树
        树形缩进编辑
      属性表单
    图表库
      ::icon(fa fa-database)
      localStorage 自动保存
      导出 mmd / svg / png
`

/** state 起步模板（more-diagrams 工单 02）：初始转移、两个普通状态（其一带描述）、
 * 一个复合状态、一条带标签转移、一个 note */
export const STATE_TEMPLATE = `stateDiagram-v2
    [*] --> idle
    idle : 等待用户输入
    idle --> running : 开始处理
    running --> [*]

    state archiving {
        logging
        reporting
    }
    running --> archiving : 归档

    note right of idle
        双击状态可编辑描述
    end note
`

/** er 起步模板（more-diagrams 工单 03）：两个实体（其一属性块带 PK 与注释）、
 * 一条 identifying 关系带标签、一条 non-identifying 关系 */
export const ER_TEMPLATE = `erDiagram
    direction LR

    CAR {
        string make PK "制造商"
        string model "型号"
        int? year
    }
    DRIVER

    CAR ||--|{ DRIVER : "drives"
    DRIVER }|..|{ CAR : "insured by"
`

/** gitGraph 起步模板（more-diagrams 工单 04）：main 两个提交、一个分支带两个提交、
 * merge 回 main（带 tag 的提交） */
export const GITGRAPH_TEMPLATE = `gitGraph
    commit id: "init"
    commit id: "docs"
    branch feature
    commit
    commit
    checkout main
    merge feature tag: "v1.0"
`
/** timeline 起步模板（more-diagrams 工单 05）：一个 title、一个 section、两个时期；
 * 第一个时期含两个事件，两种写法各示一例（单行冒号串联 `: 调研` + 续行 `: 评审`） */
export const TIMELINE_TEMPLATE = `timeline
    title 产品演进路线

    section 第一阶段
        需求分析 : 调研
            : 评审
        设计发布
`

/**
 * kanban 起步模板（more-diagrams 工单 06）：三列（待办 / 进行中 / 已完成），
 * 待办两卡（其一携带完整 `@{ assigned / ticket / priority }` 元数据）、其余各一卡。
 * 缩进即语法：列与单元格同宽，卡片深一档。
 * 注意 mermaid 词法：`@{` 必须**紧跟** `]`（`] @{` 是 `SPACELIST`，解析报错）。
 */
export const KANBAN_TEMPLATE = `kanban
  Todo[待办]
    t1[接入 kanban 解析器]@{ assigned: '张三', ticket: 'VMMD-101', priority: 'High' }
    t2[补充单元测试]
  Doing[进行中]
    t3[接入画布能力包]
  Done[已完成]
    t4[搭建图种注册表]
`

/** requirementDiagram 起步模板（more-diagrams 工单 07）：一个 functionalRequirement
 * （id / text / risk / verifymethod 四字段齐全）、一个 element、一条 satisfies 关系。
 * 注：v12 只认 `requirementDiagram`（`requirementDiagram_v2` 关键字已消失） */
export const REQUIREMENT_TEMPLATE = `requirementDiagram
    direction LR

    functionalRequirement login {
        id: "REQ-1"
        text: "用户可使用账号密码登录"
        risk: Medium
        verifymethod: Test
    }

    element loginUI {
        type: "登录界面"
        docref: "docs/ui.md"
    }

    loginUI - satisfies -> login
`

/**
 * journey 起步模板（more-diagrams 工单 08）：一个 title、两个 section、每个 section
 * 两个任务（score 与多 actor 各有示例）。任务行语法 `名称: score: actor1, actor2`；
 * 任务名内不得再出现裸冒号（词法边界，见 pipeline/journey.ts）。
 */
export const JOURNEY_TEMPLATE = `journey
    title 用户旅程示例
    section 发现
        访问首页: 5: 用户, 搜索引擎
        浏览商品: 3: 用户
    section 决策
        对比价格: 2: 用户
        下单购买: 4: 用户, 客服
`

/**
 * pie 起步模板（more-diagrams 工单 10）：`pie showData` 声明、title、三个扇区。
 * 注：mermaid 12 的 pie 词法里 label 是 STRING token——引号必需（实测裸 label 直接
 * lexer 报错，见 pipeline/pie.ts）；数值落码保留原小数风格。
 */
export const PIE_TEMPLATE = `pie showData
    title 预算分配
    "研发" : 45
    "市场" : 30
    "运营" : 25
`

/**
 * block 起步模板（more-diagrams 工单 09）：`columns 3`、三个不同形状块（方形 / 菱形 /
 * 圆角 + 圆柱）、一条带标签箭头、一个嵌套块、一个 space。块图无自动布局——
 * 网格位置完全由书写顺序 + columns 决定，space 即显式空位。
 */
export const BLOCK_TEMPLATE = `block-beta
    columns 3

    a["输入"]
    space
    b{"校验"}
    c["输出"]

    block:group1
        columns 2
        d("缓存")
        e[("数据库")]
    end

    a --> b
    b -- "通过" --> c
`

/**
 * sankey 起步模板（more-diagrams 工单 13）：`sankey-beta` 声明 + 四条链路
 * （两个 source 一个汇点 home）、一条带引号含逗号 source 的链路（CSV 引号包列示例）。
 * 注意 mermaid sankey 词法：字段限可打印 ASCII——**中文节点名直接词法失败**，
 * 模板节点名必须全 ASCII（工单 Comments 记录结论）；正文是 CSV 流（无表头行）。
 */
export const SANKEY_TEMPLATE = `sankey-beta

electricity,grid,10
electricity,"gas, natural",6
grid,home,9
"gas, natural",home,7
`

/**
 * gantt 起步模板（more-diagrams 工单 11）：dateFormat / axisFormat 两条指令、title、
 * 两个 section、三个任务——覆盖 done / active 标签、起止日期形态与 `after` 依赖形态
 * 各一例。日期按字符串书写（verbatim：编辑不换格式，见 pipeline/gantt.ts）。
 */
export const GANTT_TEMPLATE = `gantt
    dateFormat YYYY-MM-DD
    axisFormat %m-%d
    title 项目排期示例

    section 调研
        需求梳理 :done, a1, 2026-01-05, 3d
        方案设计 :active, a2, after a1, 5d
    section 开发
        编码实现 :after a2, 4d
`

/**
 * quadrantChart 起步模板（more-diagrams 工单 12）：title、双段双轴（`低 --> 高`）、
 * quadrant-1..4、三个点（其一带 `:::class` 类标注、其一带内联样式段）与一条 classDef。
 * 点行语法 `文本[: [x, y]][ 样式段]`——坐标 0–1；样式段紧跟 `]`，`key: value` 逗号串联；
 * `:::类名` 落在文本与点冒号之间。classDef 行由解析器逐字保留（ADR-0004）。
 */
export const QUADRANT_TEMPLATE = `quadrantChart
    title 需求优先级评估
    x-axis 低价值 --> 高价值
    y-axis 低成本 --> 高成本
    quadrant-1 立即去做
    quadrant-2 规划排期
    quadrant-3 重新评估
    quadrant-4 谨慎投入
    Campaign A: [0.3, 0.6]
    Campaign B:::highlight: [0.45, 0.23]
    Campaign C: [0.57, 0.69] radius: 8, color: #ff6b00
    classDef highlight color:#f08c00
`

/**
 * packet 起步模板（more-diagrams 工单 16）：`0-15` / `16-31` 两个字段 + 一个 `+count`
 * 字段（自动衔接前序结束位，工单定案）。字段行语法 `位前缀: "名称"`——名称必须带引号
 * （mermaid langium 词法 STRING，实测裸名报错）；位区间连续性由校验层负责
 * （research：mermaid 12 populate 对间隙/重叠/回退整图抛错）。
 */
export const PACKET_TEMPLATE = `packet
    0-15: "Source Port"
    16-31: "Destination Port"
    +16: "Flags"
`

/**
 * xychart 起步模板（more-diagrams 工单 14）：`xychart-beta` 声明 + title、类别 x 轴
 * （3 类）、y 轴 range、一条 bar 与一条带名 line 系列（工单定案构成）。
 * 注意 mermaid xychart 词法：裸文本限 ASCII 词形——**中文标题/类别/系列名必须引号
 * 包裹**（STR token 无转义，内部不能有 `"`）；引号内的中文合法（模板即示例）。
 */
export const XYCHART_TEMPLATE = `xychart-beta
    title "季度销售趋势"
    x-axis ["一季度", "二季度", "三季度"]
    y-axis "销售额" 0 --> 400
    bar [200, 350, 150]
    line "均线" [150, 250, 300]
`

/**
 * radar 起步模板（more-diagrams 工单 15）：title、四个轴（单行多段）、两条曲线
 * （**双形态各一**：值列表 `{ 1, 2, 3, 4 }` 与键值 `{ a: 2, ... }`）、`max` 上限与
 * `graticule`（图表级表单可切 polygon 的既有入口——set-option-value 意图按 elementId
 * 定点改写，不存在的选项行没有添加意图）。label 引号必需（STRING token）；
 * `ticks` / `showLegend` 留给用户自行添加（模板保持最小可读）。
 */
export const RADAR_TEMPLATE = `radar-beta
    title 技能评估示例
    axis math["数学"], science["科学"], art["艺术"], sport["体育"]
    curve alice["Alice"]{ 1, 2, 3, 4 }
    curve bob["Bob"]{ math: 4, science: 3, art: 2, sport: 1 }
    max 5
    graticule circle
`

/**
 * architecture 起步模板（more-diagrams 工单 17）：两个 group（其一嵌套）、三个 service
 * （其一在组内）、一条直边一条带箭头边、一个 junction 中转边（工单定案构成）。
 * 注意 mermaid 词法：id 是 `[\w]([-\w]*\w)?`（无中文）；标题在 `[]` 内（可中文）；
 * service / group / junction 共享 id 命名空间（重名 mermaid 抛错）。
 */
export const ARCHITECTURE_TEMPLATE = `architecture-beta
    group platform(cloud)[平台]
    group private(cloud)[私有子网] in platform
    service web(server)[Web 服务]
    service db(database)[数据库] in private
    service cache(disk)[缓存]
    junction j1

    web:R -- L:db
    web:B --> T:j1
    j1:R -- L:cache
`

/**
 * treemap 起步模板（more-diagrams 工单 20）：一个根 Section、两个二级 Section、
 * 五个叶子（research 起步模板草案——每一级 Section 都有子节点，避开 research 坑 6
 * 「空 Section 不画」）。注意 treemap 词法（Langium）：名字必须带引号（research 坑 1）；
 * 缩进即层级，同级等宽、子级更宽（research 坑 4）。
 */
export const TREEMAP_TEMPLATE = `treemap
"预算分配"
    "运营"
        "人力": 700000
        "设备": 200000
        "物料": 100000
    "市场"
        "广告": 400000
        "活动": 100000
`

/**
 * ishikawa 起步模板（more-diagrams 工单 22，research §7 草案）：一行鱼头（问题/事件）
 * + 三个主因 + 三个二级因。缩进即层级（**相对缩进**，research 坑 1：第一条主因的缩进
 * 定基准，宽度不必等距）；官方文档写 `ishikawa-beta`，此处与文档一致。
 */
export const ISHIKAWA_TEMPLATE = `ishikawa-beta
    照片模糊
    人
        手抖
        没按稳
    设备
        镜头脏
        对焦不准
    环境
        光线太暗
`

/**
 * wardley 起步模板（more-diagrams 工单 23）：`wardley-beta` 声明 + title/size、
 * 一条 evolution 轴、1 个 anchor + 4 个 component（含 `(inertia)` 标注与中文引号名）、
 * 4 条依赖连线、一条 evolve 演化目标（research §7 草案）。
 * 注意词法（research §1）：坐标是 `[visibility, evolution]`——即 `[Y, X]`（与直觉相反）；
 * 非 ASCII 名必须引号包裹。
 */
export const WARDLEY_TEMPLATE = `wardley-beta
title 茶铺价值链
size [1100, 600]

evolution "未建模" -> "分化" -> "收敛" -> "商品化"

anchor "顾客" [0.95, 0.63]
component "茶" [0.63, 0.81]
component "热水" [0.52, 0.80]
component "水壶" [0.43, 0.35] (inertia)
component "电力" [0.10, 0.70]

"顾客" -> "茶"
"茶" -> "热水"
"热水" -> "水壶"
"水壶" -> "电力"

evolve "水壶" 0.62
`

/**
 * venn-beta 起步模板（more-diagrams 工单 21）：title、三个集合（其一无 label、其一带尺寸）
 * 与两个交集（二元 + 三元，各带 label）。注意 mermaid 词法（research §8 实测）：
 * 关键字**只有小写 `venn-beta`**（探测器 `/^\s*venn-beta/` 大小写敏感，裸 `venn` 不认）；
 * label 用 `["…"]`、尺寸用 `: <数值>` 段；三角形交集（A∩B∩C）mermaid 会渲染。
 */
export const VENN_TEMPLATE = `venn-beta
    title 团队技能分布
    set frontend["前端"]
    set backend["后端"]
    set devops
    union frontend,backend["全栈"]
    union frontend,backend,devops["平台工程"]
`

/**
 * cynefin 起步模板（more-diagrams 工单 25，research §7 草案）：`cynefin-beta` 声明 +
 * title + 五个固定域（complex / complicated / clear / chaotic / confusion）+ 6 个引号条目
 * + 2 条带标签转移。注意词法（research §2）：
 * - 五个域名词是**硬编码关键字**，独占一行（可缩进），大小写敏感；
 * - 条目**必须引号**（`DomainItem = label: STRING`，双/单引号皆可），裸词解析失败；
 * - 条目归属**纯由位置决定**——紧跟最近前序域名词行（**没有 `in domain` 类锚点**，research §8.2）；
 * - 转移 `域A --> 域B : "标签"`，端点只能是域名词，一条一行、顶层。
 */
export const CYNEFIN_TEMPLATE = `cynefin-beta
  title 事件响应分类

  complex
    "排查根因"
    "运行混沌实验"

  complicated
    "分析性能数据"

  clear
    "重启服务"

  chaotic
    "立即呼叫值班"

  confusion
    "未知故障模式"

  complex --> complicated : "模式已识别"
  clear --> chaotic : "自满"
`

/**
 * usecase-beta 起步模板（more-diagrams 工单 26）：两个 actor、一个系统边界（含三个用例）、
 * 一条注释四条连线（含 include / generalization）。注意 mermaid 词法（research §1/§2 实测）：
 * 关键字**是 `usecase-beta`**（探测器 `/^\s*usecase-beta(?:\s|$)/`，裸 `usecase` 不认）；
 * actor 用 `actor <id>`、用例可裸声明或用 `("标签")` / `["标签"]`；边界用 `systemBoundary … end`。
 */
export const USECASE_TEMPLATE = `usecase-beta
    actor Customer("Customer")
    actor Admin("Administrator")
    systemBoundary shop["Online Shop"]
        Browse("Browse products")
        Checkout("Checkout")
        Payment("Process payment")
    end
    note for Checkout "备注：结算前校验购物车"
    Customer --> Browse
    Customer --> Checkout
    Checkout ..> : include Payment
    Admin --|> Customer
`

/**
 * treeView 起步模板（more-diagrams 工单 24，research §7 草案）：一行根目录 `/`
 * + 两个子目录 + 每个目录下的文件。缩进即层级（**每级 4 空格**，或一个 Tab——
 * `INDENTATION.length` 作 level，research §1）；目录以名字结尾的 `/` 表示
 * （名称尾直接带 `/`，引号内亦然，research 坑 4）。关键字只有 `treeView-beta`
 * 一个，且 **Langium 关键字大小写敏感**（探测器 `/^\s*treeView-beta/` 无 i 位）。
 */
export const TREEVIEW_TEMPLATE = `treeView-beta
/
    src/
        main.ts
        utils.ts
    docs/
        README.md
        guide.md
`

/**
 * eventmodeling 起步模板（more-diagrams 工单 28，research §7 草案）：声明关键字是
 * **正文首行的裸 `eventmodeling`**（mermaid 探测器 `/^\s*eventmodeling/`，**无 `-beta`
 * 后缀**，research §1/§8.1 实测）——不是 frontmatter 声明式（工单原假设作废）。
 * 三条帧 ui→cmd→evt（跨三条泳道，默认推断出两条关系）+ 一个被事件帧引用的数据块；
 * 帧号、实体类型、标识为语法核心，`data … { }` 的多行块体是 opaque 文本（逐字保留）。
 */
export const EVENT_MODELING_TEMPLATE = `eventmodeling

tf 01 ui CartUI
tf 02 cmd AddItem
tf 03 evt ItemAdded [[ItemAdded]]

data ItemAdded {
  description: string
  price: number
}
`

/**
 * agentflow-beta 起步模板（more-diagrams 工单 27，research §7 草案）：`agentflow-beta TB`
 * 声明 + 两个 flow 分组 + 六种形状别名（input/task/tool/refdoc/decision/action）+
 * 三种边算子（`-->` sequence / `-.-` reference / `--x` failure）+ 一条链式边。
 * 注意词法（research §1/§8）：
 * - 关键字**只有小写 `agentflow-beta`**（探测与语法均大小写敏感）；
 * - 节点是 flowchart 风格 `id["label"]`，形状用 `@{ shape: … }` 指定；
 * - 容器 `flow id["title"] … end` 可嵌套；`global … end` 使块内节点保持顶层；
 * - `@{ … }` 元数据是 YAML，本 app **逐字保留、不消费**（多行块整块 verbatim）。
 */
export const AGENTFLOW_TEMPLATE = `agentflow-beta TB
  brief["Release brief"]@{ shape: input }
  flow writer["Drafting Agent"]
    draft["Draft the notes"]@{ shape: task }
    lookup["changelog_search"]@{ shape: tool }
    guide["Tone of voice"]@{ shape: refdoc }
    draft --> lookup
    draft -.- guide
  end
  flow reviewer["Review Agent"]
    check["Check the claims"]@{ shape: task }
    ok["Accurate?"]@{ shape: decision }
    check --> ok
  end
  publish["Publish"]@{ shape: action }
  brief --> writer
  writer --> reviewer
  ok --> publish
`

/**
 * zenuml 起步模板（more-diagrams 工单 19）：两个参与者（其一 @Database 注解）、一条同步
 * （`A.b()`）一条异步（`A->B.m()`）消息、一个 if/else 片段（工单定案构成）。
 * 注意：zenuml 是**外部渲染器**（`@mermaid-js/mermaid-zenuml`，异步注册），语法权威见
 * zenuml.com（mermaid 文档不可抓）。方案名参与者在消息端点隐式引入，显式 `participant`
 * 声明只为别名 / 注解服务（名字即身份，research §10）。
 */
export const ZENUML_TEMPLATE = `zenuml
    title 下单流程
    participant Client as "客户端"
    @Database Server
    Client->Server.placeOrder(item)
    if (item.stock > 0) {
        Server.checkStock()
    } else {
        Client->Server.reject()
    }
`

/**
 * C4 起步模板（more-diagrams 工单 18）：`C4Context` 声明 + 一个 Person + 两个 System
 * （其一 `_Ext` 外部系统）+ 一个 `Enterprise_Boundary`（含 SystemDb）+ 一条带 techn 的 Rel
 * （同时示范命名参数 `$descr=` 形态）。
 * 注意 mermaid c4 词法（research §9 实测）：
 * - 关键字必须是大写 `C4Context` / `C4Container` / `C4Component` / `C4Dynamic` / `C4Deployment`；
 * - 位置参数按元素种类固定（Person/System = alias, label, descr, sprite, tags, $link；
 *   Container/Component = alias, label, techn, descr, sprite, tags, $link）；
 * - 边界是**花括号块**（`Enterprise_Boundary(...) { … }`，裸 `}` 收尾）；
 * - `Deployment_Node` / `Node` 家族同属块体构造（必须带 `{}`）；
 * - 处理不了的宏（`Rel_S/Ne/B/T`、`Lay_*`、`Show/Hide`、`Update*`、`SHOW_LEGEND`）逐字保留。
 */
export const C4_TEMPLATE = `C4Context
    title 网上银行系统

    Person(customer, "个人客户", "使用网银的个人用户")
    System(banking, "网银系统", "提供账户与转账能力")
    System_Ext(email, "邮件系统", "发送通知邮件")

    Enterprise_Boundary(b0, "银行边界") {
        SystemDb(db, "核心账务库", "存放账户余额")
    }

    Rel(customer, banking, "访问", "HTTPS")
    Rel(banking, email, "发送通知", "SMTP", $descr="通过邮件网关")
`

/**
 * 注册表：数组是唯一权威（more-diagrams 工单 01），DIAGRAM_TYPES 由它推导。
 * detectDiagramType 按数组顺序显式遍历——不再维护手写的 if 分发链，
 * 新图种挂一条即可参与识别，无法识别时不再默认 flowchart（见下）。
 */
export const DIAGRAM_TYPE_LIST: DiagramTypeRegistration[] = [
  {
    id: 'flowchart',
    parser: flowchartParser,
    template: FLOWCHART_TEMPLATE,
    detect: (source) => /^(flowchart|graph)\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'flowchart', flowchart: buildFlowchartProjection(doc) }),
    tree: treePartitions.flowchart,
    canvas: flowchartCanvasCapabilities,
  },
  {
    id: 'sequence',
    parser: sequenceParser,
    template: SEQUENCE_TEMPLATE,
    detect: (source) => /^sequenceDiagram\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'sequence', sequence: buildSequenceProjection(doc) }),
    tree: treePartitions.sequence,
    canvas: sequenceCanvasCapabilities,
  },
  {
    id: 'class',
    parser: classParser,
    template: CLASS_TEMPLATE,
    detect: (source) => /^classDiagram\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'class', class: buildClassProjection(doc) }),
    tree: treePartitions.class,
    canvas: classCanvasCapabilities,
  },
  {
    id: 'mindmap',
    parser: mindmapParser,
    template: MINDMAP_TEMPLATE,
    detect: (source) => /^mindmap\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'mindmap', mindmap: buildMindmapProjection(doc) }),
    tree: treePartitions.mindmap,
    canvas: mindmapCanvasCapabilities,
  },
  {
    id: 'state',
    parser: stateParser,
    template: STATE_TEMPLATE,
    // v1 `stateDiagram` 与 v2 同认（mermaid 两个关键字都渲染）；投影按 v2 解析
    detect: (source) => /^stateDiagram(-v2)?\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'state', state: buildStateProjection(doc) }),
    tree: treePartitions.state,
    canvas: stateCanvasCapabilities,
  },
  {
    id: 'er',
    parser: erParser,
    template: ER_TEMPLATE,
    detect: (source) => /^erDiagram\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'er', er: buildErProjection(doc) }),
    tree: treePartitions.er,
    canvas: erCanvasCapabilities,
  },
  {
    id: 'gitgraph',
    parser: gitgraphParser,
    template: GITGRAPH_TEMPLATE,
    // 方向写在声明后（`gitGraph LR:`）；`\b` 让关键字不被 `gitGraphX` 误认
    detect: (source) => /^gitGraph\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'gitgraph', gitgraph: buildGitgraphProjection(doc) }),
    tree: treePartitions.gitgraph,
    canvas: gitgraphCanvasCapabilities,
  },
  {
    id: 'timeline',
    parser: timelineParser,
    template: TIMELINE_TEMPLATE,
    detect: (source) => /^timeline\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'timeline', timeline: buildTimelineProjection(doc) }),
    tree: treePartitions.timeline,
    canvas: timelineCanvasCapabilities,
  },
  {
    id: 'kanban',
    parser: kanbanParser,
    template: KANBAN_TEMPLATE,
    detect: (source) => /^kanban\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'kanban', kanban: buildKanbanProjection(doc) }),
    tree: treePartitions.kanban,
    canvas: kanbanCanvasCapabilities,
  },
  {
    id: 'requirement',
    parser: requirementParser,
    template: REQUIREMENT_TEMPLATE,
    // v12 只认 `requirementDiagram`（`requirementDiagram_v2` 关键字已消失，见 research/
    // timeline-kanban-requirement.md）；`\b` 让关键字不被 `requirementDiagramX` 误认
    detect: (source) => /^requirementDiagram\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'requirement', requirement: buildRequirementProjection(doc) }),
    tree: treePartitions.requirement,
    canvas: requirementCanvasCapabilities,
  },
  {
    id: 'journey',
    parser: journeyParser,
    template: JOURNEY_TEMPLATE,
    detect: (source) => /^journey\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'journey', journey: buildJourneyProjection(doc) }),
    tree: treePartitions.journey,
    canvas: journeyCanvasCapabilities,
  },
  {
    id: 'pie',
    parser: pieParser,
    template: PIE_TEMPLATE,
    // `\b` 让关键字不被 `pieXxx` 之类的更长词误认
    detect: (source) => /^pie\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'pie', pie: buildPieProjection(doc) }),
    tree: treePartitions.pie,
    canvas: pieCanvasCapabilities,
  },
  {
    id: 'block',
    parser: blockParser,
    template: BLOCK_TEMPLATE,
    // 老用户源码更常见 block-beta；12.0.0 起文档统一 block——两个关键字都认（工单决策）。
    // 声明行必须是裸关键字（行尾只允许空白，与 BlockParser.HEADER_RE 同口径）——
    // `block:gid`（嵌套块声明）不是合法表头，不被认领；`blockX` 也不被误吞
    detect: (source) => /^block(-beta)?[ \t\r]*$/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'block', block: buildBlockProjection(doc) }),
    tree: treePartitions.block,
    canvas: blockCanvasCapabilities,
  },
  {
    id: 'sankey',
    parser: sankeyParser,
    template: SANKEY_TEMPLATE,
    // sankey 词法两个关键字都认（`sankey-beta` / `sankey`，均 case-insensitive，离线核对
    // sankeyDiagram-IPEJSGJF.mjs 的 jison 规则）；声明行必须是裸关键字——正文是 CSV 流，
    // 带尾随内容的行是数据行不是表头
    detect: (source) => /^sankey(-beta)?[ \t\r]*$/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'sankey', sankey: buildSankeyProjection(doc) }),
    tree: treePartitions.sankey,
    canvas: sankeyCanvasCapabilities,
  },
  {
    id: 'gantt',
    parser: ganttParser,
    template: GANTT_TEMPLATE,
    // `\b` 让关键字不被 `ganttXxx` 之类的更长词误认
    detect: (source) => /^gantt\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'gantt', gantt: buildGanttProjection(doc) }),
    tree: treePartitions.gantt,
    canvas: ganttCanvasCapabilities,
  },
  {
    id: 'quadrant',
    parser: quadrantParser,
    template: QUADRANT_TEMPLATE,
    // `\b` 让关键字不被 `quadrantChartX` 之类的更长词误认
    detect: (source) => /^quadrantChart\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'quadrant', quadrant: buildQuadrantProjection(doc) }),
    tree: treePartitions.quadrant,
    canvas: quadrantCanvasCapabilities,
  },
  {
    id: 'packet',
    parser: packetParser,
    template: PACKET_TEMPLATE,
    // `packet` 与 `packet-beta` 两个关键字 mermaid 都渲染（工单定案同认）；`\b` 防止
    // `packetXxx` 之类的更长词被误吞
    detect: (source) => /^packet(-beta)?\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'packet', packet: buildPacketProjection(doc) }),
    tree: treePartitions.packet,
    canvas: packetCanvasCapabilities,
  },
  {
    id: 'xychart',
    parser: xychartParser,
    template: XYCHART_TEMPLATE,
    // xychart 词法两个关键字都认（`xychart-beta` / `xychart`，均 case-insensitive，离线核对
    // xychartDiagram-PMCCYNJV.mjs 的 jison 规则）；声明行可带方向修饰符 `horizontal` /
    // `vertical`（独立词、空格分隔）——`xychart` 后跟别的内容不认领
    detect: (source) => /^xychart(-beta)?(?:[ \t]+(?:horizontal|vertical))?[ \t\r]*$/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'xychart', xychart: buildXychartProjection(doc) }),
    tree: treePartitions.xychart,
    canvas: xychartCanvasCapabilities,
  },
  {
    id: 'radar',
    parser: radarParser,
    template: RADAR_TEMPLATE,
    // `\b` 让关键字不被 `radarXxx` 之类的更长词误认；只认 `radar-beta`（mermaid 12
    // 的 radar 语法只有这一个关键字，Langium 语法勘察确认）
    detect: (source) => /^radar-beta\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'radar', radar: buildRadarProjection(doc) }),
    tree: treePartitions.radar,
    canvas: radarCanvasCapabilities,
  },
  {
    id: 'architecture',
    parser: architectureParser,
    template: ARCHITECTURE_TEMPLATE,
    // `\b` 让关键字不被 `architectureX` 之类的更长词误认；声明行必须是裸关键字
    //（mermaid 词法只有 `architecture-beta` 一个关键字，@mermaid-js/parser ArchitectureGrammar）
    detect: (source) => /^architecture-beta[ \t\r]*$/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'architecture', architecture: buildArchitectureProjection(doc) }),
    tree: treePartitions.architecture,
    canvas: architectureCanvasCapabilities,
  },
  {
    id: 'treemap',
    parser: treemapParser,
    template: TREEMAP_TEMPLATE,
    // `treemap` 与 `treemap-beta` 两个关键字 mermaid 都渲染（Langium 终结符
    // `TREEMAP_KEYWORD = "treemap-beta" | "treemap"`，research §1）；声明行必须是
    // 裸关键字（research：首行必须是关键字本身）。Langium 关键字大小写敏感
    // （mermaid 探测器 `/^\s*treemap/` 无 i 位），故不加 i
    detect: (source) => /^treemap(-beta)?[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'treemap', treemap: buildTreemapProjection(doc) }),
    tree: treePartitions.treemap,
    canvas: treemapCanvasCapabilities,
  },
  {
    id: 'ishikawa',
    parser: ishikawaParser,
    template: ISHIKAWA_TEMPLATE,
    // `ishikawa` 与 `ishikawa-beta` 两个关键字 mermaid 都认（jison 词法规则 1/2 分别匹配
    // `ishikawa-beta\b` / `ishikawa\b`，均带 `/i`；探测器 `/^\s*ishikawa(-beta)?\b/i`，
    // research §1——**大小写不敏感**）。声明行必须是裸关键字（首行即关键字本身）
    detect: (source) => /^ishikawa(-beta)?[ \t\r]*$/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'ishikawa', ishikawa: buildIshikawaProjection(doc) }),
    tree: treePartitions.ishikawa,
    canvas: ishikawaCanvasCapabilities,
  },
  {
    id: 'wardley',
    parser: wardleyParser,
    template: WARDLEY_TEMPLATE,
    // `\b` 让关键字不被 `wardleyXxx` 之类的更长词误认；mermaid 12 只有 `wardley-beta`
    // 一个关键字（Langium 语法勘察，research §1）。探测器（mermaid 自身）大小写不敏感、
    // 但 Langium 关键字字面量大小写敏感——此处按 mermaid 探测器口径放宽为 i
    detect: (source) => /^wardley-beta\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'wardley', wardley: buildWardleyProjection(doc) }),
    tree: treePartitions.wardley,
    canvas: wardleyCanvasCapabilities,
  },
  {
    id: 'venn',
    parser: vennParser,
    template: VENN_TEMPLATE,
    // venn 词法**只有小写 `venn-beta`**（research §8 实测：mermaid 探测器
    // `/^\s*venn-beta/` 大小写敏感、无 `(-beta)?` 分支，裸 `venn` 不被认领）。
    // 声明行必须是裸关键字（行尾只允许空白，与 VennParser.HEADER_RE 同口径）
    detect: (source) => /^venn-beta[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'venn', venn: buildVennProjection(doc) }),
    tree: treePartitions.venn,
    canvas: vennCanvasCapabilities,
  },
  {
    id: 'cynefin',
    parser: cynefinParser,
    template: CYNEFIN_TEMPLATE,
    // mermaid 12 只有 `cynefin-beta` 一个关键字（Langium 语法勘察，research §1）：
    // 无裸名 `cynefin`；语法允许尾冒号变体 `cynefin-beta:`；**检测与语法均大小写敏感**
    // （research §8.3：`Cynefin-Beta` 解析失败）——故不像 ishikawa/wardley 那样放宽为 i
    detect: (source) => /^cynefin-beta:?[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'cynefin', cynefin: buildCynefinProjection(doc) }),
    tree: treePartitions.cynefin,
    canvas: cynefinCanvasCapabilities,
  },
  {
    id: 'usecase',
    parser: usecaseParser,
    template: USECASE_TEMPLATE,
    // usecase 词法**只有 `usecase-beta`**（research §1 实测：mermaid 探测器
    // `/^\s*usecase-beta(?:\s|$)/`、词法 `keyword("USECASE", /usecase-beta/)`；裸 `usecase`
    // 不被认领）。声明行可同行带 `direction`（TB|TD|BT|LR|RL），与 UsecaseParser.HEADER_RE 同口径
    detect: (source) =>
      /^usecase-beta(?:[ \t]+(?:TB|TD|BT|LR|RL))?[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'usecase', usecase: buildUsecaseProjection(doc) }),
    tree: treePartitions.usecase,
    canvas: usecaseCanvasCapabilities,
  },
  {
    id: 'treeview',
    parser: treeviewParser,
    template: TREEVIEW_TEMPLATE,
    // 关键字只有 `treeView-beta` 一个（Langium 终结符 `TREEVIEW_KEYWORD = "treeView-beta"`，
    // 无 `treeView` 别名，research §1）；且 Langium 关键字**大小写敏感**（mermaid 探测器
    // `/^\s*treeView-beta/` 无 i 位），故此处也不加 i。声明行必须是裸关键字（首行即关键字本身）
    detect: (source) => /^treeView-beta[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'treeview', treeview: buildTreeviewProjection(doc) }),
    tree: treePartitions.treeview,
    canvas: treeviewCanvasCapabilities,
  },
  {
    id: 'eventmodeling',
    parser: eventModelingParser,
    template: EVENT_MODELING_TEMPLATE,
    // eventmodeling 声明 = **正文首行的裸关键字 `eventmodeling`**（mermaid 探测器
    // `/^\s*eventmodeling/`，research §1/§8.1 实测；**无 `-beta` 后缀**）——不是 frontmatter
    // 声明式（工单原假设作废）。与 EventModelingParser.HEADER_RE 同口径：整行仅关键字 + 空白
    detect: (source) => /^eventmodeling\b[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({
      type: 'eventmodeling',
      eventmodeling: buildEventModelingProjection(doc),
    }),
    tree: treePartitions.eventmodeling,
    canvas: eventModelingCanvasCapabilities,
  },
  {
    id: 'agentflow',
    parser: agentflowParser,
    template: AGENTFLOW_TEMPLATE,
    // mermaid 12 只有 `agentflow-beta` 一个关键字（research §1/§8.1）：无裸名 `agentflow`；
    // **检测与语法均大小写敏感**（实测 `AgentFlow-Beta`/`AGENTFLOW-BETA`/`agentflow`
    // 均 `No diagram type detected`）——故不加 i。声明行可带同行方向修饰符
    //（`TB|TD|BT|LR|RL`，独立词），尾随别的内容不认领
    detect: (source) =>
      /^agentflow-beta(?:[ \t]+(?:TB|TD|BT|LR|RL))?[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'agentflow', agentflow: buildAgentflowProjection(doc) }),
    tree: treePartitions.agentflow,
    canvas: agentflowCanvasCapabilities,
  },
  {
    id: 'zenuml',
    parser: zenumlParser,
    template: ZENUML_TEMPLATE,
    // zenuml 词法**只有小写 `zenuml`**（外部插件 `@mermaid-js/mermaid-zenuml` 的 detector
    // `/^\s*zenuml/`，大小写敏感；research §10）。声明行必须是裸关键字——zenuml 是
    // 类代码语法，表头后跟别的内容不认领（与 ZenumlParser.HEADER_RE 同口径）
    detect: (source) => /^zenuml[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'zenuml', zenuml: buildZenumlProjection(doc) }),
    tree: treePartitions.zenuml,
    canvas: zenumlCanvasCapabilities,
  },
  {
    id: 'c4',
    parser: c4Parser,
    template: C4_TEMPLATE,
    // more-diagrams 工单 18：mermaid c4 词法的五个关键字（research §9 实测 lexer 规则表
    // 18-22）——**全部大写 C4**，`C4Context`/`C4Container`/`C4Component`/`C4Dynamic`/
    // `C4Deployment`。声明行必须是裸关键字（行尾只允许空白；mermaid 自身探测器
    // `/^\s*C4Context|C4Container|…/` 大小写敏感、无尾随内容分支）
    detect: (source) => /^C4(Context|Container|Component|Dynamic|Deployment)[ \t\r]*$/.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'c4', c4: buildC4Projection(doc) }),
    tree: treePartitions.c4,
    canvas: c4CanvasCapabilities,
  },
]

export const DIAGRAM_TYPES = Object.fromEntries(
  DIAGRAM_TYPE_LIST.map((registration) => [registration.id, registration]),
) as Record<RegisteredDiagramTypeId, DiagramTypeRegistration>

/**
 * 识别当前源码的图表类型：按注册顺序遍历，返回第一个认领的图种。
 * **没有任何注册认领时返回 null（unsupported 态，more-diagrams 工单 01）**——
 * 修复原「无法识别默认 flowchart」缺陷：冷门图种（如 venn-beta）不再被 flowchart
 * 解析器误吞成空投影，改为只读降级（预览与代码面板照常，画布表单显示占位提示）。
 */
export function detectDiagramType(source: string): DiagramTypeRegistration | null {
  return DIAGRAM_TYPE_LIST.find((registration) => registration.detect(source)) ?? null
}
