import type { FlowchartIntent } from '../pipeline/flowchart'
import { isValidNewNodeId, type ArrowMarker, type LinkLineStyle, type NodeShapeType } from '../pipeline/flowchart'

/**
 * 表单值 → 编辑意图 的纯映射（工单 04）。
 * 本模块不做任何解析或落码：产出意图后由管线 applyEdit 执行。
 * 意图集合与语义见 src/lib/pipeline/flowchart.ts（工单 03）。
 */

// ---------- 选项表（工单 07：{value, labelKey} 对，文案键与 src/i18n 字典锁步延伸） ----------

/** 选项表条目：枚举值 + 它在 i18n 字典里的完整键 */
export interface OptionEntry<V> {
  value: V
  labelKey: string
}

/** 节点形状下拉选项（ADR-0005 全部形状） */
export const SHAPE_OPTIONS: Array<OptionEntry<NodeShapeType>> = [
  { value: 'rectangle', labelKey: 'app:shapes.rectangle' },
  { value: 'rounded', labelKey: 'app:shapes.rounded' },
  { value: 'stadium', labelKey: 'app:shapes.stadium' },
  { value: 'subroutine', labelKey: 'app:shapes.subroutine' },
  { value: 'cylinder', labelKey: 'app:shapes.cylinder' },
  { value: 'circle', labelKey: 'app:shapes.circle' },
  { value: 'double-circle', labelKey: 'app:shapes.double-circle' },
  { value: 'asymmetric', labelKey: 'app:shapes.asymmetric' },
  { value: 'rhombus', labelKey: 'app:shapes.rhombus' },
  { value: 'hexagon', labelKey: 'app:shapes.hexagon' },
  { value: 'parallelogram', labelKey: 'app:shapes.parallelogram' },
  { value: 'parallelogram-alt', labelKey: 'app:shapes.parallelogram-alt' },
  { value: 'trapezoid', labelKey: 'app:shapes.trapezoid' },
  { value: 'trapezoid-alt', labelKey: 'app:shapes.trapezoid-alt' },
]

/** 连线线型下拉选项 */
export const LINK_STYLE_OPTIONS: Array<OptionEntry<LinkLineStyle>> = [
  { value: 'solid', labelKey: 'app:linkStyles.solid' },
  { value: 'dotted', labelKey: 'app:linkStyles.dotted' },
  { value: 'thick', labelKey: 'app:linkStyles.thick' },
  { value: 'invisible', labelKey: 'app:linkStyles.invisible' },
]

/** 终点箭头下拉选项 */
export const ARROW_OPTIONS: Array<OptionEntry<ArrowMarker>> = [
  { value: 'arrow', labelKey: 'app:arrows.arrow' },
  { value: 'none', labelKey: 'app:arrows.none' },
  { value: 'circle', labelKey: 'app:arrows.circle' },
  { value: 'cross', labelKey: 'app:arrows.cross' },
]

/** 图方向选项 */
export const DIRECTION_OPTIONS: Array<OptionEntry<'TB' | 'BT' | 'LR' | 'RL'>> = [
  { value: 'TB', labelKey: 'app:directions.TB' },
  { value: 'BT', labelKey: 'app:directions.BT' },
  { value: 'LR', labelKey: 'app:directions.LR' },
  { value: 'RL', labelKey: 'app:directions.RL' },
]

/** 方向 token 全集（DiagramForm 判定「手写值」等只用取值的场合） */
export const DIRECTION_VALUES: ReadonlyArray<'TB' | 'BT' | 'LR' | 'RL'> = DIRECTION_OPTIONS.map(
  (d) => d.value,
)

// ---------- classDef 常用样式项（工单验收：填充/边框/线型/文字色） ----------

export type BorderDashStyle = 'solid' | 'dashed' | 'dotted'

export const BORDER_DASH_OPTIONS: Array<OptionEntry<BorderDashStyle>> = [
  { value: 'solid', labelKey: 'app:borderDash.solid' },
  { value: 'dashed', labelKey: 'app:borderDash.dashed' },
  { value: 'dotted', labelKey: 'app:borderDash.dotted' },
]

/** Mermaid 的 stroke-dasharray 取值 ↔ 表单枚举 */
export const DASHARRAY_VALUE: Record<Exclude<BorderDashStyle, 'solid'>, string> = {
  dashed: '5 5',
  dotted: '2 2',
}

export function dasharrayToStyle(value: string | undefined): BorderDashStyle {
  if (value === undefined || value.trim() === '') return 'solid'
  if (value.trim() === DASHARRAY_VALUE.dotted) return 'dotted'
  if (value.trim() === DASHARRAY_VALUE.dashed) return 'dashed'
  return 'solid'
}

/** classDef 常用样式项的源码属性名 */
export const CLASSDEF_STYLE_PROPS = {
  fill: 'fill',
  stroke: 'stroke',
  dasharray: 'stroke-dasharray',
  color: 'color',
} as const

export interface ClassDefStyle {
  /** 空串 = 未设置（不产出意图） */
  fill?: string
  stroke?: string
  dashStyle?: BorderDashStyle
  color?: string
}

/**
 * classDef 常用样式表单值 → set-classdef-prop 意图列表（每个属性一个意图）。
 * dashStyle solid = 删除 stroke-dasharray 属性（value 空串）。
 * 只为显式给出的字段产出意图。
 */
