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
import { DEFAULT_DIAGRAM_SOURCE } from './storage'

/**
 * 图种注册表（工单 06 建立，供 07/08 复用）：
 * 每种图表类型注册 模板 / 解析器 / 投影构建 / 源码识别 / 画布能力包。
 * store 的 commitIntent 与 App 的投影派生都经此分发，新图种接入只需在此注册。
 */

export type DiagramTypeId = 'flowchart' | 'sequence' | 'class' | 'mindmap'

export type AnyProjection =
  | { type: 'flowchart'; flowchart: FlowchartProjection }
  | { type: 'sequence'; sequence: SequenceProjection }
  | { type: 'class'; class: ClassProjection }
  | { type: 'mindmap'; mindmap: MindmapProjection }

export interface DiagramTypeRegistration {
  id: DiagramTypeId
  parser: DiagramParser
  /** 新建图表时的起步模板（spec 用户故事 1） */
  template: string
  /** 源码识别：首个语句行是否为该图种的声明 */
  detect(source: string): boolean
  buildProjection(doc: SourceDocument): AnyProjection
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

export const DIAGRAM_TYPES: Record<DiagramTypeId, DiagramTypeRegistration> = {
  flowchart: {
    id: 'flowchart',
    parser: flowchartParser,
    template: FLOWCHART_TEMPLATE,
    detect: (source) => /^(flowchart|graph)\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'flowchart', flowchart: buildFlowchartProjection(doc) }),
    canvas: flowchartCanvasCapabilities,
  },
  sequence: {
    id: 'sequence',
    parser: sequenceParser,
    template: SEQUENCE_TEMPLATE,
    detect: (source) => /^sequenceDiagram\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'sequence', sequence: buildSequenceProjection(doc) }),
    canvas: sequenceCanvasCapabilities,
  },
  class: {
    id: 'class',
    parser: classParser,
    template: CLASS_TEMPLATE,
    detect: (source) => /^classDiagram\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'class', class: buildClassProjection(doc) }),
    canvas: classCanvasCapabilities,
  },
  mindmap: {
    id: 'mindmap',
    parser: mindmapParser,
    template: MINDMAP_TEMPLATE,
    detect: (source) => /^mindmap\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'mindmap', mindmap: buildMindmapProjection(doc) }),
    canvas: mindmapCanvasCapabilities,
  },
}

/** 识别当前源码的图表类型；无法识别时默认 flowchart（保持工单 04 行为） */
export function detectDiagramType(source: string): DiagramTypeRegistration {
  if (DIAGRAM_TYPES.sequence.detect(source)) return DIAGRAM_TYPES.sequence
  if (DIAGRAM_TYPES.class.detect(source)) return DIAGRAM_TYPES.class
  if (DIAGRAM_TYPES.mindmap.detect(source)) return DIAGRAM_TYPES.mindmap
  return DIAGRAM_TYPES.flowchart
}

export const DIAGRAM_TYPE_LIST: DiagramTypeRegistration[] = [
  DIAGRAM_TYPES.flowchart,
  DIAGRAM_TYPES.sequence,
  DIAGRAM_TYPES.class,
  DIAGRAM_TYPES.mindmap,
]
