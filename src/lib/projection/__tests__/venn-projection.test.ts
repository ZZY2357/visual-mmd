import { describe, expect, it } from 'vitest'
import { vennParser } from '../../pipeline/venn'
import { buildVennProjection, resolveVennSelection, vennCanvasKeyOf } from '../venn-projection'
import type { SourceDocument } from '../../pipeline/document'

/**
 * venn 投影测试（more-diagrams 工单 21）：集合名字即身份、交集位置序身份、
 * canvasKey（data-venn-sets 内容键）、选中回落。
 */

function parse(source: string): SourceDocument {
  const result = vennParser.parse(source)
  if (!result.ok) throw new Error(`解析失败：${result.error.message}`)
  return result.doc
}

const SAMPLE = `venn-beta
    title 团队技能
    set frontend["前端"]
    set backend["后端"]
    set devops
    union frontend,backend["全栈"]
    union frontend,backend,devops["平台工程"]
`

describe('buildVennProjection（more-diagrams 工单 21）', () => {
  it('集合名字即身份、交集位置序身份（文档序）', () => {
    const p = buildVennProjection(parse(SAMPLE))
    expect(p.sets.map((s) => s.elementId)).toEqual(['venn-set:frontend', 'venn-set:backend', 'venn-set:devops'])
    expect(p.unions.map((u) => u.elementId)).toEqual(['venn-union:1', 'venn-union:2'])
    expect(p.areas.map((a) => a.elementId)).toEqual([
      'venn-set:frontend',
      'venn-set:backend',
      'venn-set:devops',
      'venn-union:1',
      'venn-union:2',
    ])
  })

  it('标题 / 标签 / 尺寸从解析产物派生', () => {
    const p = buildVennProjection(parse(SAMPLE))
    expect(p.title).toBe('团队技能')
    expect(p.sets[0]).toMatchObject({ kind: 'set', ids: ['frontend'], label: '前端', sizeText: null })
    expect(p.sets[2]).toMatchObject({ kind: 'set', ids: ['devops'], label: null })
    expect(p.unions[1]).toMatchObject({ kind: 'union', ids: ['frontend', 'backend', 'devops'], label: '平台工程' })
  })

  it('canvasKey = id 列表字典序 `_` 连接（与 data-venn-sets 一致；书写序无关）', () => {
    const p = buildVennProjection(parse(SAMPLE))
    expect(p.sets[0].canvasKey).toBe('frontend')
    expect(p.unions[0].canvasKey).toBe('backend_frontend')
    expect(p.unions[1].canvasKey).toBe('backend_devops_frontend')
    // 逆序书写的同 id 列表得到同一 canvasKey（DOM 键与书写序无关，research §8）
    expect(vennCanvasKeyOf(['backend', 'frontend'])).toBe(vennCanvasKeyOf(['frontend', 'backend']))
  })

  it('下一个集合 id / 下一个交集序号：避重与位置序预测', () => {
    const p = buildVennProjection(parse(SAMPLE))
    expect(p.nextSetId).toBe('set4')
    expect(p.nextUnionOrdinal).toBe(3)
    // 已占用 set2 时跳过
    const q = buildVennProjection(parse('venn-beta\n    set set1\n    set set2\n'))
    expect(q.nextSetId).toBe('set3')
  })

  it('无 title / 无 set 的退化形态', () => {
    const p = buildVennProjection(parse('venn-beta\n'))
    expect(p.title).toBeNull()
    expect(p.sets).toEqual([])
    expect(p.unions).toEqual([])
    expect(p.areas).toEqual([])
  })
})

describe('resolveVennSelection（more-diagrams 工单 21）', () => {
  const p = buildVennProjection(parse(SAMPLE))

  it('存在的集合 / 交集选中原样返回', () => {
    const set = { kind: 'venn-set', id: 'frontend' } as const
    expect(resolveVennSelection(p, set)).toEqual(set)
    const union = { kind: 'venn-union', elementId: 'venn-union:1' } as const
    expect(resolveVennSelection(p, union)).toEqual(union)
    expect(resolveVennSelection(p, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('不存在的集合 / 交集、null、别种选中 → null', () => {
    expect(resolveVennSelection(p, { kind: 'venn-set', id: '__不存在__' })).toBeNull()
    expect(resolveVennSelection(p, { kind: 'venn-union', elementId: 'venn-union:99' })).toBeNull()
    expect(resolveVennSelection(p, null)).toBeNull()
    expect(resolveVennSelection(p, { kind: 'node', nodeId: 'n1' })).toBeNull()
  })
})
