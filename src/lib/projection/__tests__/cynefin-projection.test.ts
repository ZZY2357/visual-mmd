import { describe, expect, it } from 'vitest'
import { cynefinParser } from '../../pipeline/cynefin'
import { buildCynefinProjection, resolveCynefinSelection } from '../cynefin-projection'

/**
 * cynefin 投影测试（more-diagrams 工单 25）：位置序身份、五固定域恒定存在、
 * 条目归属（按位置）、转移、选中回落（ADR-0012/0016）。
 */

const SOURCE = `cynefin-beta
  title 事件响应分类

  complex
    "排查根因"
    "运行混沌实验"

  clear
    "重启服务"

  complex --> complicated : "模式已识别"
  clear --> chaotic : "自满"
`

function projectionOf(source: string) {
  const parsed = cynefinParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildCynefinProjection(parsed.doc)
}

describe('buildCynefinProjection（工单 25）', () => {
  const projection = projectionOf(SOURCE)

  it('五个固定域恒定存在（声明顺序无关；未声明的域 items 空数组）', () => {
    expect(projection.domains.map((d) => d.name)).toEqual(['complex', 'complicated', 'chaotic', 'clear', 'confusion'])
    expect(projection.domains.map((d) => d.elementId)).toEqual([
      'cynefin-domain:complex',
      'cynefin-domain:complicated',
      'cynefin-domain:chaotic',
      'cynefin-domain:clear',
      'cynefin-domain:confusion',
    ])
    expect(projection.domains.find((d) => d.name === 'complicated')?.items).toEqual([])
    expect(projection.domains.find((d) => d.name === 'confusion')?.items).toEqual([])
  })

  it('declared 标记：有域名词行的域为 true，未声明的域为 false（条目落点判断用）', () => {
    expect(projection.domains.filter((d) => d.declared).map((d) => d.name)).toEqual(['complex', 'clear'])
    expect(projection.domains.find((d) => d.name === 'complicated')?.declared).toBe(false)
    expect(projection.domains.find((d) => d.name === 'confusion')?.declared).toBe(false)
  })

  it('条目位置序身份：文档序 cynefin-item:1..N（ADR-0012）', () => {
    expect(projection.items.map((i) => i.elementId)).toEqual(['cynefin-item:1', 'cynefin-item:2', 'cynefin-item:3'])
  })

  it('条目归属按位置：complex → [排查根因, 运行混沌实验]，clear → [重启服务]', () => {
    expect(projection.domains.find((d) => d.name === 'complex')?.items.map((i) => i.text)).toEqual([
      '排查根因',
      '运行混沌实验',
    ])
    expect(projection.domains.find((d) => d.name === 'clear')?.items.map((i) => i.text)).toEqual(['重启服务'])
  })

  it('转移位置序身份 + from/to/label', () => {
    expect(projection.transitions.map((t) => [t.elementId, t.from, t.to, t.label])).toEqual([
      ['cynefin-transition:1', 'complex', 'complicated', '模式已识别'],
      ['cynefin-transition:2', 'clear', 'chaotic', '自满'],
    ])
  })

  it('文档级属性行整行可寻址', () => {
    expect(projection.docLines.map((d) => [d.elementId, d.docKind])).toEqual([['cynefin-doc:1', 'title']])
  })

  it('nextItemOrdinal / nextTransitionOrdinal = 总数 + 1', () => {
    expect(projection.nextItemOrdinal).toBe(4)
    expect(projection.nextTransitionOrdinal).toBe(3)
  })

  it('空文档：五域恒在、items / transitions 皆空', () => {
    const empty = projectionOf('cynefin-beta\n')
    expect(empty.domains).toHaveLength(5)
    expect(empty.items).toEqual([])
    expect(empty.transitions).toEqual([])
    expect(empty.nextItemOrdinal).toBe(1)
  })
})

describe('resolveCynefinSelection（工单 25）', () => {
  const projection = projectionOf(SOURCE)

  it('存在的域 / 条目 / 转移选中原样返回；diagram 原样返回', () => {
    expect(resolveCynefinSelection(projection, { kind: 'cynefin-domain', name: 'complex' })).toEqual({
      kind: 'cynefin-domain',
      name: 'complex',
    })
    expect(resolveCynefinSelection(projection, { kind: 'cynefin-item', elementId: 'cynefin-item:1' })).toEqual({
      kind: 'cynefin-item',
      elementId: 'cynefin-item:1',
    })
    expect(resolveCynefinSelection(projection, { kind: 'cynefin-transition', elementId: 'cynefin-transition:2' })).toEqual({
      kind: 'cynefin-transition',
      elementId: 'cynefin-transition:2',
    })
    expect(resolveCynefinSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('已不存在的条目 / 转移 / 未知域 / null / 别种选中 → null', () => {
    expect(resolveCynefinSelection(projection, { kind: 'cynefin-item', elementId: 'cynefin-item:99' })).toBeNull()
    expect(resolveCynefinSelection(projection, { kind: 'cynefin-transition', elementId: 'cynefin-transition:99' })).toBeNull()
    expect(resolveCynefinSelection(projection, { kind: 'cynefin-domain', name: 'foo' })).toBeNull()
    expect(resolveCynefinSelection(projection, null)).toBeNull()
    expect(resolveCynefinSelection(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
  })
})
