import {
  parseRequirementBlockElementId,
  parseRequirementElemBlockElementId,
} from '../pipeline/element-id'
import {
  resolveRequirementSelection,
  type RequirementProjection,
} from '../projection/requirement-projection'
import type { Selection } from '../projection/selection'
import { requirementDeleteIntent, requirementKeyPlan } from '../editing/canvas-keyboard'
import type { CanvasSelection, DataIdResolver } from './data-id'
import { edgeSelectionOf } from './edge-adapter'
import { annotateRequirementRelationIdentities } from './edge-locate'
import type { CanvasCapabilities, ProjectionOf } from './capabilities'

/**
 * requirement 适配器（more-diagrams 工单 07）：把 requirementDiagram 投影接到画布能力包上
 * （ADR-0015）。**有画布寻址**——结论来自 mermaid 12.0.0 源码离线核对（已记入工单 Comments）：
 *
 * - **节点**：requirementDb.getData 直接以 `node.id = requirement.name` / `element.name` 建节点，
 *   unified 渲染器（`chunk-GNY47TPC` 的 `render`）拼上 `data4Layout.diagramId`
 *   （= 预览 render id `mmd-preview-N`）前缀；`requirementBox`（`chunk-7INBJB4K:5782`）
 *   以 `node.domId ?? node.id` 落 DOM id ⇒ **`{svgId}-{名字}`，不追加 `-数字` 序号**。
 *   `annotateNodeDataIds` 因此给这类 `g.node` 反注 `data-id = 名字`。
 * - **两类节点同名**（`requirement a` 与 `element a` 可共存，实测两行都合法）：DOM 上只有名字，
 *   画布点击**无法区分**是 requirement 还是 element，故 resolver 按**投影消歧**——
 *   名字先查 requirement、再查 element（两者都不在投影里则安静不选中）。
 *   element 节点因此也能被画布点选（requirement 优先，element 只让位重名那一个）。
 * - **关系边**：`data4Layout.edges` 的 `id = ${src}-${dst}-${counter}`，unified 的 `insertEdge`
 *   （`chunk-Z7XXMR3K:943`）写 `data-id = edge.id`，路径落在 `g.edgePaths` 下——与
 *   class / state / er 同构，故按**位置序**反注 `relation:N`（ADR-0012），
 *   条数与投影不符时整体不标（绝不误归属）。
 * - 名字含空格（引号名 `requirement "a b"`）时 mermaid 会把空格塞进 DOM id（非法 DOM id），
 *   此类节点安静降级为不可寻址；结构树与属性表单仍是完整编辑入口。
 */
export function requirementDataIdResolver(projection: RequirementProjection): DataIdResolver {
  const elementIdByName = new Map<string, string>()
  // element 先写、requirement 后写：重名时 requirement 胜出（画布点击的确定落点）
  for (const element of projection.elements) elementIdByName.set(element.name, element.elementId)
  for (const requirement of projection.requirements) elementIdByName.set(requirement.name, requirement.elementId)
  const relationIds = new Set(projection.relations.map((r) => r.elementId))
  return (dataId) => {
    const elementId = elementIdByName.get(dataId)
    if (elementId !== undefined) return { kind: 'node', id: elementId }
    return relationIds.has(dataId) ? { kind: 'element', elementId: dataId } : null
  }
}

/**
 * 画布选中 → 编辑器选中（唯一映射，adapter 与 `selection-codec.menuTargetOfCanvas` 共用）：
 * - `node` 的 id 是**投影 elementId**（`requirement:<名>` / `requirement-element:<名>`），
 *   按前缀解回两类节点（与 mindmap「node.id = 投影 elementId」同形）；
 * - `element` 的 elementId 是位置序身份 `relation:N`，经 `edgeSelectionOf` 收窄。
 */
export function requirementSelectionOf(canvas: CanvasSelection): Selection | null {
  if (canvas.kind === 'node') {
    const requirement = parseRequirementBlockElementId(canvas.id)
    if (requirement !== null) return { kind: 'requirement', name: requirement.name }
    const element = parseRequirementElemBlockElementId(canvas.id)
    return element !== null ? { kind: 'requirement-element', name: element.name } : null
  }
  if (canvas.kind === 'element') return edgeSelectionOf('requirement', canvas.elementId)
  return null
}

/** requirement 画布能力包：节点可点选、关系边按位置序标注 */
export const requirementCanvasCapabilities: CanvasCapabilities<ProjectionOf<'requirement'>> = {
  dataIdResolver: (projection) => requirementDataIdResolver(projection.requirement),
  toSelection: (canvas) => requirementSelectionOf(canvas),
  // data-id 即节点名字（渲染后从 DOM id 反注）；关系边是位置序 elementId
  canvasIdOf: (selection) => {
    if (selection.kind === 'requirement' || selection.kind === 'requirement-element') return selection.name
    if (selection.kind === 'requirement-relation') return selection.elementId
    return null
  },
  // 方位导航：requirement 在前、element 在后（投影顺序；重名时 anchor 取先者）
  navigationIds: (projection) => [
    ...projection.requirement.requirements.map((r) => r.name),
    ...projection.requirement.elements.map((e) => e.name),
  ],
  keyboardProjection: (projection) => ({ kind: 'requirement', projection: projection.requirement }),
  edgeAnnotator: (projection) => (root) =>
    annotateRequirementRelationIdentities(root, projection.requirement.relations.length),
  resolveSelection: (projection, selection) => resolveRequirementSelection(projection.requirement, selection),
  // 删除意图：唯一映射在 canvas-keyboard.requirementDeleteIntent
  deleteIntent: (projection, selection) => requirementDeleteIntent(projection.requirement, selection),
  // 键位语义：唯一映射在 canvas-keyboard.requirementKeyPlan
  keyHandler: (projection) => (input) => requirementKeyPlan(projection.requirement, input),
}
