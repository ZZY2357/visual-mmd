import type { SourceDocument } from './pipeline/document'
import type { DiagramParser } from './pipeline/parser'
import { flowchartParser } from './pipeline/flowchart'
import { sequenceParser } from './pipeline/sequence'
import { classParser } from './pipeline/class'
import { mindmapParser } from './pipeline/mindmap'
import { frontmatterEnd } from './pipeline/frontmatter'
import { buildFlowchartProjection, type FlowchartProjection } from './projection/flowchart-projection'
import { buildSequenceProjection, type SequenceProjection } from './projection/sequence-projection'
import { buildClassProjection, type ClassProjection } from './projection/class-projection'
import { buildMindmapProjection, type MindmapProjection } from './projection/mindmap-projection'
import { flowchartCanvasCapabilities } from './canvas-selection/flowchart-adapter'
import { sequenceCanvasCapabilities } from './canvas-selection/sequence-adapter'
import { classCanvasCapabilities } from './canvas-selection/class-adapter'
import { mindmapCanvasCapabilities } from './canvas-selection/mindmap-adapter'
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
