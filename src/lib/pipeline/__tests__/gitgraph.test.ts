import { describe, expect, it } from 'vitest'
import { reassemble, type SourceDocument } from '../document'
import {
  GITGRAPH_COMMIT_TYPES,
  GITGRAPH_DIRECTIONS,
  gitgraphParser,
  isValidGitgraphBranchName,
  renderGitgraphBranch,
  renderGitgraphCommit,
  renderGitgraphHeader,
  renderParamsWith,
  type GitgraphBranchData,
  type GitgraphCommitData,
  type GitgraphHeaderData,
  type GitgraphParam,
} from '../gitgraph'
import { GITGRAPH_TEMPLATE } from '../../diagram-registry'

/**
 * gitGraph 解析器测试（more-diagrams 工单 04）：
 * verbatim identity（ADR-0004/0008）、核心语法覆盖（commit/branch/checkout/merge/cherry-pick/方向）、
 * 意图落码往返、非法编辑拒绝。
 */

function parseOk(source: string): SourceDocument {
  const result = gitgraphParser.parse(source)
  if (!result.ok) throw new Error(`解析失败（${result.error.line}）：${result.error.message}`)
  return result.doc
}

const SIMPLE = `gitGraph
    commit id: "init"
    commit id: "docs"
    branch feature
    commit
    commit id: "feat" tag: "v0.1"
    checkout main
    merge feature id: "m1" tag: "v1.0"
    cherry-pick id: "feat"
`

function elementsOf(doc: SourceDocument, kind: string) {
  return doc.elements.filter((p) => p.element.kind === kind)
}

describe('gitGraph 解析器：verbatim identity（ADR-0004）', () => {
  it('解析后不做修改再重组装，输出与输入逐字相同', () => {
    expect(reassemble(parseOk(SIMPLE), new Map())).toBe(SIMPLE)
  })

  it('起步模板同样逐字还原', () => {
    expect(reassemble(parseOk(GITGRAPH_TEMPLATE), new Map())).toBe(GITGRAPH_TEMPLATE)
  })

  it('清单外语法（注释 / 空行 / frontmatter / 生僻行）逐字保留', () => {
    const source = `---
title: x
---
gitGraph
    %% 注释
    commit

    ??? 生僻语法 ???
    switch feature
`
    expect(reassemble(parseOk(source), new Map())).toBe(source)
  })
})

