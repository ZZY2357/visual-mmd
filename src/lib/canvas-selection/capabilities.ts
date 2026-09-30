import { DIAGRAM_TYPES, type AnyProjection, type DiagramTypeId } from '../diagram-registry'
import type { CanvasKeyboardProjection } from '../editing/canvas-keyboard'
import type { EditIntent } from '../pipeline/parser'
import type { Selection } from '../projection/selection'
import type { CanvasSelection, DataIdResolver } from './data-id'

/**
 * 画布能力包（工单 04，ADR-0015）：一个图种接入画布所需的**全部静态图种知识**。
 *
 * `CanvasPanel` 原先散着 6 个分发函数（`resolverOf` / `canvasToEditorSelection` /
 * `selectedDataIdOf` / `nodeDataIdsOf` / `keyboardProjectionOf` / `annotateEdges`），
 * 共 20 处按图种手写的 if 分发；`PropertyPanel` 还有第七处（`resolveProjectionSelection`）。
 * 本接口把它们收成一份能力清单——每种图一个 adapter（canvas-selection/*-adapter.ts），
 * 实例挂在 `DiagramTypeRegistration.canvas` 字段上（registry 只持引用，不含实现），
 * `capabilitiesOf()` 查表分发。加第 5 种图 = 新建一个 adapter + 在 registration 上挂一行。
 *
 * **切分线（ADR-0015 的核心）**：包只装「图种知识」——都能从投影纯函数算出，不碰 DOM。
 * `extents` / `reveal` **故意不进包**：它们依赖 DOM 容器与 `useCanvasView` 的
 * `revealRect`，是运行期测量，不是图种知识。`CanvasNavigation` 继续由
 * CanvasPanel / hook 层用「能力包 + 容器」组装，`use-canvas-keyboard` 的
 * 「注入假 navigation 即可测」手段因此不受影响。
 *
 * 穷尽性：`capabilitiesOf` 按投影图种查表，漏注册一个图种是类型错误
 * （`DIAGRAM_TYPES: Record<DiagramTypeId, …>`），不是运行期静默。
 */

/** 图种 id → 该图种的投影包装（`{ type, flowchart }` 等） */
export type ProjectionOf<T extends DiagramTypeId> = Extract<AnyProjection, { type: T }>

export interface CanvasCapabilities<T extends AnyProjection = AnyProjection> {
  /** data-id → 画布选中（既有 seam，工单 05/06/07/08/09 的 DataIdResolver） */
  dataIdResolver(projection: T): DataIdResolver
  /** 画布选中 → 编辑器选中（原 CanvasPanel.canvasToEditorSelection，工单 03 收敛后逐图种实现） */
  toSelection(canvas: CanvasSelection): Selection | null
  /** 编辑器选中 → 画布 data-id（高亮用；不可寻址的 kind 返回 null——安静地不高亮） */
  canvasIdOf(selection: Selection): string | null
  /** 参与方位导航 / 回落首节点的 id 列表（**投影顺序**，工单 14 §3；原 nodeDataIdsOf） */
  navigationIds(projection: T): string[]
  /** 画布键盘的 tagged union（工单 14；原 keyboardProjectionOf） */
  keyboardProjection(projection: T): CanvasKeyboardProjection
  /** 连线位置序标注（工单 02，ADR-0012）；flowchart / mindmap 无 → 不实现（undefined）。
   * **可选项正是最容易漏的**：capabilities 查表测试专门断言前两者无此成员。 */
  edgeAnnotator?(projection: T): (root: ParentNode) => void
  /** 选中在投影中是否仍存在，不存在回落 null（原 PropertyPanel.resolveProjectionSelection 的
   * 四份 resolve*Selection 分发；工单 03 定案：归能力包，不归选中 codec） */
  resolveSelection(projection: T, selection: Selection | null): Selection | null
  /** 选中 → 删除意图（architecture-deepening-2 工单 03）：与 resolveSelection 同形的唯一映射，
   * 存在性校验（元素已不在投影 / null / 图表级 / 别种选中 → null）就在这里做一次。
   * 键盘 Delete、右键菜单 deleteTarget、属性面板删除三个入口共用，等价性由
   * `__tests__/delete-intent.test.ts` 的性质测试钉住。 */
  deleteIntent(projection: T, selection: Selection | null): EditIntent | null
}

/** 键盘 Hook 的 tagged union（`{ kind, projection }`）→ 包装投影。
 * kind 与图种 id 同名，字段名也随之；测试与键盘 Hook 用它回到能力包查表。 */
export function projectionOfKeyboardTarget(target: CanvasKeyboardProjection): AnyProjection {
  return { type: target.kind, [target.kind]: target.projection } as AnyProjection
}

/** 图种 → 能力包（唯一分发点；CanvasPanel / PropertyPanel 各剩一次查表调用） */
export function capabilitiesOf(projection: AnyProjection): CanvasCapabilities {
  return DIAGRAM_TYPES[projection.type].canvas
}
