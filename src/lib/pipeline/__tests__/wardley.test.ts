import { describe, expect, it } from 'vitest'
import {
  isValidWardleyCoord,
  isValidWardleyEvolutionTarget,
  isValidWardleyName,
  isBareWardleyName,
  renderWardleyNameToken,
  wardleyParser,
  type WardleyEvolveData,
  type WardleyDocLineData,
  type WardleyLinkData,
  type WardleyNodeData,
  type WardleyPipelineData,
} from '../wardley'
import { reassemble } from '../document'

/**
 * wardley 解析器 / 意图 / 逐字保留测试（more-diagrams 工单 23，ADR-0004/0008/0012）。
 * 覆盖：行级识别（声明 / 节点 / 连线 / evolve / pipeline 块 / 文档级行）、坐标 [可见度, 演化度]、
 * 名字即身份 vs 位置序身份、意图落地（增删改）与原文逐字保留。
 */

const SOURCE = `wardley-beta
title 茶铺价值链
size [1100, 600]

evolution "未建模" -> "分化" -> "收敛" -> "商品化"

anchor "顾客" [0.95, 0.63]
component "茶" [0.63, 0.81]
component "热水" [0.52, 0.80] (inertia)
component "水壶" [0.43, 0.35]

"顾客" -> "茶"
"茶" --> "热水"
"热水" -.-> "水壶"

evolve "水壶" 0.62
`

function parse(src: string) {
  const r = wardleyParser.parse(src)
  if (!r.ok) throw new Error(`解析失败：${r.error.message}`)
  return r.doc
}

const apply = (src: string, intent: Parameters<typeof wardleyParser.resolveRewrites>[1]) => {
  const doc = parse(src)
  const rewrites = wardleyParser.resolveRewrites(doc, intent)
  if (rewrites === null) throw new Error(`意图被拒绝：${JSON.stringify(intent)}`)
  return reassemble(doc, rewrites)
}

describe('wardleyParser 行级解析', () => {
  it('声明行 + 文档级属性行（title / size / evolution）各成元素', () => {
    const doc = parse(SOURCE)
    const kinds = doc.elements.map((p) => p.element.kind)
    expect(kinds[0]).toBe('wardley-header')
    expect(
      doc.elements
        .filter((p) => p.element.kind === 'wardley-doc')
        .map((p) => (p.element as WardleyDocLineData).docKind),
    ).toEqual(['title', 'size', 'evolution'])
  })

  it('节点识别 component / anchor，坐标按 [可见度, 演化度] 落（第一项 Y）', () => {
    const doc = parse(SOURCE)
    const nodes = doc.elements
      .filter((p) => p.element.kind === 'wardley-node')
      .map((p) => p.element as WardleyNodeData)
    expect(nodes.map((n) => [n.nodeKind, n.name.name])).toEqual([
      ['anchor', '顾客'],
      ['component', '茶'],
      ['component', '热水'],
      ['component', '水壶'],
    ])
    // 茶 = [0.63, 0.81] → visibility 0.63, evolution 0.81
    expect(nodes[1].coords).toEqual({ visibility: '0.63', evolution: '0.81' })
  })

  it('pipeline 块整块识别为一个元素（raw 逐字保留）', () => {
    const src = `wardley-beta\ncomponent "水壶" [0.43, 0.35]\npipeline "水壶" {\n    component "加热" [0.6, 0.4]\n    component "控温" [0.7, 0.5]\n}\n`
    const doc = parse(src)
    const pipes = doc.elements.filter((p) => p.element.kind === 'wardley-pipeline')
    expect(pipes).toHaveLength(1)
    const pipe = pipes[0].element as WardleyPipelineData
    expect(pipe.parent.name).toBe('水壶')
    expect(pipe.raw).toContain('component "加热"')
    // 块内节点不单独成元素（工单定案：整块一个元素，不做块内编辑）
    expect(doc.elements.filter((p) => p.element.kind === 'wardley-node')).toHaveLength(1)
  })

  it('连线三种箭头都识别（from/to 为名字引用）', () => {
    const doc = parse(SOURCE)
    const links = doc.elements
      .filter((p) => p.element.kind === 'wardley-link')
      .map((p) => p.element as WardleyLinkData)
    expect(links.map((l) => [l.from.name, l.arrow, l.to.name])).toEqual([
      ['顾客', '->', '茶'],
      ['茶', '-->', '热水'],
      ['热水', '-.->', '水壶'],
    ])
  })

  it('evolve 行识别（名字 + 目标原文）', () => {
    const doc = parse(SOURCE)
    const evolves = doc.elements
      .filter((p) => p.element.kind === 'wardley-evolve')
      .map((p) => p.element as WardleyEvolveData)
    expect(evolves).toHaveLength(1)
    expect(evolves[0].name.name).toBe('水壶')
    expect(evolves[0].target).toBe('0.62')
  })

  it('非 wardley-beta 源码解析失败', () => {
    const r = wardleyParser.parse('flowchart TB\n  A --> B')
    expect(r.ok).toBe(false)
  })
})

