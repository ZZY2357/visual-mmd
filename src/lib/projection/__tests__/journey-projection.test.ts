import { describe, expect, it } from 'vitest'
import { journeyParser } from '../../pipeline/journey'
import { buildJourneyProjection, resolveJourneySelection } from '../journey-projection'
import type { Selection } from '../selection'

/**
 * journey 投影测试（more-diagrams 工单 08）：元素 id（位置序 ADR-0012）、section→任务
 * 分组归属、越界 score 标注字段、resolveSelection 存在性回落。
 */

const SAMPLE = `journey
    title 用户旅程示例
    section 发现
        访问首页: 5: 用户, 搜索引擎
        浏览商品: 3
    section 决策
        对比价格: 2: 用户, 客服
`

function projectionOf(source: string) {
  const parsed = journeyParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildJourneyProjection(parsed.doc)
}

describe('buildJourneyProjection', () => {
  it('标题 / section / 任务与分组归属（含归属 section 的 elementId）', () => {
    const p = projectionOf(SAMPLE)
    expect(p.title).toBe('用户旅程示例')
    expect(p.sections.map((s) => s.elementId)).toEqual(['section:1', 'section:2'])
    expect(p.sections[0].name).toBe('发现')
    expect(p.sections[0].tasks.map((t) => t.name)).toEqual(['访问首页', '浏览商品'])
    expect(p.sections[1].tasks.map((t) => t.name)).toEqual(['对比价格'])
    expect(p.tasks.map((t) => t.elementId)).toEqual(['task:1', 'task:2', 'task:3'])
    expect(p.tasks[0].sectionElementId).toBe('section:1')
    expect(p.tasks[0].actors).toEqual(['用户', '搜索引擎'])
  })

  it('两段任务（无 actor 冒号）：actors 空数组、score 照常解析', () => {
    const p = projectionOf(SAMPLE)
    expect(p.tasks[1]).toMatchObject({ name: '浏览商品', score: 3, scoreInRange: true, actors: [] })
  })

  it('首个 section 之前的任务进 rootTasks（mermaid 空分组）', () => {
    const p = projectionOf('journey\n    先行任务: 4: 甲\nsection S\n    归组任务: 2\n')
    expect(p.rootTasks.map((t) => t.name)).toEqual(['先行任务'])
    expect(p.rootTasks[0].sectionElementId).toBeNull()
    expect(p.sections[0].tasks.map((t) => t.name)).toEqual(['归组任务'])
  })

  it('越界/非数字 score：scoreText 原样保留，scoreInRange false 供结构树标注', () => {
    const p = projectionOf('journey\n    手滑: 9: 甲\n    怪值: abc\n    边界: 1\n')
    expect(p.tasks[0]).toMatchObject({ scoreText: '9', score: 9, scoreInRange: false })
    expect(p.tasks[1]).toMatchObject({ scoreText: 'abc', score: null, scoreInRange: false })
    expect(p.tasks[2]).toMatchObject({ scoreText: '1', score: 1, scoreInRange: true })
  })

  it('预测序号：Tab 加任务 / Enter 加分组的选中预测（timeline 同口径）', () => {
    const p = projectionOf(SAMPLE)
    // task:2 之后插一个任务 → 该任务之前(含)共 2 个 → 新任务 task:3
    expect(p.tasks[1].nextTaskOrdinal).toBe(3)
    // section:1 之后插一个 section → section:2
    expect(p.sections[0].nextSectionOrdinal).toBe(2)
    expect(p.nextSectionOrdinal).toBe(3)
    expect(p.nextTaskOrdinal).toBe(4)
  })
})

describe('resolveJourneySelection', () => {
  const p = projectionOf(SAMPLE)

  it('存在的选中原样返回；已删除 / 别种 / null / 图表级按约定回落', () => {
    const task: Selection = { kind: 'journey-task', elementId: 'task:1' }
    expect(resolveJourneySelection(p, task)).toEqual(task)
    const section: Selection = { kind: 'journey-section', elementId: 'section:2' }
    expect(resolveJourneySelection(p, section)).toEqual(section)
    expect(resolveJourneySelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(resolveJourneySelection(p, { kind: 'journey-task', elementId: 'task:999' })).toBeNull()
    expect(resolveJourneySelection(p, { kind: 'node', nodeId: 'A' })).toBeNull()
    expect(resolveJourneySelection(p, null)).toBeNull()
  })
})
