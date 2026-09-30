import type { SourceDocument } from '../pipeline/document'
import {
  type JourneySectionData,
  type JourneyTaskData,
  type JourneyTitleData,
  isJourneyScoreInRange,
  parseJourneyActors,
} from '../pipeline/journey'
import type { Selection } from './selection'

/**
 * journey 投影（more-diagrams 工单 08，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 任务是节点元素：名字 + score + actor 列表，按**位置序**编 elementId（`task:N`，
 *   ADR-0012——journey 语法里没有节点 id，位置序是唯一可行身份）。
 * - section 是分组：section 行之后、下一个 section 行之前的任务归入它；
 *   首个 section 之前的任务进 rootTasks（mermaid 按空 section 名归组，渲染无标题）。
 * - score 越界/非数字（只能来自手写源码）**原样保留**在 scoreText 里，scoreInRange = false
 *   供结构树/表单标注（不静默改写用户源码，工单定案）。
 * - 每个任务预计算「下一个新增任务的预测序号」（nextTaskOrdinal，Tab 同 section 加任务）、
 *   每个 section 预计算「下一个新增 section 的预测序号」（nextSectionOrdinal，Enter 加
 *   下一分组）——插在文档中部时后续元素的位置序身份整体前移（位置序身份的既定代价，
 *   timeline 同口径）。
 */

export interface ProjectionJourneyTask {
  /** `task:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 任务名（不含冒号——词法边界，见 pipeline/journey.ts） */
  name: string
  /** score 段原文（越界/非数字原样保留） */
  scoreText: string
  /** score 段可解析出的整数；非数字 null */
  score: number | null
  /** score 是否为 1–5 合法值（false = 手写源码越界，结构树标注） */
  scoreInRange: boolean
  /** actor 列表（逗号分隔、裁空白、去空项） */
  actors: string[]
  /** 归属 section 的 elementId；首个 section 之前为 null（mermaid 空分组） */
  sectionElementId: string | null
  /** 同 section 加任务的落码锚点 = 本任务自身（insertAfter 的 line-end） */
  tailElementId: string
  /** 下一个新增任务的预测序号（= 本任务之前(含)的任务总数 + 1；键盘 Tab 用） */
  nextTaskOrdinal: number
}

export interface ProjectionJourneySection {
  /** `section:N`，文档序身份 + 编辑意图寻址键 */
  elementId: string
  /** 名称文本 */
  name: string
  /** 归属任务（文档序） */
  tasks: ProjectionJourneyTask[]
  /** 加下一 section 的落码锚点：本分组最后一个任务 ?? 分组行自身 */
  tailElementId: string
  /** 下一个新增 section 的预测序号（= 本分组之前(含)的分组总数 + 1；Enter 用） */
  nextSectionOrdinal: number
}

export interface JourneyProjection {
  /** 图表标题文本（`title` 行）；无 null */
  title: string | null
  /** 全部 section（文档序） */
  sections: ProjectionJourneySection[]
  /** 首个 section 之前的任务（文档序；mermaid 空分组） */
  rootTasks: ProjectionJourneyTask[]
  /** 全部任务（文档序；结构树 / 键盘 / 表单寻址） */
  tasks: ProjectionJourneyTask[]
  /** 下一个新增 section 的预测序号（右键空白加分组用；= 分组总数 + 1） */
  nextSectionOrdinal: number
  /** 下一个新增任务的预测序号（右键空白加任务用；= 任务总数 + 1） */
  nextTaskOrdinal: number
}

/** 从解析产物构建 journey 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildJourneyProjection(doc: SourceDocument): JourneyProjection {
  const sections: ProjectionJourneySection[] = []
  const rootTasks: ProjectionJourneyTask[] = []
  const tasks: ProjectionJourneyTask[] = []
  let title: string | null = null
  let currentSection: ProjectionJourneySection | null = null

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'journey-title') {
      title = (data as JourneyTitleData).text
    } else if (data.kind === 'journey-section') {
      const section: ProjectionJourneySection = {
        elementId: part.id,
        name: (data as JourneySectionData).name,
        tasks: [],
        tailElementId: part.id,
        nextSectionOrdinal: sections.length + 1,
      }
      sections.push(section)
      currentSection = section
    } else if (data.kind === 'journey-task') {
      const node = data as JourneyTaskData
      const task: ProjectionJourneyTask = {
        elementId: part.id,
        name: node.name,
        scoreText: node.score,
        score: parseJourneyScoreSafe(node.score),
        scoreInRange: isJourneyScoreInRange(node.score),
        actors: parseJourneyActors(node.actors),
        sectionElementId: currentSection?.elementId ?? null,
        tailElementId: part.id,
        nextTaskOrdinal: 0,
      }
      tasks.push(task)
      if (currentSection !== null) {
        currentSection.tasks.push(task)
        currentSection.tailElementId = part.id
      } else {
        rootTasks.push(task)
      }
    }
  }

  // 预测序号：按文档序累加（tasks 即文档序）
  let tasksThrough = 0
  sections.forEach((section, index) => {
    for (const task of section.tasks) {
      tasksThrough++
      task.nextTaskOrdinal = tasksThrough + 1
    }
    section.nextSectionOrdinal = index + 2
  })
  for (const task of rootTasks) {
    tasksThrough++
    task.nextTaskOrdinal = tasksThrough + 1
  }

  return {
    title,
    sections,
    rootTasks,
    tasks,
    nextSectionOrdinal: sections.length + 1,
    nextTaskOrdinal: tasks.length + 1,
  }
}

function parseJourneyScoreSafe(score: string): number | null {
  return /^\d+$/.test(score.trim()) ? Number(score.trim()) : null
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveJourneySelection(
  projection: JourneyProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'journey-section':
      return projection.sections.some((s) => s.elementId === selection.elementId) ? selection : null
    case 'journey-task':
      return projection.tasks.some((t) => t.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
