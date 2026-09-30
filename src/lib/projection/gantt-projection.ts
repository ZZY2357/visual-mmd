import type { SourceDocument } from '../pipeline/document'
import {
  type GanttDirectiveData,
  type GanttSectionData,
  type GanttTaskData,
  type GanttTitleData,
  parseGanttTaskMeta,
} from '../pipeline/gantt'
import type { Selection } from './selection'

/**
 * gantt 投影（more-diagrams 工单 11，ADR-0008/0016）：从解析产物派生的只读结构视图，
 * 驱动结构树与属性表单。投影只认解析产物的 *Data（ADR-0016）。
 *
 * - 任务是节点元素：名字 + 标签 + 元数据形态，按**位置序**编 elementId（`task:N`，
 *   ADR-0012——任务的显式 id 可重复/省略/含任意字符，位置序是唯一稳定身份）。
 * - section 是分组：section 行之后、下一个 section 行之前的任务归入它；
 *   首个 section 之前的任务进 rootTasks（mermaid 按空 section 名归组，渲染无标题）。
 * - 指令行是**文档级属性元素**（工单定案）：dateFormat / axisFormat / tickInterval /
 *   excludes / todayMarker 各成 `directive:N` 条目，可选中、表单可改值。
 * - mermaid 渲染 id（taskId）预计算：显式 id（3 个逗号字段时的第 1 个）或自动
 *   `taskN`（parseId 计数器只在省略 id 时递增、每次 render 前 clear 重置、按文档序
 *   确定——ganttDiagram-*.mjs 834/1095 行，工单 Comments 记录证据）。它是画布
 *   data-id（渲染后处理回注），与编辑器 elementId 分离；显式 id 重复时画布命中
 *   首个（与 DOM getElementById 语义一致，记录在案）。
 * - 清单外元数据形态（1 字段 / 空字段 / 前缀不完整）meta = null 原样展示——
 *   任务仍可寻址，元数据编辑需先在表单选形态（不静默改写用户源码，工单定案）。
 */
export interface ProjectionGanttTask {
  /** `task:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 任务名（不含冒号——词法边界，见 pipeline/gantt.ts） */
  name: string
  /** 标签前缀（done/active/crit/milestone/vert，原文保序） */
  tags: string[]
  /** 去掉标签后的逗号字段（trim 后原文） */
  fields: string[]
  /** 形态化元数据；清单外形态 null（结构树/表单标注「其他形态」） */
  meta: ReturnType<typeof parseGanttTaskMeta>['meta']
  /** mermaid 渲染 id（画布 data-id）：显式 id 或自动 `taskN` */
  taskId: string
  /** 归属 section 的 elementId；首个 section 之前为 null（mermaid 空分组） */
  sectionElementId: string | null
  /** 同 section 加任务的落码锚点 = 本任务自身（insertAfter 的 line-end） */
  tailElementId: string
  /** 下一个新增任务的预测序号（= 本任务之前(含)的任务总数 + 1；键盘 Tab 用） */
  nextTaskOrdinal: number
}

export interface ProjectionGanttSection {
  /** `section:N`，文档序身份 + 编辑意图寻址键 */
  elementId: string
  /** 名称文本 */
  name: string
  /** 归属任务（文档序） */
  tasks: ProjectionGanttTask[]
  /** 加下一 section 的落码锚点：本分组最后一个任务 ?? 分组行自身 */
  tailElementId: string
  /** 下一个新增 section 的预测序号（= 本分组之前(含)的分组总数 + 1；Enter 用） */
  nextSectionOrdinal: number
}

export interface ProjectionGanttDirective {
  /** `directive:N`，文档序身份 + 编辑意图寻址键 */
  elementId: string
  /** 指令关键词原文（dateFormat / axisFormat / tickInterval / excludes / todayMarker） */
  keyword: string
  /** 值段原文（todayMarker 的 off 开关即 value === 'off'） */
  value: string
}

