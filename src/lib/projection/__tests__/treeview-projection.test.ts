import { describe, expect, it } from 'vitest'
import { treeviewParser } from '../../pipeline/treeview'
import { buildTreeviewProjection, resolveTreeviewSelection } from '../treeview-projection'

/**
 * treeView 投影测试（more-diagrams 工单 24）：位置序身份、缩进组树、
 * 目录/文件语义、虚拟根表达、选中回落（ADR-0012/0016）。
 */

const SOURCE = `treeView-beta
/
    src/
        main.ts
        utils.ts
    docs/
        README.md
`

function projectionOf(source: string) {
  const parsed = treeviewParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildTreeviewProjection(parsed.doc)
}

describe('buildTreeviewProjection（工单 24）', () => {
  const projection = projectionOf(SOURCE)

  it('位置序身份：文档序 treeview-node:1..N（ADR-0012）', () => {
    expect(projection.nodes.map((n) => n.elementId)).toEqual([
      'treeview-node:1',
      'treeview-node:2',
      'treeview-node:3',
      'treeview-node:4',
      'treeview-node:5',
      'treeview-node:6',
    ])
  })

  it('缩进组树：roots = 顶层节点；子目录/文件挂其下（文档序）', () => {
    expect(projection.roots.map((n) => n.name)).toEqual([''])
    const root = projection.roots[0]
    expect(root.isDirectory).toBe(true) // `/`
    expect(root.children.map((c) => c.name)).toEqual(['src', 'docs'])
    expect(root.children[0].children.map((c) => c.name)).toEqual(['main.ts', 'utils.ts'])
    expect(root.children[1].children.map((c) => c.name)).toEqual(['README.md'])
  })

  it('目录 / 文件语义标注（isDirectory）', () => {
    const root = projection.roots[0]
    expect(root.children.map((c) => c.isDirectory)).toEqual([true, true])
    expect(root.children[0].children.map((c) => c.isDirectory)).toEqual([false, false])
  })

  it('level = 缩进字符数，父子由 level 比较决定（mermaid db.addNode 语义）', () => {
    expect(projection.nodes.map((n) => n.level)).toEqual([0, 4, 8, 8, 4, 8])
  })

  it('nextNodeOrdinal = 节点总数 + 1（结尾追加预测）', () => {
    expect(projection.nextNodeOrdinal).toBe(7)
  })

  it('把 tab 与空格混用：level 是字符数，仍能正确组树（research 坑 1）', () => {
    const p = projectionOf('treeView-beta\n/\n\tsrc/\n\t\tmain.ts\n')
    expect(p.roots[0].children[0].name).toBe('src')
    expect(p.roots[0].children[0].children[0].name).toBe('main.ts')
  })

  it('无节点时 roots 为空、nodes 为空、nextNodeOrdinal=1', () => {
    const empty = projectionOf('treeView-beta\n')
    expect(empty.roots).toEqual([])
    expect(empty.nodes).toEqual([])
    expect(empty.nextNodeOrdinal).toBe(1)
  })

  it('注解随投影携带（classRaw / iconRaw / descRaw）', () => {
    const p = projectionOf('treeView-beta\nApp.tsx :::highlight icon(logos:react) ## 主组件\n')
    expect(p.nodes[0]).toMatchObject({
      name: 'App.tsx',
      classRaw: ':::highlight',
      iconRaw: 'icon(logos:react)',
      descRaw: '## 主组件',
    })
  })
})

describe('resolveTreeviewSelection（工单 24）', () => {
  const projection = projectionOf(SOURCE)

  it('存在的节点选中原样返回；diagram 原样返回', () => {
    const sel = { kind: 'treeview-node' as const, elementId: 'treeview-node:3' }
    expect(resolveTreeviewSelection(projection, sel)).toEqual(sel)
    expect(resolveTreeviewSelection(projection, { kind: 'diagram' })).toEqual({ kind: 'diagram' })
  })

  it('已不存在的节点 / null / 别种选中 → null', () => {
    expect(resolveTreeviewSelection(projection, { kind: 'treeview-node', elementId: 'treeview-node:99' })).toBeNull()
    expect(resolveTreeviewSelection(projection, null)).toBeNull()
    expect(resolveTreeviewSelection(projection, { kind: 'node', nodeId: 'A' })).toBeNull()
  })
})
