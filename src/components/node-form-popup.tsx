import { Box, Button, Group, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { AnyProjection } from '../lib/diagram-registry'
import type { NodeFormState } from '../lib/editing/use-canvas-context-menu'
import { renderNodeForm } from './node-form-popup-routes'

/**
 * class/sequence 节点菜单的表单浮层（工单 06/04；工单 04-canvas-bundle 自 CanvasPanel 迁出）：
 * 与「添加样式」同款定位/外观，内容按表单种类 × 图种渲染添加型小表单，另有取消按钮
 * （提交由表单自身的按钮负责）。路由本体（图种 → kind → 表单的声明式表）见
 * node-form-popup-routes.tsx（architecture-deepening-3 工单 05 收敛，此处只剩壳）。
 * `state` 由 useCanvasContextMenu 生成，其 kind 与投影图种的对应关系由该 hook 保证。
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
        {renderNodeForm(projection, state, props.onClose)}
        <Group gap="xs" justify="flex-end">
          <Button size="compact-xs" variant="default" onClick={props.onClose}>
            {t('app:propertyPanel.cancel')}
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}