export interface GanttProjection {
  /** 图表标题文本（`title` 行）；无 null */
  title: string | null
  /** dateFormat 指令值；无该指令行 null（表单/测试便捷取值） */
  dateFormat: string | null
  /** 全部指令行（文档序；文档级属性元素分区） */
  directives: ProjectionGanttDirective[]
  /** 全部 section（文档序） */
  sections: ProjectionGanttSection[]
  /** 首个 section 之前的任务（文档序；mermaid 空分组） */
  rootTasks: ProjectionGanttTask[]
  /** 全部任务（文档序；结构树 / 键盘 / 表单寻址） */
  tasks: ProjectionGanttTask[]
  /** 下一个新增 section 的预测序号（右键空白加分组用；= 分组总数 + 1） */
  nextSectionOrdinal: number
  /** 下一个新增任务的预测序号（右键空白加任务用；= 任务总数 + 1） */
  nextTaskOrdinal: number
}

/**
 * mermaid 渲染 id（画布 data-id）：3 个逗号字段（标签剥离后）的第 1 个是显式 id
 * （compileData case 3 的 `parseId(data[0])`）；否则自动 `taskN`——N 只对省略 id 的
 * 任务按文档序递增（parseId 1095 行：idStr === undefined 才 taskCnt++）。
 */
function ganttRenderTaskIdOf(fields: string[], autoOrdinal: number): string {
  return fields.length >= 3 ? fields[0] : `task${autoOrdinal}`
}

/** 从解析产物构建 gantt 投影（纯函数，ADR-0016：投影吃 IR/解析产物） */
export function buildGanttProjection(doc: SourceDocument): GanttProjection {
  const directives: ProjectionGanttDirective[] = []
  const sections: ProjectionGanttSection[] = []
  const rootTasks: ProjectionGanttTask[] = []
  const tasks: ProjectionGanttTask[] = []
  let title: string | null = null
  let currentSection: ProjectionGanttSection | null = null

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'gantt-title') {
      title = (data as GanttTitleData).text
    } else if (data.kind === 'gantt-directive') {
      const directive = data as GanttDirectiveData
      directives.push({ elementId: part.id, keyword: directive.keyword, value: directive.value })
    } else if (data.kind === 'gantt-section') {
      const section: ProjectionGanttSection = {
        elementId: part.id,
        name: (data as GanttSectionData).name,
        tasks: [],
        tailElementId: part.id,
        nextSectionOrdinal: sections.length + 1,
      }
      sections.push(section)
      currentSection = section
    } else if (data.kind === 'gantt-task') {
      const node = data as GanttTaskData
      const parsed = parseGanttTaskMeta(node.metadata)
      const task: ProjectionGanttTask = {
        elementId: part.id,
        name: node.name,
        tags: parsed.tags,
        fields: parsed.fields,
        meta: parsed.meta,
        taskId: '',
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

  // 预测序号与渲染 id：按文档序累加（tasks 即文档序；自动 id 只对省略显式 id 的任务计数）
  let tasksThrough = 0
  let autoOrdinal = 0
  for (const task of tasks) {
    tasksThrough++
    task.nextTaskOrdinal = tasksThrough + 1
    // parseId 只对省略显式 id 的任务递增计数器（ganttDiagram-*.mjs 1095 行口径）
    if (task.fields.length < 3) autoOrdinal++
    task.taskId = ganttRenderTaskIdOf(task.fields, autoOrdinal)
  }
  sections.forEach((section, index) => {
    section.nextSectionOrdinal = index + 2
  })

  const dateFormat = directives.find((d) => d.keyword.toLowerCase() === 'dateformat')?.value ?? null

  return {
    title,
    dateFormat,
    directives,
    sections,
    rootTasks,
    tasks,
    nextSectionOrdinal: sections.length + 1,
    nextTaskOrdinal: tasks.length + 1,
  }
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveGanttSelection(
  projection: GanttProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'gantt-task':
      return projection.tasks.some((t) => t.elementId === selection.elementId) ? selection : null
    case 'gantt-section':
      return projection.sections.some((s) => s.elementId === selection.elementId) ? selection : null
    case 'gantt-directive':
      return projection.directives.some((d) => d.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
