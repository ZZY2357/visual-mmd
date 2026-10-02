// gitgraph 画布键盘 / 删除语义（architecture-deepening-3 工单 01：自 editing/canvas-keyboard.ts 物理归位，代码块字节级搬移，逻辑零改动）

import { nextFreeName } from './element-id'
import { isValidGitgraphBranchName, type GitgraphIntent } from './gitgraph'
import type { KeyInput, KeyPlan } from '../editing/canvas-keyboard'
import type { GitgraphProjection } from '../projection/gitgraph-projection'
import type { Selection } from '../projection/selection'

// ---------- gitGraph 编辑键（more-diagrams 工单 04 / ADR-0013）：语句序即拓扑 ----------

/**
 * 选中元素 → 删除意图（gitGraph）：commit（被 cherry-pick 引用时由管线拒绝落码）、
 * 分支（连带 checkout/merge 语句，由管线负责）、merge、cherry-pick 四类各映射到
 * 既有 delete-* 意图；已不在投影 / null / 别种选中 → null。
 */
export function gitgraphDeleteIntent(
  projection: GitgraphProjection,
  selection: Selection | null,
): GitgraphIntent | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'gitgraph-commit':
      return projection.commits.some((c) => c.elementId === selection.elementId)
        ? { type: 'delete-commit', elementId: selection.elementId }
        : null
    case 'gitgraph-branch':
      return projection.branches.some((b) => b.name === selection.name)
        ? { type: 'delete-branch', name: selection.name }
        : null
    case 'gitgraph-merge':
      return projection.merges.some((m) => m.elementId === selection.elementId)
        ? { type: 'delete-merge', elementId: selection.elementId }
        : null
    case 'gitgraph-cherry-pick':
      return projection.cherryPicks.some((p) => p.elementId === selection.elementId)
        ? { type: 'delete-cherry-pick', elementId: selection.elementId }
        : null
    default:
      return null
  }
}

/**
 * 键 → plan（gitGraph，工单 04 / ADR-0013 就近类比，工单定案）：
 * - Delete = 删除选中元素（查 gitgraphDeleteIntent 唯一映射）
 * - 选中提交上 Tab = 当前分支加一个提交（锚点插入在该提交语句之后——语句序即拓扑，
 *   新提交与该提交同分支）
 * - 选中提交上 Enter = 加分支（创建并 checkout，锚点同上；分支名自动避重，不做改名）
 * 分支 / merge / cherry-pick 上无 Tab/Enter 语义（不加提交的「锚点」——不扩就近类比）。
 * 注：gitGraph 画布 DOM 无 data-id，键操作实际从结构树选中后经画布键盘生效。
 */
export function gitgraphKeyPlan(projection: GitgraphProjection, input: KeyInput): KeyPlan | null {
  if (input.key === 'Delete' || input.key === 'Backspace') {
    const intent = gitgraphDeleteIntent(projection, input.selection)
    return intent === null ? null : { intents: [intent], clearSelection: true }
  }
  if (input.key !== 'Tab' && input.key !== 'Enter') return null
  if (input.mods?.shift === true) return null
  const selection = input.selection
  if (selection === null || selection.kind !== 'gitgraph-commit') return null
  const index = projection.commits.findIndex((c) => c.elementId === selection.elementId)
  if (index === -1) return null
  if (input.key === 'Tab') {
    // 锚点插入：新提交的语句序位置 = 锚点提交之后（`commit:N` 的 N = 前面的 commit 语句数 + 1）
    return {
      intents: [{ type: 'add-commit', afterElementId: selection.elementId }],
      newElementTarget: { selection: { kind: 'gitgraph-commit', elementId: `commit:${index + 2}` } },
    }
  }
  const name = nextFreeName('dev', projection.branches.map((b) => b.name))
  if (!isValidGitgraphBranchName(name)) return null
  return {
    intents: [{ type: 'add-branch', name, afterElementId: selection.elementId }],
    newElementTarget: { selection: { kind: 'gitgraph-branch', name } },
  }
}
