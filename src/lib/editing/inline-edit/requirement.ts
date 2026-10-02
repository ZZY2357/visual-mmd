import { isValidRequirementFieldValue } from '../../pipeline/requirement'
import { parseRequirementBlockElementId } from '../../pipeline/element-id'
import type { DiagramInlineEditDefinition } from '../inline-edit'
import { targetFromDataId } from './dom'

/**
 * requirement（more-diagrams 工单 07）双击内联编辑：双击 requirement 节点改 `text`
 * 字段（set-requirement-field 意图；名字是语法标识，不在此改。element 无双击编辑——
 * 工单 07 明确：element 的 type/docref 是元数据，展示与编辑都在右侧表单）。
 */
export const requirementInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: (ctx) => {
    const byId = targetFromDataId(ctx.target, ctx.resolver)
    if (byId === null) return null
    // data-id = 名字（渲染后处理反注），但节点 elementId 带 `requirement:` /
    // `requirement-element:` 前缀——只有 requirement 块可双击（改 text 字段）；
    // element 双击安静忽略（工单 07 明确不做）
    const requirement = parseRequirementBlockElementId(byId.nodeId)
    return requirement !== null ? { kind: 'requirement', name: requirement.name } : null
  },
  commitOf: {
    requirement: (target, next) => {
      // 非空改动 = set text 字段（值含引号/换行非法；清空字段 = 删字段行，走属性表单
      // 而非双击——通用守卫已把清空按 unchanged 关闭）
      if (!isValidRequirementFieldValue(next)) return { action: 'invalid' }
      return {
        action: 'commit',
        intent: { type: 'set-requirement-field', requirement: target.name, field: 'text', value: next },
      }
    },
  },
}
