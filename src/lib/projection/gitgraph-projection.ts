import type { SourceDocument } from '../pipeline/document'
import {
  type GitgraphBranchData,
  type GitgraphCheckoutData,
  type GitgraphCherryPickData,
  type GitgraphCommitData,
  type GitgraphHeaderData,
  type GitgraphMergeData,
} from '../pipeline/gitgraph'
import type { Selection } from './selection'

/**
 * gitGraph 投影（more-diagrams 工单 04，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - **语句序即拓扑**：分支归属由「当前分支追踪」派生——`branch` 创建并切换、
 *   `checkout`/`switch` 切换、merge/cherry-pick/commit 不改变当前分支；
 *   每条语句归属它出现时的当前分支（默认起始分支 main，`mainBranchName` 配置不做编辑）。
 * - 分支作为**分组**进结构树（可改 order），commit / merge / cherry-pick 是分支下的元素。
 * - 提交 id 缺省时元素身份 = 位置序 `commit:N`（ADR-0012）；mermaid 渲染的提交圆点
 *   DOM **不带 data-id**（勘察 mermaid 12.0.0 gitGraphRenderer 实测：圆点只有 class，
 *   无 data-id / 无独立 DOM id）——画布寻址整体降级（不伪造），结构树是完整编辑入口。
 * - checkout/switch 语句是解析产物（删除分支时级联清理），但不是树上的元素（工单定案：
 *   元素 = 提交、分支、merge/cherry-pick）。
 */

export interface ProjectionGitgraphCommit {
  kind: 'gg-commit'
  /** `commit:N`，位置序身份（语句序 = 拓扑，ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 显式 id（`id:` 参数）；缺省 null（mermaid 自动生成渲染用 id） */
  id: string | null
  /** `tag:` 参数；无 null */
  tag: string | null
  /** `type:` 参数原文（NORMAL / REVERSE / HIGHLIGHT）；缺省 null = NORMAL */
  type: string | null
  /** 该语句出现时的当前分支 */
  branch: string
}

export interface ProjectionGitgraphBranch {
  /** 分支名（语法标识，选中与删除意图都用它） */
  name: string
  /** 声明行 elementId（`branch:<name>`，首个声明）；隐式 main（无声明行）null */
  elementId: string | null
  /** `order:` 参数；未设 null（跟随代码顺序） */
  order: number | null
  /** 归属该分支的语句（文档序）：commit / merge / cherry-pick */
  children: Array<ProjectionGitgraphCommit | ProjectionGitgraphMerge | ProjectionGitgraphCherryPick>
}

export interface ProjectionGitgraphMerge {
  kind: 'gg-merge'
  /** `merge:N`，位置序身份 */
  elementId: string
  /** 被合并的分支名 */
  of: string
  /** 该语句出现时的当前分支（merge 落在它上） */
  branch: string
  id: string | null
  tag: string | null
  type: string | null
}

export interface ProjectionGitgraphCherryPick {
  kind: 'gg-cherry-pick'
  /** `cherry-pick:N`，位置序身份 */
  elementId: string
  /** `id:` 参数（源提交 id）；缺省 null */
  id: string | null
  /** `parent:` 参数（合并提交时必填）；缺省 null */
  parent: string | null
  /** 该语句出现时的当前分支 */
  branch: string
}

export interface GitgraphProjection {
  /** 表头方向（LR / TB / BT）；缺省 null = mermaid 默认 LR */
  direction: string | null
  /** 分支（首次出现顺序；隐式 main 恒在首位——除非用户把其它语句写在 branch main 之前） */
  branches: ProjectionGitgraphBranch[]
  commits: ProjectionGitgraphCommit[]
  merges: ProjectionGitgraphMerge[]
  cherryPicks: ProjectionGitgraphCherryPick[]
}

type BranchChild = ProjectionGitgraphCommit | ProjectionGitgraphMerge | ProjectionGitgraphCherryPick

