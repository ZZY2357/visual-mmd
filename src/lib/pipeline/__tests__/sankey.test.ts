import { describe, expect, it } from 'vitest'
import {
  decodeSankeyField,
  encodeSankeyField,
  isValidSankeyName,
  parseSankeyValue,
  renderSankeyLink,
  sankeyParser,
  type SankeyLinkData,
} from '../sankey'
import { reassemble } from '../document'
import { buildSankeyProjection, resolveSankeySelection } from '../../projection/sankey-projection'
import { sankeyDeleteIntent, sankeyKeyPlan } from '../../editing/canvas-keyboard'
import { annotateNodeDataIds } from '../../canvas-selection/node-data-ids'
import { annotateSankeyIdentities } from '../../canvas-selection/edge-locate'
import { DIAGRAM_TYPES } from '../../diagram-registry'
import type { SankeyIntent } from '../sankey'

/**
 * sankey 解析器测试（more-diagrams 工单 13，ADR-0004/0008）：
 * 正文是 CSV 流（RFC-4180 变体）——本文件覆盖解析边界（引号/转义/跨行/空行/畸形行）、
 * 落码门（ASCII 名字 / 严格数值）、节点重命名的手术式同步改写与投影派生。
 * 金样合法性（模板与端到端场景过 mermaid.parse）见 golden-validity.test.ts。
 */

const TEMPLATE = `sankey-beta

electricity,grid,10
electricity,"gas, natural",6
grid,home,9
"gas, natural",home,7
`

