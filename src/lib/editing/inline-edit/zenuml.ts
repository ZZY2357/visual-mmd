import { isValidZenumlLabel } from '../../pipeline/zenuml'
import type { DiagramInlineEditDefinition } from '../inline-edit'

/**
 * zenuml（more-diagrams 工单 19）双击内联编辑：画布 DOM 无 data-id（任务 0 实测），
 * 双击不可寻址——安静地不进入内联编辑（改别名走右键菜单 / 结构树构造的
 * zenuml-participant 目标）。
 */
export const zenumlInlineEdit: DiagramInlineEditDefinition = {
  targetFromEvent: () => null,
  commitOf: {
    'zenuml-participant': (target, next) => {
      // 非空改动 = set-zenuml-participant-alias（落 `as "…"`；清空 = 去别名回退 id
      // 展示——通用守卫已把清空按 unchanged 关闭，走属性表单而非双击）
      if (!isValidZenumlLabel(next)) return { action: 'invalid' }
      return {
        action: 'commit',
        intent: { type: 'set-zenuml-participant-alias', elementId: target.elementId, alias: next },
      }
    },
  },
}
