import { describe, expect, it } from 'vitest'
import { ganttParser } from '../../pipeline/gantt'
import { buildGanttProjection, resolveGanttSelection } from '../gantt-projection'
import type { Selection } from '../selection'

/**
 * gantt 投影测试（more-diagrams 工单 11）：元素 id（位置序 ADR-0012）、section→任务
 * 分组归属、指令行（文档级属性元素）分区、**mermaid 渲染 id（taskId）预计算**——
 * 显式 id（3 字段第 1 个）直取、自动 `taskN` 只对省略 id 的任务按文档序计数
 * （parseId 口径，ganttDiagram-*.mjs 1095 行，画布 data-id 的依据）、
 * resolveSelection 存在性回落。
 */

const SAMPLE = `gantt
    dateFormat YYYY-MM-DD
    title 项目排期示例

    section 调研
        需求梳理 :done, a1, 2026-01-05, 3d
        方案设计 :2026-01-08, 5d
    section 开发
        编码实现 :after a1, 4d
`

function projectionOf(source: string) {
  const parsed = ganttParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildGanttProjection(parsed.doc)
}

describe('buildGanttProjection', () => {
  it('标题 / dateFormat / section / 任务与分组归属（含归属 section 的 elementId）', () => {
    const p = projectionOf(SAMPLE)
    expect(p.title).toBe('项目排期示例')
    expect(p.dateFormat).toBe('YYYY-MM-DD')
    expect(p.directives.map((d) => d.elementId)).toEqual(['directive:1'])
    expect(p.sections.map((s) => s.elementId)).toEqual(['section:1', 'section:2'])
    expect(p.sections[0].name).toBe('调研')
    expect(p.sections[0].tasks.map((t) => t.name)).toEqual(['需求梳理', '方案设计'])
    expect(p.sections[1].tasks.map((t) => t.name)).toEqual(['编码实现'])
    expect(p.tasks.map((t) => t.elementId)).toEqual(['task:1', 'task:2', 'task:3'])
    expect(p.tasks[0].sectionElementId).toBe('section:1')
  })

  it('任务元数据：标签 / 字段 / 形态化（与解析器共用 parseGanttTaskMeta）', () => {
    const p = projectionOf(SAMPLE)
    expect(p.tasks[0].tags).toEqual(['done'])
    expect(p.tasks[0].fields).toEqual(['a1', '2026-01-05', '3d'])
    expect(p.tasks[0].meta?.shape).toBe('date-duration')
    expect(p.tasks[0].meta?.taskId).toBe('a1')
    expect(p.tasks[1].meta?.shape).toBe('date-duration')
    expect(p.tasks[2].meta?.shape).toBe('after-end')
    // 清单外形态：meta null，原样展示
    const odd = projectionOf('gantt\n    手滑 : 3d\n')
    expect(odd.tasks[0].meta).toBeNull()
    expect(odd.tasks[0].fields).toEqual(['3d'])
  })

  it('mermaid 渲染 id 预计算：显式 id 直取、自动 taskN 只对省略 id 的任务按文档序计数', () => {
    const p = projectionOf(SAMPLE)
    // task:1 显式 id a1（3 字段）；task:2 / task:3 省略 → 自动 task1 / task2（parseId 只对
    // 省略 id 的任务递增，不是文档位置序）
    expect(p.tasks.map((t) => t.taskId)).toEqual(['a1', 'task1', 'task2'])
    const mixed = projectionOf('gantt\n    甲 :b1, 2026-01-01, 3d\n    乙 :2026-01-02, 3d\n    丙 :2026-01-03, 3d\n')
    expect(mixed.tasks.map((t) => t.taskId)).toEqual(['b1', 'task1', 'task2'])
  })

  it('首个 section 之前的任务进 rootTasks（mermaid 空分组）', () => {
    const p = projectionOf('gantt\n    先行任务 :2026-01-01, 3d\nsection S\n    归组任务 :2026-01-02, 3d\n')
    expect(p.rootTasks.map((t) => t.name)).toEqual(['先行任务'])
    expect(p.rootTasks[0].sectionElementId).toBeNull()
    expect(p.sections[0].tasks.map((t) => t.name)).toEqual(['归组任务'])
  })

  it('预测序号：Tab 加任务 / Enter 加分组的选中预测（journey 同口径）', () => {
    const p = projectionOf(SAMPLE)
    // task:2 之后插一个任务 → 该任务之前(含)共 2 个 → 新任务 task:3
    expect(p.tasks[1].nextTaskOrdinal).toBe(3)
    // section:1 之后插一个 section → section:2
    expect(p.sections[0].nextSectionOrdinal).toBe(2)
    expect(p.nextSectionOrdinal).toBe(3)
    expect(p.nextTaskOrdinal).toBe(4)
  })

  it('无 dateFormat 指令行：dateFormat null（表单/测试便捷取值）', () => {
    const p = projectionOf('gantt\n    任务 :2026-01-01, 3d\n')
    expect(p.dateFormat).toBeNull()
  })
})

describe('resolveGanttSelection', () => {
  const p = projectionOf(SAMPLE)

  it('存在的选中原样返回；已删除 / 别种 / null / 图表级按约定回落', () => {
    const task: Selection = { kind: 'gantt-task', elementId: 'task:1' }
    expect(resolveGanttSelection(p, task)).toEqual(task)
    const section: Selection = { kind: 'gantt-section', elementId: 'section:2' }
    expect(resolveGanttSelection(p, section)).toEqual(section)
    const directive: Selection = { kind: 'gantt-directive', elementId: 'directive:1' }
    expect(resolveGanttSelection(p, directive)).toEqual(directive)
    expect(resolveGanttSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveGanttSelection(p, { kind: 'gantt-task', elementId: 'task:999' })).toBeNull()
    expect(resolveGanttSelection(p, { kind: 'node', nodeId: 'A' })).toBeNull()
    expect(resolveGanttSelection(p, null)).toBeNull()
  })
})
