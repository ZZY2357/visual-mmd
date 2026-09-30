import type { SourceDocument } from '../pipeline/document'
import {
  type TimelineEventData,
  type TimelineHeaderData,
  type TimelinePeriodData,
  type TimelineSectionData,
  type TimelineTitleData,
  timelineDirectionOf,
} from '../pipeline/timeline'
import type { Selection } from './selection'

/**
 * timeline 投影（more-diagrams 工单 05，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 时期（period）是节点，按**位置序**编 elementId（`period:N`，ADR-0012）；
 *   事件（event）是**归属时期**的元素，elementId `event:N`（全局文档序，与 parser 计数器一致），
 *   两种写法（单行冒号串联 inline / 续行 continuation）在投影里同形。
 * - section 是分组：每个 section 之后的时期归入它；首个 section 之前的时期进 rootPeriods。
 * - 每个时期预计算「下一个事件的预测序号」（nextEventOrdinal）与「下一个时期的预测序号」
 *   （nextPeriodOrdinal），键盘 Tab（加事件）/ Enter（加下一时期）据此预测新元素 elementId，
 *   applyPlan 选中新元素。
 */

export interface ProjectionTimelineEvent {
  /** `event:N`，全局文档序身份 + 编辑意图寻址键 */
  elementId: string
  text: string
  /** 单行冒号串联 / 续行 */
  form: 'inline' | 'continuation'
  /** 归属时期的 elementId（`period:N`） */
  periodElementId: string
}

export interface ProjectionTimelinePeriod {
  /** `period:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  text: string
  /** 归属 section 的 elementId；首个 section 之前的时期为 null */
  sectionElementId: string | null
  /** 归属 section 名；无 null */
  sectionName: string | null
  /** 归属事件（文档序） */
  events: ProjectionTimelineEvent[]
  /** 加事件落码锚点：该时期最后一个事件段 ?? 时期段（insertAfter 的 line-end） */
  tailElementId: string
  /** 下一个新增事件的预测序号（= 该时期之前(含)的事件总数 + 1；键盘加事件后选中用） */
  nextEventOrdinal: number
  /** 下一个新增时期的预测序号（= 该时期之前(含)的时期总数 + 1；Enter 加下一时期用） */
  nextPeriodOrdinal: number
}

export interface ProjectionTimelineSection {
  /** `section:N`，文档序身份 + 编辑意图寻址键 */
  elementId: string
  name: string
  /** 该 section 之后的时期（文档序） */
  periods: ProjectionTimelinePeriod[]
}

export interface TimelineProjection {
  /** 图表标题文本（`title` 行）；无 null */
  title: string | null
  /** 方向 token（`LR` / `TD`）；无方向行时 null（表单显示「跟随 Mermaid 默认」） */
  direction: string | null
  /** 全部 section（文档序） */
  sections: ProjectionTimelineSection[]
  /** 首个 section 之前的时期（文档序） */
  rootPeriods: ProjectionTimelinePeriod[]
  /** 全部时期（文档序；结构树 / 键盘 / 表单寻址） */
  periods: ProjectionTimelinePeriod[]
  /** 全部事件（文档序；跨时期全局计数与 parser 一致） */
  events: ProjectionTimelineEvent[]
  /** 下一个新增时期的预测序号（右键空白加时期用；= 时期总数 + 1） */
  nextPeriodOrdinal: number
}

/** 从解析产物构建 timeline 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildTimelineProjection(doc: SourceDocument): TimelineProjection {
  const sections: ProjectionTimelineSection[] = []
  const rootPeriods: ProjectionTimelinePeriod[] = []
  const periods: ProjectionTimelinePeriod[] = []
  const events: ProjectionTimelineEvent[] = []
  let title: string | null = null
  let direction: string | null = null
  let currentSection: ProjectionTimelineSection | null = null
  let currentPeriod: ProjectionTimelinePeriod | null = null
  let eventCount = 0

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'timeline-header') {
      direction = timelineDirectionOf((data as TimelineHeaderData).trailing)
      currentSection = null
      currentPeriod = null
    } else if (data.kind === 'timeline-title') {
      title = (data as TimelineTitleData).text
      currentPeriod = null
    } else if (data.kind === 'timeline-section') {
      const section: ProjectionTimelineSection = {
        elementId: part.id,
        name: (data as TimelineSectionData).name,
        periods: [],
      }
      sections.push(section)
      currentSection = section
      currentPeriod = null
    } else if (data.kind === 'timeline-period') {
      const period: ProjectionTimelinePeriod = {
        elementId: part.id,
        text: (data as TimelinePeriodData).text,
        sectionElementId: currentSection?.elementId ?? null,
        sectionName: currentSection?.name ?? null,
        events: [],
        tailElementId: part.id,
        nextEventOrdinal: 0,
        nextPeriodOrdinal: 0,
      }
      periods.push(period)
      if (currentSection !== null) currentSection.periods.push(period)
      else rootPeriods.push(period)
      currentPeriod = period
    } else if (data.kind === 'timeline-event') {
      // parser 保证事件紧跟在时期段之后；无时期（不合法）时安静忽略
      if (currentPeriod !== null) {
        eventCount++
        const event: ProjectionTimelineEvent = {
          elementId: part.id,
          text: (data as TimelineEventData).text,
          form: (data as TimelineEventData).form,
          periodElementId: currentPeriod.elementId,
        }
        events.push(event)
        currentPeriod.events.push(event)
        currentPeriod.tailElementId = part.id
      }
    }
  }

  // 预测序号：按文档序累加（periods 即文档序）
  let eventsThrough = 0
  periods.forEach((period, index) => {
    eventsThrough += period.events.length
    period.nextEventOrdinal = eventsThrough + 1
    period.nextPeriodOrdinal = index + 2
  })

  return {
    title,
    direction,
    sections,
    rootPeriods,
    periods,
    events,
    nextPeriodOrdinal: periods.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveTimelineSelection(
  projection: TimelineProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'timeline-section':
      return projection.sections.some((s) => s.elementId === selection.elementId) ? selection : null
    case 'timeline-period':
      return projection.periods.some((p) => p.elementId === selection.elementId) ? selection : null
    case 'timeline-event':
      return projection.events.some((e) => e.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
