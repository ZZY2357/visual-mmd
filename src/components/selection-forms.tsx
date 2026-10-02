import { Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { Selection } from '../lib/projection/selection'
import type { AnyProjection } from '../lib/diagram-registry'
import { DIAGRAM_TYPES, unwrapProjection } from '../lib/diagram-registry'
import './selection-form-routes'

/**
 * 属性表单通用壳（architecture-deepening-3 工单 05）：选中为 null（图表级回落由
 * PropertyPanel 经能力包 resolveSelection 完成后传入）时显示占位文案；否则按投影图种
 * 查注册表 forms 路由表渲染对应表单。各图种的 kind → 表单路由见
 * selection-form-routes.tsx（在组件层定义、模块加载时挂入注册表），
 * 表单组件本体（各 xxx-forms.tsx）不动。
 */
export function ProjectionSelectionForm({
  projection,
  selection,
}: {
  projection: AnyProjection
  selection: Selection | null
}) {
  const { t } = useTranslation()
  if (selection === null) {
    return (
      <Text size="sm" c="dimmed" px="xs">
        {t('app:propertyPanel.nothingSelected')}
      </Text>
    )
  }
  const forms = DIAGRAM_TYPES[projection.type].forms
  return forms !== undefined ? (
    <>{forms.render(unwrapProjection(projection), selection)}</>
  ) : null
}
