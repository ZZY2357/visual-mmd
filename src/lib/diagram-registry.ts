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
import { ganttParser } from './pipeline/gantt'
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
import { buildGanttProjection, type GanttProjection } from './projection/gantt-projection'
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
import { ganttCanvasCapabilities } from './canvas-selection/gantt-adapter'
import type { CanvasCapabilities } from './canvas-selection/capabilities'
import { treePartitions, type TreePartitions } from './structure-tree/partitions'
import { DEFAULT_DIAGRAM_SOURCE } from './storage'

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
  gantt: GanttProjection
}

/** 已注册图种的 id 集合（字面量联合，随 ProjectionTypes 增长） */
export type RegisteredDiagramTypeId = keyof ProjectionTypes & string

/** 投影包装：type 与承载投影的同名字段（如 `{ type: 'flowchart', flowchart }`） */
export type ProjectionWrapper<K extends RegisteredDiagramTypeId> = { type: K } & { [p in K]: ProjectionTypes[K] }

/** 全部已注册图种的投影包装并集（由 ProjectionTypes 推导，加图种自动扩展） */
export type AnyProjection = {
  [K in RegisteredDiagramTypeId]: ProjectionWrapper<K>
}[RegisteredDiagramTypeId]

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
    id: 'gantt',
    parser: ganttParser,
    template: GANTT_TEMPLATE,
    // `\b` 让关键字不被 `ganttXxx` 之类的更长词误认
    detect: (source) => /^gantt\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'gantt', gantt: buildGanttProjection(doc) }),
    tree: treePartitions.gantt,
    canvas: ganttCanvasCapabilities,
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
