// gitgraph 结构树分区（architecture-deepening-3 工单 02：自 structure-tree/partitions.ts 物理归位，代码块字节级搬移，逻辑零改动）

import type { AnyProjection } from '../diagram-registry'
import type { GitgraphProjection, ProjectionGitgraphBranch, ProjectionGitgraphCommit, ProjectionGitgraphMerge, ProjectionGitgraphCherryPick } from '../projection/gitgraph-projection'
import { diagramSection, withDiagramLabel, type TreeEntry, type TreeSection, type Translate, type TreePartitionsContext } from './partitions'

// ---------- gitGraph（more-diagrams 工单 04） ----------

/** gitGraph 子语句的树上标签：提交 id 缺省时用「提交 #N」（mermaid 自动生成渲染 id） */
function gitgraphChildEntry(
  child: ProjectionGitgraphCommit | ProjectionGitgraphMerge | ProjectionGitgraphCherryPick,
  index: number,
  t: Translate,
): TreeEntry {
  const detail = (fields: Array<string | null>) =>
    fields.filter((x) => x !== null && x !== '').join(' · ') || undefined
  switch (child.kind) {
    case 'gg-commit':
      return {
        key: child.elementId,
        label: child.id ?? t('app:propertyPanel.gitCommitUnnamed', { index }),
        detail: detail([child.tag, child.type]),
        depth: 2,
        selection: { kind: 'gitgraph-commit', elementId: child.elementId },
      }
    case 'gg-merge':
      return {
        key: child.elementId,
        label: t('app:propertyPanel.gitMergeOf', { branch: child.of }),
        detail: detail([child.tag, child.type]),
        depth: 2,
        selection: { kind: 'gitgraph-merge', elementId: child.elementId },
      }
    case 'gg-cherry-pick':
      return {
        key: child.elementId,
        label: t('app:propertyPanel.gitCherryPick'),
        detail: detail([child.id, child.parent]),
        depth: 2,
        selection: { kind: 'gitgraph-cherry-pick', elementId: child.elementId },
      }
  }
}

export function gitgraphPartitions(projection: AnyProjection, { t }: TreePartitionsContext): TreeSection[] {
  if (projection.type !== 'gitgraph') return []
  const p: GitgraphProjection = projection.gitgraph
  return [
    withDiagramLabel(diagramSection(p.direction ?? undefined), t('app:propertyPanel.diagram')),
    {
      key: 'branches',
      heading: t('app:propertyPanel.gitBranches'),
      count: p.branches.length,
      entries: p.branches.map((branch: ProjectionGitgraphBranch) => ({
        key: branch.elementId ?? `implicit:${branch.name}`,
        label: branch.name,
        detail: branch.order !== null ? `order: ${branch.order}` : undefined,
        depth: 1,
        selection: { kind: 'gitgraph-branch', name: branch.name },
        children: branch.children.map((child, i) => gitgraphChildEntry(child, i + 1, t)),
      })),
    },
  ]
}
