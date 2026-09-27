import type { SourceDocument } from './pipeline/document'
import type { DiagramParser } from './pipeline/parser'
import { flowchartParser } from './pipeline/flowchart'
import { sequenceParser } from './pipeline/sequence'
import { buildFlowchartProjection, type FlowchartProjection } from './projection/flowchart-projection'
import { buildSequenceProjection, type SequenceProjection } from './projection/sequence-projection'
import { DEFAULT_DIAGRAM_SOURCE } from './storage'

/**
 * 图种注册表（工单 06 建立，供 07/08 复用）：
 * 每种图表类型注册 模板 / 解析器 / 投影构建 / 源码识别。
 * store 的 commitIntent 与 App 的投影派生都经此分发，新图种接入只需在此注册。
 */

export type DiagramTypeId = 'flowchart' | 'sequence'

export type AnyProjection =
  | { type: 'flowchart'; flowchart: FlowchartProjection }
  | { type: 'sequence'; sequence: SequenceProjection }

export interface DiagramTypeRegistration {
  id: DiagramTypeId
  parser: DiagramParser
  /** 新建图表时的起步模板（spec 用户故事 1） */
  template: string
  /** 源码识别：首个语句行是否为该图种的声明 */
  detect(source: string): boolean
  buildProjection(doc: SourceDocument): AnyProjection
}

/** 跳过空行与注释后的首个语句行 */
function firstStatementLine(source: string): string {
  for (const raw of source.split(/\r?\n/)) {
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

export const DIAGRAM_TYPES: Record<DiagramTypeId, DiagramTypeRegistration> = {
  flowchart: {
    id: 'flowchart',
    parser: flowchartParser,
    template: FLOWCHART_TEMPLATE,
    detect: (source) => /^(flowchart|graph)\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'flowchart', flowchart: buildFlowchartProjection(doc) }),
  },
  sequence: {
    id: 'sequence',
    parser: sequenceParser,
    template: SEQUENCE_TEMPLATE,
    detect: (source) => /^sequenceDiagram\b/i.test(firstStatementLine(source)),
    buildProjection: (doc) => ({ type: 'sequence', sequence: buildSequenceProjection(doc) }),
  },
}

/** 识别当前源码的图表类型；无法识别时默认 flowchart（保持工单 04 行为） */
export function detectDiagramType(source: string): DiagramTypeRegistration {
  if (DIAGRAM_TYPES.sequence.detect(source)) return DIAGRAM_TYPES.sequence
  return DIAGRAM_TYPES.flowchart
}

export const DIAGRAM_TYPE_LIST: DiagramTypeRegistration[] = [DIAGRAM_TYPES.flowchart, DIAGRAM_TYPES.sequence]
