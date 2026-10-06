import type { ComponentType, ReactNode } from 'react'
import type { AnyProjection } from '../lib/diagram-registry'
import type { NodeFormKind, NodeFormState } from '../lib/editing/overlay-state'
import type { ClassProjection } from '../lib/projection/class-projection'
import type { SequenceProjection } from '../lib/projection/sequence-projection'
import type { StateProjection } from '../lib/projection/state-projection'
import type { ErProjection } from '../lib/projection/er-projection'
import type { RequirementProjection } from '../lib/projection/requirement-projection'
import type { BlockProjection } from '../lib/projection/block-projection'
import type { SankeyProjection } from '../lib/projection/sankey-projection'
import type { XychartProjection } from '../lib/projection/xychart-projection'
import type { ArchitectureProjection } from '../lib/projection/architecture-projection'
import type { WardleyProjection } from '../lib/projection/wardley-projection'
import type { CynefinProjection } from '../lib/projection/cynefin-projection'
import type { AgentflowProjection } from '../lib/projection/agentflow-projection'
import type { ZenumlProjection } from '../lib/projection/zenuml-projection'
import { AddMemberInlineForm, AddRelationInlineForm, AddClassNoteInlineForm } from './class-forms'
import { AddMessageInlineForm, AddNoteInlineForm, AddBlockInlineForm } from './sequence-forms'
import { AddTransitionInlineForm } from './state-forms'
import { AddErAttributeInlineForm, AddErRelationInlineForm } from './er-forms'
import {
  AddRequirementElementInlineForm,
  AddRequirementInlineForm,
  AddRequirementRelationInlineForm,
} from './requirement-forms'
import { AddBlockEdgeInlineForm } from './block-forms'
import { AddSankeyLinkInlineForm } from './sankey-forms'
import { AddXychartSeriesInlineForm } from './xychart-forms'
import { AddArchitectureEdgeInlineForm } from './architecture-forms'
import { AddWardleyLinkInlineForm } from './wardley-forms'
import { AddCynefinTransitionInlineForm } from './cynefin-forms'
import { AddAgentflowEdgeInlineForm } from './agentflow-forms'
import { AddZenumlMessageInlineForm } from './zenuml-forms'

/**
 * 节点表单（添加型小表单）路由表（architecture-deepening-3 工单 05）：原
 * node-form-popup.tsx 里 20+ 处 `state.kind === 'xxx' && projection.type === 'yyy'`
 * 双条件串收成「图种 → kind → 表单」的声明式表。'note' 同时服务 sequence 与 class，
 * 由投影图种决定渲染哪个表单（与 overlay-state.ts 的 NodeFormKind 注释同口径）。
 * `state` 由 useCanvasContextMenu 生成，其 kind 与投影图种的对应关系由该 hook 保证，
 * 表内条目同时承担类型收窄与渲染。
 */

/** 单条路由条目：图种投影 + 表单负载 + 关闭回调（提交由表单自身的按钮负责） */
interface NodeFormEntryProps<P> {
  projection: P
  state: NodeFormState
  onClose: () => void
}

/** 每图种的 kind → 添加型小表单路由表；条目缺省 = 该图种不提供此表单（渲染 null） */
type NodeFormTable<P> = {
  [N in NodeFormKind]?: ComponentType<NodeFormEntryProps<P>>
}

interface DiagramNodeForms {
  render(projection: AnyProjection, state: NodeFormState, onClose: () => void): ReactNode
}

/** 单点类型擦除：每张表在定义侧已按图种钉死投影类型，这里按 kind 取条目后作为组件渲染 */
function bindNodeForms<P>(table: NodeFormTable<P>): DiagramNodeForms {
  return {
    render: (projection, state, onClose) => {
      const Entry = table[state.kind]
      if (Entry === undefined) return null
      return <Entry projection={projection as P} state={state} onClose={onClose} />
    },
  }
}