describe('gitGraph 解析器：语法覆盖（分层对齐核心清单）', () => {
  it('表头方向：缺省 / LR: / TB: / BT:（全方向关键字）', () => {
    expect(elementsOf(doc0('gitGraph\n'), 'gitgraph-header')[0]!.element).toMatchObject({ direction: null })
    for (const dir of GITGRAPH_DIRECTIONS) {
      const doc = parseOk(`gitGraph ${dir}:\n    commit\n`)
      expect(elementsOf(doc, 'gitgraph-header')[0]!.element).toMatchObject({ direction: dir })
      // 方向 token 也在 verbatim identity 内
      expect(reassemble(doc, new Map())).toBe(`gitGraph ${dir}:\n    commit\n`)
    }
  })

  it('commit：裸提交 + id / tag / type 参数', () => {
    const doc = parseOk(SIMPLE)
    const commits = elementsOf(doc, 'gg-commit')
    expect(commits.map((p) => p.id)).toEqual(['commit:1', 'commit:2', 'commit:3', 'commit:4'])
    expect(commits[0]!.element).toMatchObject({ kind: 'gg-commit', keyword: 'commit' })
    expect(paramsOf(commits[0]!.element)).toMatchObject({ id: 'init' })
    expect(paramsOf(commits[3]!.element)).toMatchObject({ id: 'feat', tag: 'v0.1' })

    const typed = parseOk('gitGraph\n    commit id: "a" type: HIGHLIGHT\n')
    expect(paramsOf(elementsOf(typed, 'gg-commit')[0]!.element)).toMatchObject({ id: 'a', type: 'HIGHLIGHT' })
  })

  it('branch：裸名 / order: / 引号名（关键字名）+ order', () => {
    const doc = parseOk(`gitGraph
    branch develop
    branch release order: 2
    branch "cherry-pick" order: 3
`)
    const branches = elementsOf(doc, 'gg-branch')
    expect(branches.map((p) => p.id)).toEqual(['branch:develop', 'branch:release', 'branch:cherry-pick'])
    expect(branches[0]!.element).toMatchObject({ name: 'develop', quote: '', nameAfter: '' })
    expect(paramsOf(branches[1]!.element)).toMatchObject({ order: '2' })
    expect(branches[2]!.element).toMatchObject({ name: 'cherry-pick', quote: '"' })
    expect(paramsOf(branches[2]!.element)).toMatchObject({ order: '3' })
    expect(reassemble(doc, new Map())).toBe(
      `gitGraph
    branch develop
    branch release order: 2
    branch "cherry-pick" order: 3
`,
    )
  })

  it('checkout / switch 等价关键字（原文保留）', () => {
    const doc = parseOk('gitGraph\n    checkout develop\n    switch main\n')
    const co = elementsOf(doc, 'gg-checkout')
    expect(co.map((p) => p.element)).toMatchObject([
      { keyword: 'checkout', name: 'develop' },
      { keyword: 'switch', name: 'main' },
    ])
  })

  it('merge：裸合并 + id / tag / type 参数', () => {
    const doc = parseOk('gitGraph\n    merge feature id: "m" tag: "t" type: REVERSE\n')
    const merge = elementsOf(doc, 'gg-merge')[0]!
    expect(merge.element).toMatchObject({ keyword: 'merge', name: 'feature' })
    expect(paramsOf(merge.element)).toMatchObject({ id: 'm', tag: 't', type: 'REVERSE' })
  })

  it('cherry-pick：id 与 parent 参数', () => {
    const doc = parseOk('gitGraph\n    cherry-pick id: "src"\n    cherry-pick id: "merge" parent: "p"\n')
    const picks = elementsOf(doc, 'gg-cherry-pick')
    expect(picks.map((p) => p.id)).toEqual(['cherry-pick:1', 'cherry-pick:2'])
    expect(paramsOf(picks[0]!.element)).toMatchObject({ id: 'src' })
    expect(paramsOf(picks[1]!.element)).toMatchObject({ id: 'merge', parent: 'p' })
  })
})

describe('gitGraph 解析器：错误边界', () => {
  it('首行不是 gitGraph → ok:false 且带行号', () => {
    const result = gitgraphParser.parse('flowchart TD\n    A --> B\n')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.line).toBe(1)
  })

  it('空文档 → 解析失败（无 gitGraph 声明）', () => {
    expect(gitgraphParser.parse('').ok).toBe(false)
  })

  it('注释 / 空行之后才出现声明也认（声明须为首个语句行）', () => {
    expect(gitgraphParser.parse('%% 注释\n\ngitGraph\n    commit\n').ok).toBe(true)
  })
})