export function classDefStyleIntents(name: string, style: ClassDefStyle): FlowchartIntent[] {
  const intents: FlowchartIntent[] = []
  if (style.fill !== undefined && style.fill !== '') {
    intents.push({ type: 'set-classdef-prop', name, prop: CLASSDEF_STYLE_PROPS.fill, value: style.fill })
  }
  if (style.stroke !== undefined && style.stroke !== '') {
    intents.push({ type: 'set-classdef-prop', name, prop: CLASSDEF_STYLE_PROPS.stroke, value: style.stroke })
  }
  if (style.dashStyle !== undefined) {
    intents.push({
      type: 'set-classdef-prop',
      name,
      prop: CLASSDEF_STYLE_PROPS.dasharray,
      value: style.dashStyle === 'solid' ? '' : DASHARRAY_VALUE[style.dashStyle],
    })
  }
  if (style.color !== undefined && style.color !== '') {
    intents.push({ type: 'set-classdef-prop', name, prop: CLASSDEF_STYLE_PROPS.color, value: style.color })
  }
  return intents
}

// ---------- 节点表单 → 意图 ----------

export function setNodeTextIntent(nodeId: string, text: string): FlowchartIntent {
  return { type: 'set-node-text', nodeId, text }
}

export function setNodeShapeIntent(nodeId: string, shape: NodeShapeType): FlowchartIntent {
  return { type: 'set-node-shape', nodeId, shape }
}

export function renameNodeIntent(nodeId: string, newId: string): FlowchartIntent | null {
  if (!isValidNewNodeId(newId) || newId === nodeId) return null
  return { type: 'rename-node', nodeId, newId }
}

export function deleteNodeIntent(nodeId: string): FlowchartIntent {
  return { type: 'delete-node', nodeId }
}

export interface AddNodeForm {
  nodeId: string
  text: string
  shape: NodeShapeType
}

/** 新增节点表单值 → add-node 意图；id 非法时返回 null（表单层提示） */
export function addNodeIntent(form: AddNodeForm): FlowchartIntent | null {
  if (!isValidNewNodeId(form.nodeId)) return null
  return {
    type: 'add-node',
    nodeId: form.nodeId,
    text: form.text !== '' ? form.text : form.nodeId,
    shape: form.shape,
  }
}

// ---------- 连线表单 → 意图 ----------

export interface EdgeSpecForm {
  lineStyle?: LinkLineStyle
  head?: ArrowMarker
  bidirectional?: boolean
  length?: number
  label?: string | null
}

/** 连线属性表单值 → set-edge 意图（未给出的字段保持不变） */
export function setEdgeIntent(
  from: string,
  to: string,
  occurrence: number,
  form: EdgeSpecForm,
): FlowchartIntent {
  return { type: 'set-edge', from, to, occurrence, ...form }
}

export function deleteEdgeIntent(from: string, to: string, occurrence: number): FlowchartIntent {
  return { type: 'delete-edge', from, to, occurrence }
}

export interface AddEdgeForm {
  from: string
  to: string
  label: string
}

/** 新增连线表单值 → add-edge 意图；端点 id 非法时返回 null */
export function addEdgeIntent(form: AddEdgeForm): FlowchartIntent | null {
  if (!isValidNewNodeId(form.from) || !isValidNewNodeId(form.to)) return null
  return {
    type: 'add-edge',
    from: form.from,
    to: form.to,
    lineStyle: 'solid',
    head: 'arrow',
    label: form.label !== '' ? form.label : null,
  }
}

// ---------- 其它表单 → 意图 ----------

export function setDirectionIntent(direction: string): FlowchartIntent {
  return { type: 'set-direction', direction }
}

export function setSubgraphTitleIntent(elementId: string, title: string): FlowchartIntent {
  return { type: 'set-subgraph-title', elementId, title }
}

export function deleteSubgraphIntent(elementId: string): FlowchartIntent {
  return { type: 'delete-subgraph', elementId }
}

export function addSubgraphIntent(title: string): FlowchartIntent {
  return { type: 'add-subgraph', title: title !== '' ? title : undefined }
}

export interface AddClassDefForm {
  name: string
  fill: string
  stroke: string
  dashStyle: BorderDashStyle
  color: string
}

/** 新增样式表单值 → add-classdef 意图（带常用样式项初值）；名字非法时返回 null */
export function addClassDefIntent(form: AddClassDefForm): FlowchartIntent | null {
  if (form.name === '' || /[\s,]/.test(form.name)) return null
  const props: Record<string, string> = {}
  if (form.fill !== '') props[CLASSDEF_STYLE_PROPS.fill] = form.fill
  if (form.stroke !== '') props[CLASSDEF_STYLE_PROPS.stroke] = form.stroke
  if (form.dashStyle !== 'solid') props[CLASSDEF_STYLE_PROPS.dasharray] = DASHARRAY_VALUE[form.dashStyle]
  if (form.color !== '') props[CLASSDEF_STYLE_PROPS.color] = form.color
  return { type: 'add-classdef', name: form.name, props }
}

// ---------- 节点样式应用（工单 02） ----------

/** 勾选样式 → apply-class 意图（落码为 `class 节点 样式名` 语句） */
export function applyClassIntent(nodeId: string, className: string): FlowchartIntent {
  return { type: 'apply-class', nodeId, className }
}

/** 取消勾选 → unapply-class 意图（摘除节点 id 或整行删除） */
export function unapplyClassIntent(nodeId: string, className: string): FlowchartIntent {
  return { type: 'unapply-class', nodeId, className }
}

/** 删除样式 → delete-classdef 意图（同步清理引用它的 class 语句） */
export function deleteClassDefIntent(name: string): FlowchartIntent {
  return { type: 'delete-classdef', name }
}
