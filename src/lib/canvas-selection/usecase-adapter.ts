import { resolveUsecaseSelection, type UsecaseProjection } from '../projection/usecase-projection'
import type { Selection } from '../projection/selection'
import { usecaseDeleteIntent, usecaseKeyPlan } from '../pipeline/usecase-keyboard'
import { annotateUsecaseDataIds } from './node-data-ids'
import type { CanvasSelection, DataIdResolver } from './data-id'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * usecase-beta 适配器（more-diagrams 工单 26）：把 usecase 投影接到画布能力包上（ADR-0015）。
 *
 * **有画布寻址** —— 结论来自工单 26 的 DOM 实测（.scratch/more-diagrams/research/usecase.md §4）：
 * usecase 的渲染器 `annotateUsecaseElements` 渲染后给每个元素写 `data-id`（= mermaid 模型 id）。
 * - 节点：`data-id` = 源码标识符 / 推导串（引号声明无 id 时 `Reset password` → `Reset_password`），
 *   与投影 elementId 的键部分一致；
 * - 关系：`data-id` = `edge-${匿名序号}`（0 基，只对匿名边自增）——注意 mermaid 的匿名
 *   计数器与 app 的位置序 `relation:N` 相差 1（mermaid 0 基），反注时按投影 `dataId` 精确匹配；
 * - 注释节点：`note-n`；注释连接边 internal，不作独立选中。
 *
 * `annotateUsecaseDataIds` 把渲染器已写的 `data-id` 归一到投影 elementId（节点加前缀
 * `actor:` / `usecase:` / `boundary:`，关系 `edge-k` → `relation:N`），使点选 / 高亮 /
 * 右键菜单的既有 data-id 链路原样生效。
 *
 * - 节点（actor / 用例 / 边界）与关系**可寻址**；note 节点可选中。
 * - 未在源码里的合成元素（悬空引用端点由渲染器补的椭圆用例）不在反注表里，点它安静不选中。
 * - **不做边内联编辑 / 不做 `edgeAnnotator` 之外的东西**：连线可通过位置序反注寻址，
 *   但没有双击内联编辑语法（不实现 inline-edit）。
 */

/** 投影中全部可寻址 data-id（= 渲染器 data-id，反注后由 resolver 认领） */
export function usecaseCanvasIds(projection: UsecaseProjection): string[] {
  const ids: string[] = []
  for (const node of projection.nodes) {
    if (node.nodeKind === 'actor') ids.push(`actor:${node.id}`)
    else if (node.nodeKind === 'usecase') ids.push(`usecase:${node.id}`)
    else if (node.nodeKind === 'boundary') ids.push(`boundary:${node.id}`)
    else if (node.nodeKind === 'note') ids.push(`note:${node.id}`)
  }
  for (const rel of projection.relations) ids.push(rel.elementId)
  return ids
}

/** true data-id（渲染器写的原始值）→ 投影 elementId（反注表，供 nodeAnnotator 用） */
export function usecaseDataIdMap(projection: UsecaseProjection): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of projection.nodes) {
    if (node.nodeKind === 'actor') map.set(node.id, `actor:${node.id}`)
    else if (node.nodeKind === 'usecase') map.set(node.id, `usecase:${node.id}`)
    else if (node.nodeKind === 'boundary') map.set(node.id, `boundary:${node.id}`)
    else if (node.nodeKind === 'note') map.set(node.id, `note:${node.id}`)
  }
  for (const rel of projection.relations) map.set(rel.dataId, rel.elementId)
  return map
}

/** data-id（= 投影 elementId）→ CanvasSelection（唯一映射，adapter 与 selection-codec 共用） */
export function usecaseDataIdResolver(projection: UsecaseProjection): DataIdResolver {
  const known = new Set(usecaseCanvasIds(projection))
  return (dataId) => (known.has(dataId) ? { kind: 'node', id: dataId } : null)
}

export function usecaseSelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind !== 'node') return null
  const id = canvas.id
  if (id.startsWith('actor:')) return { kind: 'usecase-actor', elementId: id }
  if (id.startsWith('usecase:')) return { kind: 'usecase-usecase', elementId: id }
  if (id.startsWith('boundary:')) return { kind: 'usecase-boundary', elementId: id }
  if (/^relation:[0-9]+$/.test(id)) return { kind: 'usecase-relation', elementId: id }
  if (id.startsWith('note:')) return { kind: 'usecase-note', elementId: id }
  return null
}

/** usecase 画布能力包：节点 / 关系按渲染器 data-id 反注寻址 */
export const usecaseCanvasCapabilities: CanvasCapabilities<ProjectionOf<'usecase'>> = {
  dataIdResolver: (projection) => usecaseDataIdResolver(projection.usecase),
  toSelection: (canvas) => usecaseSelectionOf(canvas),
  // data-id 即投影 elementId（渲染后由 nodeAnnotator 归一）
  canvasIdOf: (_projection, selection) => {
    switch (selection.kind) {
      case 'usecase-actor':
      case 'usecase-usecase':
      case 'usecase-boundary':
      case 'usecase-relation':
      case 'usecase-note':
        return selection.elementId
      default:
        return null
    }
  },
  // 方位导航：节点 + 关系（文档序）
  navigationIds: (projection) => usecaseCanvasIds(projection.usecase),
  keyboardProjection: (projection) => ({ kind: 'usecase', projection: projection.usecase }),
  // 节点/关系反注：渲染器已写 data-id（= 模型 id），归一为投影 elementId
  nodeAnnotator: (projection) => (root) => annotateUsecaseDataIds(root, usecaseDataIdMap(projection.usecase)),
  resolveSelection: (projection, selection) => resolveUsecaseSelection(projection.usecase, selection),
  // 删除意图：唯一映射在 pipeline/usecase-keyboard 的 usecaseDeleteIntent
  deleteIntent: (projection, selection) => usecaseDeleteIntent(projection.usecase, selection),
  // 键位语义：唯一映射在 pipeline/usecase-keyboard 的 usecaseKeyPlan
  keyHandler: (projection) => (input) => usecaseKeyPlan(projection.usecase, input),
}