/** 从解析产物构建 gitGraph 投影（纯函数，ADR-0016：投影吃解析产物） */
export function buildGitgraphProjection(doc: SourceDocument): GitgraphProjection {
  let direction: string | null = null
  const branches: ProjectionGitgraphBranch[] = []
  const byName = new Map<string, ProjectionGitgraphBranch>()

  const ensureBranch = (name: string): ProjectionGitgraphBranch => {
    const existing = byName.get(name)
    if (existing !== undefined) return existing
    const branch: ProjectionGitgraphBranch = { name, elementId: null, order: null, children: [] }
    byName.set(name, branch)
    branches.push(branch)
    return branch
  }

  // 默认起始分支 main（research：mainBranchName 配置不改）
  ensureBranch('main')
  let current = 'main'

  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'gitgraph-header') {
      direction = (data as GitgraphHeaderData).direction
    } else if (data.kind === 'gg-branch') {
      // branch 创建并 checkout：归属当前分支的语句到此为止
      const decl = data as GitgraphBranchData
      const branch = ensureBranch(decl.name)
      branch.elementId = branch.elementId ?? part.id
      const orderRaw = decl.params.find((p) => p.key === 'order')?.value
      if (orderRaw !== undefined && /^\d+$/.test(orderRaw)) branch.order = Number(orderRaw)
      current = decl.name
    } else if (data.kind === 'gg-checkout') {
      current = (data as GitgraphCheckoutData).name
    } else if (data.kind === 'gg-commit') {
      const decl = data as GitgraphCommitData
      const param = (key: string) => decl.params.find((p) => p.key === key)?.value ?? null
      const commit: ProjectionGitgraphCommit = {
        kind: 'gg-commit',
        elementId: part.id,
        id: param('id'),
        tag: param('tag'),
        type: param('type'),
        branch: current,
      }
      ensureBranch(current).children.push(commit)
    } else if (data.kind === 'gg-merge') {
      const decl = data as GitgraphMergeData
      const param = (key: string) => decl.params.find((p) => p.key === key)?.value ?? null
      const merge: ProjectionGitgraphMerge = {
        kind: 'gg-merge',
        elementId: part.id,
        of: decl.name,
        branch: current,
        id: param('id'),
        tag: param('tag'),
        type: param('type'),
      }
      ensureBranch(current).children.push(merge)
    } else if (data.kind === 'gg-cherry-pick') {
      const decl = data as GitgraphCherryPickData
      const param = (key: string) => decl.params.find((p) => p.key === key)?.value ?? null
      const pick: ProjectionGitgraphCherryPick = {
        kind: 'gg-cherry-pick',
        elementId: part.id,
        id: param('id'),
        parent: param('parent'),
        branch: current,
      }
      ensureBranch(current).children.push(pick)
    }
  }

  return {
    direction,
    branches,
    commits: childrenOfKind<ProjectionGitgraphCommit>(branches, 'gg-commit'),
    merges: childrenOfKind<ProjectionGitgraphMerge>(branches, 'gg-merge'),
    cherryPicks: childrenOfKind<ProjectionGitgraphCherryPick>(branches, 'gg-cherry-pick'),
  }
}

/** 分支下的语句按数据 kind 展平（投影子项与解析数据 kind 同名，逐字对应） */
function childrenOfKind<T extends BranchChild>(
  branches: ProjectionGitgraphBranch[],
  kind: BranchChild['kind'],
): T[] {
  const out: T[] = []
  for (const b of branches) {
    for (const child of b.children) {
      if (child.kind === kind) out.push(child as T)
    }
  }
  return out
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveGitgraphSelection(
  projection: GitgraphProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'gitgraph-commit':
      return projection.commits.some((c) => c.elementId === selection.elementId) ? selection : null
    case 'gitgraph-branch':
      return projection.branches.some((b) => b.name === selection.name) ? selection : null
    case 'gitgraph-merge':
      return projection.merges.some((m) => m.elementId === selection.elementId) ? selection : null
    case 'gitgraph-cherry-pick':
      return projection.cherryPicks.some((p) => p.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}