describe('gitGraph 意图落码（语句序即拓扑，ADR-0012）', () => {
  it('add-commit：追加到文末 / 锚点插入，产物可再解析', () => {
    const doc = parseOk(SIMPLE)
    const appended = reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'add-commit' })!)
    expect(appended.trimEnd().endsWith('commit')).toBe(true)
    expect(parseOk(appended)).toBeDefined()

    const anchored = reassemble(
      doc,
      gitgraphParser.resolveRewrites(doc, { type: 'add-commit', id: 'after-feat', afterElementId: 'commit:4' })!,
    )
    const lines = anchored.split('\n')
    expect(lines[lines.findIndex((l) => l.includes('"feat"')) + 1]).toContain('commit id: "after-feat"')
  })

  it('add-commit：id 撞车 / 非法 type 拒绝落码', () => {
    const doc = parseOk(SIMPLE)
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-commit', id: 'init' })).toBeNull()
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-commit', commitType: 'NOPE' })).toBeNull()
  })

  it('add-branch：追加声明（创建并 checkout），重名 / 非法名拒绝', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'add-branch', name: 'hotfix' })!)
    expect(next).toContain('branch hotfix')
    expect(parseOk(next)).toBeDefined()

    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-branch', name: 'feature' })).toBeNull()
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-branch', name: 'main' })).toBeNull()
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-branch', name: 'has space' })).toBeNull()
  })

  it('add-branch：与关键字冲突的名字自动引号化（`branch "commit"`）', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'add-branch', name: 'commit' })!)
    expect(next).toContain('branch "commit"')
    expect(parseOk(next)).toBeDefined()
  })

  it('set-commit-params：改 id 级联改写 cherry-pick 引用（id: / parent:）', () => {
    const doc = parseOk(SIMPLE)
    const rewrites = gitgraphParser.resolveRewrites(doc, {
      type: 'set-commit-params',
      elementId: 'commit:4',
      changes: { id: 'feature-tip' },
    })!
    const next = reassemble(doc, rewrites)
    expect(next).toContain('commit id: "feature-tip"')
    expect(next).toContain('cherry-pick id: "feature-tip"')
    expect(parseOk(next)).toBeDefined()
  })

  it('set-commit-params：tag / type 改写与清除（null = 去参数）', () => {
    const doc = parseOk(SIMPLE)
    const r1 = gitgraphParser.resolveRewrites(doc, {
      type: 'set-commit-params',
      elementId: 'commit:4',
      changes: { tag: null, type: 'HIGHLIGHT' },
    })!
    const next = reassemble(doc, r1)
    expect(next).toContain('commit id: "feat" type: "HIGHLIGHT"')
    expect(next).not.toContain('v0.1')
  })

  it('set-commit-params：非法 type / 未知参数 / id 撞车 / 去除被引用的 id 拒绝', () => {
    const doc = parseOk(SIMPLE)
    const bad = (changes: Record<string, string | null>) =>
      gitgraphParser.resolveRewrites(doc, { type: 'set-commit-params', elementId: 'commit:4', changes })
    expect(bad({ type: 'NOPE' })).toBeNull()
    expect(bad({ parent: 'x' })).toBeNull() // parent 不适用于 commit
    expect(bad({ id: 'init' })).toBeNull() // 与 commit:1 撞车
    expect(bad({ id: null })).toBeNull() // "feat" 被 cherry-pick 引用，去掉会悬空
  })

  it('set-commit-params（cherry-pick）：id 必填且引用须存在', () => {
    const doc = parseOk(SIMPLE)
    const cherry = (changes: Record<string, string | null>) =>
      gitgraphParser.resolveRewrites(doc, { type: 'set-commit-params', elementId: 'cherry-pick:1', changes })
    expect(cherry({ id: null })).toBeNull() // id 必填
    expect(cherry({ id: 'nope' })).toBeNull() // 引用不存在
    expect(cherry({ id: 'init' })).not.toBeNull()
    expect(cherry({ parent: 'docs' })).not.toBeNull()
  })

  it('set-branch-order：新增 / 改写 / 清除 order，源码保持可解析', () => {
    const doc = parseOk(SIMPLE)
    const add = reassemble(
      doc,
      gitgraphParser.resolveRewrites(doc, { type: 'set-branch-order', elementId: 'branch:feature', order: 2 })!,
    )
    expect(add).toContain('branch feature order: 2')
    expect(paramsOf(elementsOf(parseOk(add), 'gg-branch')[0]!.element)).toMatchObject({ order: '2' })

    const withOrder = parseOk('gitGraph\n    branch b order: 5\n')
    const clear = reassemble(
      withOrder,
      gitgraphParser.resolveRewrites(withOrder, { type: 'set-branch-order', elementId: 'branch:b', order: null })!,
    )
    expect(clear).toContain('branch b')
    expect(clear).not.toContain('order')
    expect(parseOk(clear)).toBeDefined()

    expect(
      gitgraphParser.resolveRewrites(doc, { type: 'set-branch-order', elementId: 'branch:feature', order: -1 }),
    ).toBeNull()
  })

  it('delete-commit：删除未被引用的提交；被 cherry-pick 引用时拒绝落码', () => {
    const doc = parseOk(SIMPLE)
    const r1 = gitgraphParser.resolveRewrites(doc, { type: 'delete-commit', elementId: 'commit:3' })!
    const next = reassemble(doc, r1)
    expect(elementsOf(parseOk(next), 'gg-commit')).toHaveLength(3)

    // commit:4 的 id "feat" 被 cherry-pick 引用 → 拒绝
    expect(gitgraphParser.resolveRewrites(doc, { type: 'delete-commit', elementId: 'commit:4' })).toBeNull()
  })

  it('delete-branch：级联清理 checkout / merge 语句；main 不可删', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'delete-branch', name: 'feature' })!)
    expect(next).not.toContain('branch feature')
    expect(next).not.toContain('merge feature')
    expect(parseOk(next)).toBeDefined()
    expect(gitgraphParser.resolveRewrites(doc, { type: 'delete-branch', name: 'main' })).toBeNull()
  })

  it('delete-merge / delete-cherry-pick', () => {
    const doc = parseOk(SIMPLE)
    expect(reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'delete-merge', elementId: 'merge:1' })!)).not.toContain(
      'merge feature',
    )
    expect(
      reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'delete-cherry-pick', elementId: 'cherry-pick:1' })!),
    ).not.toContain('cherry-pick')
  })

  it('add-merge：分支需存在且非自合并（按锚点位置判定当前分支）', () => {
    const doc = parseOk(SIMPLE)
    // 文末当前分支 main，合并 feature 合法
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-merge', branch: 'feature' })).not.toBeNull()
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-merge', branch: 'nope' })).toBeNull()
    // 锚在 commit:2（当前分支 main）后合并 main = 自合并 → 拒绝
    expect(
      gitgraphParser.resolveRewrites(doc, { type: 'add-merge', branch: 'main', afterElementId: 'commit:1' }),
    ).toBeNull()
  })

  it('add-checkout：切回已存在分支（checkout / switch）；不存在拒绝', () => {
    const doc = parseOk(SIMPLE)
    const next = reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'add-checkout', branch: 'main' })!)
    expect(next.trimEnd().endsWith('checkout main')).toBe(true)
    const sw = reassemble(
      doc,
      gitgraphParser.resolveRewrites(doc, { type: 'add-checkout', branch: 'feature', keyword: 'switch' })!,
    )
    expect(sw).toContain('switch feature')
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-checkout', branch: 'nope' })).toBeNull()
  })

  it('add-cherry-pick：源提交必须存在；merge 源必须带 parent', () => {
    const doc = parseOk(SIMPLE)
    const ok = reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'add-cherry-pick', id: 'init' })!)
    expect(ok).toContain('cherry-pick id: "init"')
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-cherry-pick', id: 'nope' })).toBeNull()
    // merge:1 的 id "m1" 是 merge 提交 → cherry-pick 必须带 parent
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-cherry-pick', id: 'm1' })).toBeNull()
    expect(gitgraphParser.resolveRewrites(doc, { type: 'add-cherry-pick', id: 'm1', parent: 'init' })).not.toBeNull()
  })

  it('set-direction：改写 / 删除方向 token；非法方向拒绝', () => {
    const doc = parseOk(SIMPLE)
    expect(reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'set-direction', direction: 'BT' })!)).toContain(
      'gitGraph BT:',
    )
    expect(reassemble(doc, gitgraphParser.resolveRewrites(doc, { type: 'set-direction', direction: null })!)).not.toContain(
      'BT:',
    )
    expect(gitgraphParser.resolveRewrites(doc, { type: 'set-direction', direction: 'RL' })).toBeNull()
  })

  it('编辑只动目标行：注释 / 空行 / 未触碰语句逐字保留', () => {
    const source = `gitGraph
    %% 顶部注释
    commit id: "a"

    branch dev
    commit
`
    const doc = parseOk(source)
    const next = reassemble(
      doc,
      gitgraphParser.resolveRewrites(doc, { type: 'set-commit-params', elementId: 'commit:1', changes: { id: 'a2' } })!,
    )
    expect(next).toBe(source.replace('"a"', '"a2"'))
  })
})

