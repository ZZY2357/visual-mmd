import { describe, expect, it } from 'vitest'
import { gitgraphParser } from '../../pipeline/gitgraph'
import { buildGitgraphProjection, resolveGitgraphSelection } from '../gitgraph-projection'
import type { Selection } from '../selection'

/**
 * gitGraph 投影测试（more-diagrams 工单 04，ADR-0008/0012/0016）：
 * 位置序提交身份、分支分组（当前分支追踪）、merge/cherry-pick 归组、选中回落。
 */

const SOURCE = `gitGraph
    commit id: "init"
    commit id: "docs"
    branch feature
    commit
    commit id: "feat"
    checkout main
    merge feature
    cherry-pick id: "feat"
`

function projectionOf(source: string) {
  const parsed = gitgraphParser.parse(source)
  if (!parsed.ok) throw new Error(`解析失败：${parsed.error.message}`)
  return buildGitgraphProjection(parsed.doc)
}

describe('buildGitgraphProjection', () => {
  it('方向 / 分支分组 / 位置序提交身份', () => {
    const p = projectionOf(SOURCE)
    expect(p.direction).toBeNull()
    expect(p.branches.map((b) => b.name)).toEqual(['main', 'feature'])
    // main：显式分支前无声明（隐式），其余分支带声明行 elementId
    expect(p.branches[0]).toMatchObject({ name: 'main', elementId: null, order: null })
    expect(p.branches[1]).toMatchObject({ name: 'feature', elementId: 'branch:feature', order: null })

    // 提交身份 = 位置序 `commit:N`（ADR-0012）；id 缺省为 null
    expect(p.commits.map((c) => c.elementId)).toEqual(['commit:1', 'commit:2', 'commit:3', 'commit:4'])
    expect(p.commits.map((c) => c.id)).toEqual(['init', 'docs', null, 'feat'])
    expect(p.commits[2]).toMatchObject({ kind: 'gg-commit', branch: 'feature' })
  })

  it('当前分支追踪：branch 创建并 checkout、checkout/switch 切换、commit/merge 不改分支', () => {
    const p = projectionOf(SOURCE)
    const main = p.branches.find((b) => b.name === 'main')!
    const feature = p.branches.find((b) => b.name === 'feature')!
    expect(main.children.map((c) => c.elementId)).toEqual(['commit:1', 'commit:2', 'merge:1', 'cherry-pick:1'])
    expect(feature.children.map((c) => c.elementId)).toEqual(['commit:3', 'commit:4'])
  })

  it('merge / cherry-pick 归入当前分支，并入扁平列表', () => {
    const p = projectionOf(SOURCE)
    expect(p.merges).toEqual([{ kind: 'gg-merge', elementId: 'merge:1', of: 'feature', branch: 'main', id: null, tag: null, type: null }])
    expect(p.cherryPicks).toEqual([
      { kind: 'gg-cherry-pick', elementId: 'cherry-pick:1', id: 'feat', parent: null, branch: 'main' },
    ])
  })

  it('direction 与 branch order 由解析产物派生', () => {
    const p = projectionOf('gitGraph BT:\n    branch dev order: 3\n    commit\n')
    expect(p.direction).toBe('BT')
    expect(p.branches.find((b) => b.name === 'dev')).toMatchObject({ order: 3 })
  })
})

describe('resolveGitgraphSelection', () => {
  const p = projectionOf(SOURCE)

  it('存在的选中原样返回', () => {
    const cases: Selection[] = [
      { kind: 'diagram' },
      { kind: 'gitgraph-commit', elementId: 'commit:3' },
      { kind: 'gitgraph-branch', name: 'feature' },
      { kind: 'gitgraph-merge', elementId: 'merge:1' },
      { kind: 'gitgraph-cherry-pick', elementId: 'cherry-pick:1' },
    ]
    for (const sel of cases) expect(resolveGitgraphSelection(p, sel)).toEqual(sel)
  })

  it('不存在的选中回落 null；null 进 null 出；别种图种选中不归本投影', () => {
    expect(resolveGitgraphSelection(p, null)).toBeNull()
    expect(resolveGitgraphSelection(p, { kind: 'gitgraph-commit', elementId: 'commit:99' })).toBeNull()
    expect(resolveGitgraphSelection(p, { kind: 'gitgraph-branch', name: '__nope__' })).toBeNull()
    expect(resolveGitgraphSelection(p, { kind: 'er-entity', name: 'E' })).toBeNull()
  })
})
