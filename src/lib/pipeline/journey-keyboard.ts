// journey 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { JourneyIntent } from './journey'
import type { JourneyProjection } from '../projection/journey-projection'
import type { Selection } from '../projection/selection'
import { newElementName } from '../../i18n/domain-strings.ts'

// ---------- journey 编辑键（more-diagrams 工单 08 / ADR-0013）：就近结构映射 ----------

/**
 * 选中元素 → 删除意图（journey）：任务与 section（级联删其任务，由管线负责）两类
 * 各映射到既有 delete-* 意图；已不在投影 / null / 图表级 / 别种选中 → null。
 */
export function journeyDeleteIntent(
  projection: JourneyProjection,
  selection: Selection | null,
): JourneyIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'journey-task':
      return projection.tasks.some((t) => t.elementId === selection.elementId)
        ? { type: 'delete-task', elementId: selection.elementId }
        : null
    case 'journey-section':
      return projection.sections.some((s) => s.elementId === selection.elementId)
        ? { type: 'delete-section', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（journey，工单 08 / ADR-0013，工单定案）：
 * - Delete = 删除选中元素（查 journeyDeleteIntent 唯一映射）
 * - 选中任务上 Tab = 同 section 加任务（锚点插入在该任务之后——文档序即渲染序，
 *   新任务与该任务同组）；占位名避重，不做内联编辑（画布无 data-id，工单降级定案）
 * - 选中任务上 Enter = 加 section（落在该任务所属 section 的末尾之后）
 * - section 选中上无 Tab/Enter 语义（不加任务的「锚点」歧义——不扩就近类比；
 *   section 的添加入口是空白菜单 / Enter-on-task）
 * 注：journey 画布 DOM 无 data-id，键操作实际从结构树选中后经画布键盘生效。
 */
export function journeyKeyPlan(projection: JourneyProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = journeyDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'journey-task') return null
  const task = projection.tasks.find((t) => t.elementId === selection.elementId)
  if (task === undefined) return null
  if (input.key === 'Tab') {
    // 同 section 加任务：无 section（空分组）时不带 sectionElementId（锚点 = 本任务）
    const name = nextFreeName(newElementName('task'), projection.tasks.map((t) => t.name))
    return {
      intents: [
        {
          type: 'add-task',
          name,
          score: 3,
          actors: [],
          sectionElementId: task.sectionElementId ?? undefined,
          afterElementId: task.elementId,
        } satisfies JourneyIntent,
      ],
      newElementTarget: {
        selection: { kind: 'journey-task', elementId: `task:${task.nextTaskOrdinal}` },
      },
    }
  }
  // Enter：加 section（落在该任务所属 section 的末尾之后；空分组任务落在文档末尾）
  const section = task.sectionElementId !== null
    ? projection.sections.find((s) => s.elementId === task.sectionElementId)
    : undefined
  const name = nextFreeName(newElementName('section'), projection.sections.map((s) => s.name))
  const anchor = section !== undefined ? section.tailElementId : task.tailElementId
  return {
    intents: [{ type: 'add-section', name, afterElementId: anchor } satisfies JourneyIntent],
    newElementTarget: {
      selection: {
        kind: 'journey-section',
        elementId: `section:${section !== undefined ? section.nextSectionOrdinal : projection.nextSectionOrdinal}`,
      },
    },
  }
}