const classNodeForms = bindNodeForms<ClassProjection>({
  member: ({ projection, state, onClose }) => (
    <AddMemberInlineForm
      classes={projection.classes}
      initialClassName={state.className}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
  relation: ({ projection, state, onClose }) => (
    <AddRelationInlineForm
      classes={projection.classes}
      initialFrom={state.className}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
  note: ({ projection, state, onClose }) => (
    <AddClassNoteInlineForm
      classes={projection.classes}
      initialClassName={state.className}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const sequenceNodeForms = bindNodeForms<SequenceProjection>({
  message: ({ projection, state, onClose }) => (
    <AddMessageInlineForm
      participants={projection.participants}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
  note: ({ projection, state, onClose }) => (
    <AddNoteInlineForm
      participants={projection.participants}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
  block: ({ state, onClose }) => (
    <AddBlockInlineForm afterElementId={state.anchorElementId} onDone={onClose} />
  ),
})

const stateNodeForms = bindNodeForms<StateProjection>({
  transition: ({ projection, state, onClose }) => (
    <AddTransitionInlineForm
      states={projection.states}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const erNodeForms = bindNodeForms<ErProjection>({
  'er-attribute': ({ state, onClose }) =>
    // 右键目标实体名缺失时不渲染（与原双条件 `state.entity !== undefined` 同口径）
    state.entity === undefined ? null : (
      <AddErAttributeInlineForm
        entity={state.entity}
        afterElementId={state.anchorElementId}
        onDone={onClose}
      />
    ),
  'er-relation': ({ projection, state, onClose }) => (
    <AddErRelationInlineForm
      entities={projection.entities}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const requirementNodeForms = bindNodeForms<RequirementProjection>({
  'requirement-node': ({ state, onClose }) => (
    <AddRequirementInlineForm afterElementId={state.anchorElementId} onDone={onClose} />
  ),
  'requirement-element': ({ state, onClose }) => (
    <AddRequirementElementInlineForm afterElementId={state.anchorElementId} onDone={onClose} />
  ),
  'requirement-relation': ({ projection, state, onClose }) => (
    <AddRequirementRelationInlineForm
      requirements={projection.requirements}
      elements={projection.elements}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const blockNodeForms = bindNodeForms<BlockProjection>({
  'block-edge': ({ projection, state, onClose }) => (
    <AddBlockEdgeInlineForm
      nodeIds={projection.nodes.map((n) => n.id)}
      groupIds={projection.groups.map((g) => g.id)}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const sankeyNodeForms = bindNodeForms<SankeyProjection>({
  'sankey-link': ({ projection, state, onClose }) => (
    <AddSankeyLinkInlineForm
      nodeNames={projection.nodes.map((n) => n.name)}
      initialSource={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const xychartNodeForms = bindNodeForms<XychartProjection>({
  'xychart-line': ({ state, onClose }) => (
    <AddXychartSeriesInlineForm seriesType="line" afterElementId={state.anchorElementId} onDone={onClose} />
  ),
  'xychart-bar': ({ state, onClose }) => (
    <AddXychartSeriesInlineForm seriesType="bar" afterElementId={state.anchorElementId} onDone={onClose} />
  ),
})

const architectureNodeForms = bindNodeForms<ArchitectureProjection>({
  'architecture-edge': ({ projection, state, onClose }) => (
    <AddArchitectureEdgeInlineForm
      serviceIds={[
        ...projection.services.map((s) => s.id),
        ...projection.junctions.map((j) => j.id),
      ]}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const wardleyNodeForms = bindNodeForms<WardleyProjection>({
  'wardley-link': ({ projection, state, onClose }) => (
    <AddWardleyLinkInlineForm
      nodeNames={projection.nodes.map((n) => n.name)}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const cynefinNodeForms = bindNodeForms<CynefinProjection>({
  'cynefin-transition': ({ state, onClose }) => (
    <AddCynefinTransitionInlineForm
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const agentflowNodeForms = bindNodeForms<AgentflowProjection>({
  'agentflow-edge': ({ projection, state, onClose }) => (
    <AddAgentflowEdgeInlineForm
      projection={projection}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

const zenumlNodeForms = bindNodeForms<ZenumlProjection>({
  'zenuml-message': ({ projection, state, onClose }) => (
    <AddZenumlMessageInlineForm
      participants={projection.participants}
      initialFrom={state.from}
      afterElementId={state.anchorElementId}
      onDone={onClose}
    />
  ),
})

/** 图种 id → 已绑定（擦除图种泛型）的节点表单路由；未收录的图种 = 该图种无添加型表单 */
const NODE_FORMS: Partial<Record<string, DiagramNodeForms>> = {
  class: classNodeForms,
  sequence: sequenceNodeForms,
  state: stateNodeForms,
  er: erNodeForms,
  requirement: requirementNodeForms,
  block: blockNodeForms,
  sankey: sankeyNodeForms,
  xychart: xychartNodeForms,
  architecture: architectureNodeForms,
  wardley: wardleyNodeForms,
  cynefin: cynefinNodeForms,
  agentflow: agentflowNodeForms,
  zenuml: zenumlNodeForms,
}

/** 弹层壳（node-form-popup.tsx）的查表入口：按投影图种取路由，未收录返回 null */
export function renderNodeForm(
  projection: AnyProjection,
  state: NodeFormState,
  onClose: () => void,
): ReactNode {
  const forms = NODE_FORMS[projection.type]
  return forms !== undefined ? forms.render(projection, state, onClose) : null
}