describe('gitGraph 渲染与词法助手', () => {
  it('renderGitgraphHeader：缺省 / 带方向 / 去方向', () => {
    const bare: GitgraphHeaderData = { kind: 'gitgraph-header', keyword: 'gitGraph', gap: '', direction: null, trailing: '' }
    expect(renderGitgraphHeader(bare, { direction: 'LR' })).toBe('gitGraph LR:')
    const dir: GitgraphHeaderData = { kind: 'gitgraph-header', keyword: 'gitGraph', gap: ' ', direction: 'TB', trailing: '' }
    expect(renderGitgraphHeader(dir, { direction: null })).toBe('gitGraph')
    expect(renderGitgraphHeader(dir, {})).toBe('gitGraph TB:')
  })

  it('renderGitgraphBranch：无参数但有尾部空格 → 保留；新增 order 补空格', () => {
    const b: GitgraphBranchData = {
      kind: 'gg-branch',
      keyword: 'branch',
      gap: ' ',
      quote: '',
      name: 'dev',
      nameAfter: '',
      params: [],
    }
    expect(renderGitgraphBranch(b, {})).toBe('branch dev')
    expect(renderGitgraphBranch(b, { order: 2 })).toBe('branch dev order: 2')
    const spaced: GitgraphBranchData = { ...b, nameAfter: ' ' }
    expect(renderGitgraphBranch(spaced, {})).toBe('branch dev ')
  })

  it('renderParamsWith：覆盖 / 删除 / 新增（新增带引号）', () => {
    const params: GitgraphParam[] = [
      { key: 'id', colonRaw: ': ', quote: '"', value: 'a', after: ' ' },
      { key: 'tag', colonRaw: ': ', quote: '"', value: 't', after: '' },
    ]
    expect(renderParamsWith(params, { id: 'b' })).toBe('id: "b" tag: "t"')
    expect(renderParamsWith(params, { tag: null })).toBe('id: "a"')
    expect(renderParamsWith(params, { type: 'REVERSE' })).toBe('id: "a" tag: "t" type: "REVERSE"')
  })

  it('renderGitgraphCommit：关键字 + 参数原文', () => {
    const c: GitgraphCommitData = { kind: 'gg-commit', keyword: 'commit', gap: '', params: [] }
    expect(renderGitgraphCommit(c, {})).toBe('commit')
    expect(renderGitgraphCommit(c, { id: 'x', type: 'HIGHLIGHT' })).toBe('commit id: "x" type: "HIGHLIGHT"')
  })

  it('常量与校验器', () => {
    expect(GITGRAPH_DIRECTIONS).toEqual(['LR', 'TB', 'BT'])
    expect(GITGRAPH_COMMIT_TYPES).toEqual(['NORMAL', 'REVERSE', 'HIGHLIGHT'])
    expect(isValidGitgraphBranchName('dev')).toBe(true)
    expect(isValidGitgraphBranchName('')).toBe(false)
    expect(isValidGitgraphBranchName('a b')).toBe(false)
  })
})

function doc0(source: string): SourceDocument {
  return parseOk(source)
}

/** 把解析出的元素参数表摊平为 key → value 便于断言 */
function paramsOf(element: { kind: string }): Record<string, string> {
  const params = (element as unknown as { params: GitgraphParam[] }).params
  const out: Record<string, string> = {}
  for (const p of params) out[p.key] = p.value
  return out
}
