import { Box, Button, Group, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { AnyProjection } from '../lib/diagram-registry'
import type { NodeFormState } from '../lib/editing/use-canvas-context-menu'
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

/**
 * class/sequence 节点菜单的表单浮层（工单 06/04；工单 04-canvas-bundle 自 CanvasPanel 迁出）：
 * 与「添加样式」同款定位/外观，内容按表单种类 × 图种选择添加型小表单
 * （'note' 同时服务 sequence 与 class，由投影图种决定渲染哪个表单），另有取消按钮
 * （提交由表单自身的按钮负责）。`state` 由 useCanvasContextMenu 生成，
 * 其 kind 与投影图种的对应关系由该 hook 保证，此处检查同时是类型收窄。
 */
export function NodeFormPopup(props: { state: NodeFormState; projection: AnyProjection; onClose: () => void }) {
  const { t } = useTranslation()
  const { state, projection } = props
  return (
    <Box
      style={{
        position: 'absolute',
        left: state.x,
        top: state.y,
        zIndex: 30,
        width: 240,
        maxHeight: '80%',
        overflowY: 'auto',
        background: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: 'var(--mantine-radius-sm)',
        boxShadow: 'var(--mantine-shadow-md)',
        padding: 8,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stack gap={6}>
        {state.kind === 'member' && projection.type === 'class' && (
          <AddMemberInlineForm
            classes={projection.class.classes}
            initialClassName={state.className}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'relation' && projection.type === 'class' && (
          <AddRelationInlineForm
            classes={projection.class.classes}
            initialFrom={state.className}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'message' && projection.type === 'sequence' && (
          <AddMessageInlineForm
            participants={projection.sequence.participants}
            initialFrom={state.from}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'note' && projection.type === 'sequence' && (
          <AddNoteInlineForm
            participants={projection.sequence.participants}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'block' && projection.type === 'sequence' && (
          <AddBlockInlineForm afterElementId={state.anchorElementId} onDone={props.onClose} />
        )}
        {state.kind === 'transition' && projection.type === 'state' && (
          <AddTransitionInlineForm
            states={projection.state.states}
            initialFrom={state.from}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'er-attribute' && projection.type === 'er' && state.entity !== undefined && (
          <AddErAttributeInlineForm
            entity={state.entity}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'er-relation' && projection.type === 'er' && (
          <AddErRelationInlineForm
            entities={projection.er.entities}
            initialFrom={state.from}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'requirement-node' && projection.type === 'requirement' && (
          <AddRequirementInlineForm afterElementId={state.anchorElementId} onDone={props.onClose} />
        )}
        {state.kind === 'requirement-element' && projection.type === 'requirement' && (
          <AddRequirementElementInlineForm afterElementId={state.anchorElementId} onDone={props.onClose} />
        )}
        {state.kind === 'requirement-relation' && projection.type === 'requirement' && (
          <AddRequirementRelationInlineForm
            requirements={projection.requirement.requirements}
            elements={projection.requirement.elements}
            initialFrom={state.from}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'block-edge' && projection.type === 'block' && (
          <AddBlockEdgeInlineForm
            nodeIds={projection.block.nodes.map((n) => n.id)}
            groupIds={projection.block.groups.map((g) => g.id)}
            initialFrom={state.from}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        {state.kind === 'note' && projection.type === 'class' && (
          <AddClassNoteInlineForm
            classes={projection.class.classes}
            initialClassName={state.className}
            afterElementId={state.anchorElementId}
            onDone={props.onClose}
          />
        )}
        <Group gap="xs" justify="flex-end">
          <Button size="compact-xs" variant="default" onClick={props.onClose}>
            {t('app:propertyPanel.cancel')}
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}