function parseOk(source: string) {
  const parsed = sankeyParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败（${parsed.error.line}）：${parsed.error.message}`)
  return parsed.doc
}

function linksOf(source: string): SankeyLinkData[] {
  return parseOk(source).elements
    .filter((p) => p.element.kind === 'sankey-link')
    .map((p) => p.element as SankeyLinkData)
}

function apply(source: string, intent: SankeyIntent): string | null {
  const doc = parseOk(source)
  const rewrites = sankeyParser.resolveRewrites(doc, intent)
  if (rewrites === null) return null
  return reassemble(doc, rewrites)
}

// ---------- 词法助手 ----------

describe('CSV 字段编解码', () => {
  it('引号内成对 "" 还原为字面引号；裸字段原样', () => {
    expect(decodeSankeyField('"a""b"')).toBe('a"b')
    expect(decodeSankeyField('plain')).toBe('plain')
    expect(decodeSankeyField('')).toBe('')
    expect(decodeSankeyField('"x, y"')).toBe('x, y')
  })

  it('编码：含逗号或引号时引号包裹 + "" 转义，否则裸写', () => {
    expect(encodeSankeyField('a, b')).toBe('"a, b"')
    expect(encodeSankeyField('a"b')).toBe('"a""b"')
    expect(encodeSankeyField('plain')).toBe('plain')
  })

  it('编解码往返', () => {
    for (const name of ['plain', 'a, b', 'a"b', 'x, "y", z']) {
      expect(decodeSankeyField(encodeSankeyField(name))).toBe(name)
    }
  })

  it('落码口径：名字非空可打印 ASCII；value 非负整数/小数', () => {
    expect(isValidSankeyName('a')).toBe(true)
    expect(isValidSankeyName('a b,c"d')).toBe(true) // 引号包裹可承载，落码门放行
    expect(isValidSankeyName('')).toBe(false)
    expect(isValidSankeyName('中文')).toBe(false) // mermaid sankey 词法限 \u0020-\u007E
    expect(parseSankeyValue('5')).toBe(5)
    expect(parseSankeyValue(' 12.5 ')).toBe(12.5)
    expect(parseSankeyValue('0')).toBe(0)
    expect(parseSankeyValue('1.2.3')).toBeNull()
    expect(parseSankeyValue('-1')).toBeNull()
    expect(parseSankeyValue('abc')).toBeNull()
    expect(parseSankeyValue('')).toBeNull()
  })
})

// ---------- 解析（CSV 记录流） ----------

describe('sankey 解析：verbatim identity 与 CSV 边界', () => {
  it('模板解析 + 原样重组装逐字相同（verbatim identity）', () => {
    expect(reassemble(parseOk(TEMPLATE))).toBe(TEMPLATE)
  })

  it('引号包列（含逗号）与成对 "" 转义逐字保留；记录按文档序编 link:N', () => {
    const links = linksOf(TEMPLATE)
    expect(links.map((l) => l.sourceRaw)).toEqual([
      'electricity',
      'electricity',
      'grid',
      '"gas, natural"',
    ])
    expect(links[1]!.targetRaw).toBe('"gas, natural"')
    const ids = parseOk(TEMPLATE).elements.map((p) => p.id)
    expect(ids).toEqual(['sankey-header', 'link:1', 'link:2', 'link:3', 'link:4'])
  })

  it('空行与 %% 注释无语义但原文保留；畸形行（引号不平衡 / 列数不为 3）逐字不成元素', () => {
    const src = [
      'sankey-beta',
      '',
      'a,b,1',
      '%% 注释',
      'a,"unbalanced,2', // 引号未闭合
      'a"b,c,1', // 裸字段中间出现引号
      '"a"x,b,1', // 闭引号后跟其他字符
      'only,two', // 2 列
      'a,b,1,extra', // 4 列
      '',
      'c,d,2',
      '',
    ].join('\n')
    const doc = parseOk(src)
    expect(doc.elements.map((p) => p.id)).toEqual(['sankey-header', 'link:1', 'link:2'])
    expect(reassemble(doc)).toBe(src) // 全部原文逐字保留
  })

  it('引号内换行：记录跨物理行（RFC-4180），元素 span 覆盖整条记录', () => {
    const src = 'sankey-beta\n\n"multi\nline",home,2.5\nother,node,1\n'
    const doc = parseOk(src)
    const links = doc.elements.filter((p) => p.element.kind === 'sankey-link')
    expect(links).toHaveLength(2)
    expect(links[0]!.id).toBe('link:1')
    // 跨行记录的原文（含内部换行）整体保留
    expect(doc.source.slice(links[0]!.span.start, links[0]!.span.end)).toBe('"multi\nline",home,2.5')
    expect(links[1]!.id).toBe('link:2')
    expect(reassemble(doc)).toBe(src)
  })

  it('\\r\\n 文件兼容：\\r\\n 作为记录分隔符剥离', () => {
    const src = 'sankey-beta\r\n\r\na,b,1\r\nc,d,2\r\n'
    const links = linksOf(src)
    expect(links.map((l) => l.sourceRaw)).toEqual(['a', 'c'])
    expect(reassemble(parseOk(src))).toBe(src)
  })

  it('value 列非严格词法（mermaid 的 parseFloat 宽松口径）仍成元素并原样保留', () => {
    const links = linksOf('sankey-beta\na,b,1.2.3\n')
    expect(links).toHaveLength(1)
    expect(links[0]!.valueRaw).toBe('1.2.3')
  })

  it('sankey / sankey-beta 两关键字同认（大小写不敏感）；首个非空记录必须是裸关键字', () => {
    expect(() => parseOk('sankey\n\na,b,1')).not.toThrow()
    expect(() => parseOk('SANKEY-BETA\n\na,b,1')).not.toThrow()
    const err = sankeyParser.parse('flowchart TD\nA-->B')
    expect(err.ok).toBe(false)
    expect(err.ok === false && err.error.line).toBe(1)
    // 带尾随内容的声明行不是表头（正文是 CSV 流）
    expect(sankeyParser.parse('sankey-beta extra\n').ok).toBe(false)
    // 空文档（只有声明）可解析：头是唯一元素，空白添加回退锚点 = 头
    const doc = parseOk('sankey-beta\n')
    expect(doc.elements.map((p) => p.id)).toEqual(['sankey-header'])
  })

  it('frontmatter 整块逐字保留', () => {
    const src = '---\nconfig:\n  sankey:\n    showValues: false\n---\nsankey-beta\n\na,b,1\n'
    const doc = parseOk(src)
    expect(doc.elements.map((p) => p.id)).toEqual(['sankey-header', 'link:1'])
    expect(reassemble(doc)).toBe(src)
  })
})

// ---------- 意图落地（落码门 + 手术式改写） ----------

describe('add-link：落码门与自动引号包裹', () => {
  it('追加在最后一个链路行之后（缩进跟随锚点行）', () => {
    const next = apply(TEMPLATE, { type: 'add-link', source: 'grid', target: 'factory', value: '5' })
    // 新记录紧跟最后一个链路行（插在锚点 span 之后），锚点行的行尾换行逐字保留
    expect(next?.endsWith('"gas, natural",home,7\ngrid,factory,5\n')).toBe(true)
  })

  it('名字含逗号/引号时自动引号包裹落码', () => {
    const next = apply(TEMPLATE, { type: 'add-link', source: 'x, y', target: 'a"b', value: '1' })
    expect(next).toContain('\n"x, y","a""b",1')
  })

  it('落码门拒绝：空名字、非 ASCII 名字、非法 value（绝不产出非法 mermaid）', () => {
    const base = TEMPLATE
    expect(apply(base, { type: 'add-link', source: '', target: 'b', value: '1' })).toBeNull()
    expect(apply(base, { type: 'add-link', source: 'a', target: '  ', value: '1' })).toBeNull()
    expect(apply(base, { type: 'add-link', source: '中文', target: 'b', value: '1' })).toBeNull()
    expect(apply(base, { type: 'add-link', source: 'a', target: 'b', value: '1.2.3' })).toBeNull()
    expect(apply(base, { type: 'add-link', source: 'a', target: 'b', value: '-1' })).toBeNull()
    expect(apply(base, { type: 'add-link', source: 'a', target: 'b', value: 'abc' })).toBeNull()
  })

  it('空白文档（只有声明头）也能加链路：锚点回退到头', () => {
    const next = apply('sankey-beta\n', { type: 'add-link', source: 'a', target: 'b', value: '1' })
    // 锚点 = 声明头（其 span 不含换行），新记录紧跟其后，原文的行尾换行逐字保留
    expect(next).toBe('sankey-beta\na,b,1\n')
  })
})

describe('set-link：三列任意子集，未触碰列逐字回写', () => {
  it('只改 value：引号包裹的 source/target 原样（含引号风格）', () => {
    const next = apply(TEMPLATE, { type: 'set-link', elementId: 'link:2', changes: { value: '12.5' } })
    expect(next).toContain('electricity,"gas, natural",12.5')
    expect(next).toContain('electricity,grid,10')
  })

  it('改 source 为含逗号的名字：该列重新编码，其余列原样', () => {
    const next = apply(TEMPLATE, { type: 'set-link', elementId: 'link:1', changes: { source: 'power, grid' } })
    expect(next).toContain('"power, grid",grid,10')
  })

  it('落码门拒绝空名字与非 ASCII', () => {
    expect(apply(TEMPLATE, { type: 'set-link', elementId: 'link:1', changes: { source: '' } })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-link', elementId: 'link:1', changes: { target: '中文' } })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-link', elementId: 'link:1', changes: { value: '' } })).toBeNull()
    expect(apply(TEMPLATE, { type: 'set-link', elementId: 'link:99', changes: { value: '1' } })).toBeNull()
  })
})

describe('delete-link', () => {
  it('整条记录移除，其余行逐字保留', () => {
    const next = apply(TEMPLATE, { type: 'delete-link', elementId: 'link:2' })
    expect(next).not.toContain('electricity,"gas, natural"')
    expect(next).toContain('electricity,grid,10')
    expect(reassemble(parseOk(next as string))).toBe(next)
  })

  it('目标不存在 → null', () => {
    expect(apply(TEMPLATE, { type: 'delete-link', elementId: 'link:99' })).toBeNull()
  })
})

describe('rename-node：手术改写全部触及链路行（节点不落码）', () => {
  it('source / target 两列都同步；未触及行逐字保留；含逗号的新名自动引号包裹', () => {
    const next = apply(TEMPLATE, { type: 'rename-node', name: 'electricity', newName: 'power' })
    expect(next).toContain('power,grid,10')
    expect(next).toContain('power,"gas, natural",6')
    expect(next).toContain('"gas, natural",home,7') // 未触及行原样
    expect(next).not.toContain('electricity')
    expect(reassemble(parseOk(next as string))).toBe(next)
  })

  it('跨行引号记录里只改对应列，其他列（含内部换行）逐字回写；精确同名匹配', () => {
    const src = 'sankey-beta\n\n"multi\nline",home,2.5\nhome,multi,1\n'
    // 重命名跨行节点（名字 = 引号字段解码值，含内部换行）：只改该记录 source 列，
    // target/value 列逐字回写；第二行 target 的裸 multi 是另一个节点，不受影响
    const next = apply(src, { type: 'rename-node', name: 'multi\nline', newName: 'hub' })
    expect(next).toBe('sankey-beta\n\nhub,home,2.5\nhome,multi,1\n')
    // 重命名裸 multi：按解码值精确同名匹配，只同步第二行 target 列，跨行记录不动
    const next2 = apply(src, { type: 'rename-node', name: 'multi', newName: 'hub' })
    expect(next2).toBe('sankey-beta\n\n"multi\nline",home,2.5\nhome,hub,1\n')
  })

  it('落码门：空名 / 非 ASCII 拒绝；同名字 no-op 拒绝；未知节点拒绝', () => {
    expect(apply(TEMPLATE, { type: 'rename-node', name: 'a', newName: '' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'rename-node', name: 'a', newName: '中文' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'rename-node', name: 'grid', newName: 'grid' })).toBeNull()
    expect(apply(TEMPLATE, { type: 'rename-node', name: '__不存在__', newName: 'x' })).toBeNull()
  })

  it('重命名到已有节点名 = 自然合并（mermaid DB 按 Map 去重的同名语义），放行', () => {
    const next = apply(TEMPLATE, { type: 'rename-node', name: 'grid', newName: 'home' })
    expect(next).toContain('electricity,home,10')
    expect(next).toContain('home,home,9')
  })
})

// ---------- 投影 ----------

describe('sankey 投影：节点首现去重派生 + 链路位置序 + 非法标注', () => {
  it('节点 = source/target 首现去重（文档序），linkIds 按参与顺序', () => {
    const projection = buildSankeyProjection(parseOk(TEMPLATE))
    expect(projection.nodes.map((n) => n.name)).toEqual(['electricity', 'grid', 'gas, natural', 'home'])
    expect(projection.nodes[0]!.linkIds).toEqual(['link:1', 'link:2'])
    expect(projection.nextLinkOrdinal).toBe(5)
  })

  it('手写源码的非法名字 / 非法 value 原样保留并标注（不静默改写）', () => {
    const src = 'sankey-beta\n\n中文,a,1\na,b,1.2.3\nb,,5\n'
    const projection = buildSankeyProjection(parseOk(src))
    const badName = projection.nodes.find((n) => n.name === '中文')
    expect(badName?.nameValid).toBe(false)
    const badValue = projection.links[1]!
    expect(badValue.value).toBeNull()
    expect(badValue.valueValid).toBe(false)
    expect(badValue.valueText).toBe('1.2.3')
    // 空串 target 也是非法名字
    expect(projection.nodes.some((n) => n.name === '' && !n.nameValid)).toBe(true)
  })

  it('resolveSankeySelection：现存选中原样返回，不存在 / 别种 → null', () => {
    const projection = buildSankeyProjection(parseOk(TEMPLATE))
    expect(resolveSankeySelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
    expect(
      resolveSankeySelection(projection, { kind: 'sankey-node', name: 'grid' }),
    ).toEqual({ kind: 'sankey-node', name: 'grid' })
    expect(
      resolveSankeySelection(projection, { kind: 'sankey-link', elementId: 'link:1' }),
    ).toEqual({ kind: 'sankey-link', elementId: 'link:1' })
    expect(resolveSankeySelection(projection, { kind: 'sankey-node', name: '__gone__' })).toBeNull()
    expect(resolveSankeySelection(projection, { kind: 'sankey-link', elementId: 'link:99' })).toBeNull()
    expect(resolveSankeySelection(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
    expect(resolveSankeySelection(projection, null)).toBeNull()
  })
})

// ---------- 键盘 ----------

describe('sankey 键盘：Delete 删除链路、Tab 加链路（source 预填同源）', () => {
  const projection = buildSankeyProjection(parseOk(TEMPLATE))

  it('sankeyDeleteIntent：链路 → delete-link；节点不落码无删除 → null', () => {
    expect(sankeyDeleteIntent(projection, { kind: 'sankey-link', elementId: 'link:1' })).toEqual({
      type: 'delete-link',
      elementId: 'link:1',
    })
    expect(sankeyDeleteIntent(projection, { kind: 'sankey-node', name: 'grid' })).toBeNull()
    expect(sankeyDeleteIntent(projection, { kind: 'sankey-link', elementId: 'link:99' })).toBeNull()
    expect(sankeyDeleteIntent(projection, null)).toBeNull()
  })

  it('sankeyKeyPlan：Delete → 删除 + 清空选中；链路上 Tab → sankey-link 表单', () => {
    const del = sankeyKeyPlan(projection, {
      key: 'Delete',
      selection: { kind: 'sankey-link', elementId: 'link:1' },
    })
    expect(del).toEqual({ intents: [{ type: 'delete-link', elementId: 'link:1' }], clearSelection: true })
    const tab = sankeyKeyPlan(projection, {
      key: 'Tab',
      selection: { kind: 'sankey-link', elementId: 'link:1' },
    })
    expect(tab).toEqual({ intents: [], form: 'sankey-link' })
  })

  it('sankeyKeyPlan：节点上 Tab/Delete 无落码语义 → null；Enter 不接（工单定案）', () => {
    expect(sankeyKeyPlan(projection, { key: 'Tab', selection: { kind: 'sankey-node', name: 'grid' } })).toBeNull()
    expect(sankeyKeyPlan(projection, { key: 'Enter', selection: { kind: 'sankey-link', elementId: 'link:1' } })).toBeNull()
    expect(sankeyKeyPlan(projection, { key: 'Tab', mods: { shift: true }, selection: { kind: 'sankey-link', elementId: 'link:1' } })).toBeNull()
    expect(sankeyKeyPlan(projection, { key: 'Tab', selection: null })).toBeNull()
  })
})

// ---------- 结构树 ----------

describe('sankey 结构树：节点作为分组、链路作为其子元素（工单定案）', () => {
  const t = (key: string) => key
  const sections = DIAGRAM_TYPES.sankey.tree(
    DIAGRAM_TYPES.sankey.buildProjection(parseOk(TEMPLATE)),
    { t },
  )
  const nodeEntries = sections.find((s) => s.key === 'nodes')!.entries
  const nodeOf = (name: string) =>
    nodeEntries.find((e) => e.selection.kind === 'sankey-node' && e.selection.name === name)!

  it('节点 = 分组条目，children = 该节点参与的全部链路（参与语义，同一条挂两端）', () => {
    // grid 作为 source 参与 link:1、link:3
    expect(nodeOf('grid').children!.map((c) => c.selection)).toEqual([
      { kind: 'sankey-link', elementId: 'link:1' },
      { kind: 'sankey-link', elementId: 'link:3' },
    ])
    // home 作为 target 参与 link:3、link:4——link:3 同时挂在 grid 与 home 下
    expect(nodeOf('home').children!.map((c) => c.selection)).toEqual([
      { kind: 'sankey-link', elementId: 'link:3' },
      { kind: 'sankey-link', elementId: 'link:4' },
    ])
    // 首现去重的文档序
    expect(nodeEntries.map((e) => (e.selection as { name: string }).name)).toEqual([
      'electricity',
      'grid',
      'gas, natural',
      'home',
    ])
  })
})

// ---------- 画布 DOM 位置序反注 ----------

describe('annotateSankeyIdentities：位置序反注（绝不误标）', () => {
  function buildSankeySvg(nodeCount: number, linkCount: number): HTMLElement {
    const host = document.createElement('div')
    const nodes = Array.from({ length: nodeCount }, (_, i) => `<g class="node" id="node-${i + 7}"></g>`).join('')
    const links = Array.from({ length: linkCount }, () => '<g class="link"><path/></g>').join('')
    host.innerHTML = `<svg><g class="nodes">${nodes}</g><g class="links">${links}</g></svg>`
    return host
  }

  it('节点按 DOM 序反注名字、链路按 DOM 序反注 link:N', () => {
    const root = buildSankeySvg(3, 2)
    annotateSankeyIdentities(root, { nodeNames: ['a', 'b', 'c'], links: 2 })
    const nodes = Array.from(root.querySelectorAll('g.nodes > g.node'))
    expect(nodes.map((g) => g.getAttribute('data-id'))).toEqual(['a', 'b', 'c'])
    const links = Array.from(root.querySelectorAll('g.links > g.link'))
    expect(links.map((g) => g.getAttribute('data-id'))).toEqual(['link:1', 'link:2'])
  })

  it('条数与投影不符的组整体放弃（绝不误标）', () => {
    // 节点条数不符：节点组放弃，链路组正常标注
    const root1 = buildSankeySvg(3, 2)
    annotateSankeyIdentities(root1, { nodeNames: ['a', 'b'], links: 2 })
    expect(root1.querySelector('g.nodes g.node[data-id]')).toBeNull()
    expect(
      Array.from(root1.querySelectorAll('g.links g.link[data-id]')).map((g) => g.getAttribute('data-id')),
    ).toEqual(['link:1', 'link:2'])
    // 链路条数不符：链路组放弃，节点组正常标注
    const root2 = buildSankeySvg(3, 2)
    annotateSankeyIdentities(root2, { nodeNames: ['a', 'b', 'c'], links: 5 })
    expect(
      Array.from(root2.querySelectorAll('g.nodes g.node[data-id]')).map((g) => g.getAttribute('data-id')),
    ).toEqual(['a', 'b', 'c'])
    expect(root2.querySelector('g.links g.link[data-id]')).toBeNull()
  })

  it('与通用 annotateNodeDataIds 组合（use-canvas-selection 的执行顺序）：node-N 计数器 id 不被通用循环误注', () => {
    const root = buildSankeySvg(2, 1)
    annotateNodeDataIds(root)
    expect(root.querySelector('g.nodes g.node[data-id]')).toBeNull() // 通用循环不认 node-N
    annotateSankeyIdentities(root, { nodeNames: ['x', 'y'], links: 1 })
    const nodes = Array.from(root.querySelectorAll('g.nodes > g.node'))
    expect(nodes.map((g) => g.getAttribute('data-id'))).toEqual(['x', 'y'])
  })
})

// ---------- 行渲染助手 ----------

describe('renderSankeyLink', () => {
  it('未触碰列逐字回写', () => {
    const data: SankeyLinkData = { kind: 'sankey-link', sourceRaw: '"a, b"', targetRaw: 'c', valueRaw: '1' }
    expect(renderSankeyLink(data)).toBe('"a, b",c,1')
    expect(renderSankeyLink(data, { valueRaw: '2' })).toBe('"a, b",c,2')
    expect(renderSankeyLink(data, { sourceRaw: 'x', targetRaw: 'y', valueRaw: '3' })).toBe('x,y,3')
  })
})