describe('wardley 校验助手', () => {
  it('坐标：0–100 数字合法，负号 / 前导零省略的 .5 / 空 / 非数字非法', () => {
    expect(isValidWardleyCoord('0')).toBe(true)
    expect(isValidWardleyCoord('0.5')).toBe(true)
    expect(isValidWardleyCoord('100')).toBe(true)
    expect(isValidWardleyCoord('.5')).toBe(false)
    expect(isValidWardleyCoord('-0.1')).toBe(false)
    expect(isValidWardleyCoord('')).toBe(false)
    expect(isValidWardleyCoord('abc')).toBe(false)
  })

  it('evolve 目标：同坐标界且不得超 100', () => {
    expect(isValidWardleyEvolutionTarget('0.62')).toBe(true)
    expect(isValidWardleyEvolutionTarget('100')).toBe(true)
    expect(isValidWardleyEvolutionTarget('101')).toBe(false)
  })

  it('名字：非空且无引号 / 换行', () => {
    expect(isValidWardleyName('茶')).toBe(true)
    expect(isValidWardleyName('Tea')).toBe(true)
    expect(isValidWardleyName('')).toBe(false)
    expect(isValidWardleyName('a"b')).toBe(false)
    expect(isValidWardleyName('a\nb')).toBe(false)
  })

  it('裸名（全 ASCII 词）不引号；含非 ASCII 或空格需引号', () => {
    expect(isBareWardleyName('Tea')).toBe(true)
    expect(isBareWardleyName('my-tea')).toBe(true)
    expect(isBareWardleyName('茶')).toBe(false)
    expect(isBareWardleyName('my tea')).toBe(false)
    expect(renderWardleyNameToken('Tea')).toBe('Tea')
    expect(renderWardleyNameToken('茶')).toBe('"茶"')
  })
})

describe('wardley 意图落地（逐字保留）', () => {
  it('改节点名：其余原文逐字保留，中文自动加引号', () => {
    const out = apply(SOURCE, { type: 'set-node-name', elementId: 'wardley-node:茶', name: '茶叶' })
    expect(out).toContain('component "茶叶" [0.63, 0.81]')
    expect(out).toContain('title 茶铺价值链')
    expect(out).toContain('"顾客" -> "茶"') // 连线行不被改动（名字引用不级联改）
  })

  it('改坐标：只动该节点行，原文含空格形态保留', () => {
    const out = apply(SOURCE, {
      type: 'set-node-coords',
      elementId: 'wardley-node:热水',
      visibility: '0.5',
      evolution: '0.9',
    })
    expect(out).toContain('component "热水" [0.5, 0.9]')
  })

  it('删除节点：级联删除同名触及连线与 evolve', () => {
    const out = apply(SOURCE, { type: 'delete-node', elementId: 'wardley-node:水壶' })
    expect(out).not.toContain('component "水壶"')
    expect(out).not.toContain('"热水" -.-> "水壶"')
    expect(out).not.toContain('evolve "水壶" 0.62')
    // 其它连线保留
    expect(out).toContain('"顾客" -> "茶"')
  })

  it('加节点：带锚点插到该节点行之后', () => {
    const out = apply(SOURCE, {
      type: 'add-node',
      nodeKind: 'component',
      name: '配送',
      coords: { visibility: '0.4', evolution: '0.2' },
      afterElementId: 'wardley-node:茶',
    })
    const lines = out.split('\n')
    const teaIdx = lines.findIndex((l) => l.includes('component "茶"'))
    expect(lines[teaIdx + 1]).toContain('component "配送" [0.4, 0.2]')
  })

  it('加连线：两端必须存在于节点（否则拒绝）', () => {
    const ok = apply(SOURCE, { type: 'add-link', from: '茶', to: '水壶' })
    expect(ok).toContain('"茶" -> "水壶"')
    const doc = parse(SOURCE)
    expect(wardleyParser.resolveRewrites(doc, { type: 'add-link', from: '茶', to: '不存在' })).toBeNull()
  })

  it('加 evolve / 改目标：目标值越界拒绝', () => {
    const out = apply(SOURCE, { type: 'add-evolve', name: '茶', target: '0.7' })
    expect(out).toContain('evolve "茶" 0.7')
    const doc = parse(SOURCE)
    expect(wardleyParser.resolveRewrites(doc, { type: 'add-evolve', name: '茶', target: '200' })).toBeNull()
  })

  it('删除文档级属性行 / pipeline 块', () => {
    const noSize = apply(SOURCE, { type: 'delete-doc-line', elementId: 'wardley-doc:2' })
    expect(noSize).not.toContain('size [1100, 600]')
    expect(noSize).toContain('title 茶铺价值链')
  })
})
