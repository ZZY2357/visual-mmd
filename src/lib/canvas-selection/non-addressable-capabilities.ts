import type { AnyProjection } from '../diagram-registry'
import type { CanvasCapabilities } from './capabilities'

/** 不可寻址降级（ADR-0007 / ADR-0017）**降级省略**的四个成员——类型层唯一出处。
 * 「渲染器不给 data-id，画布寻址整体不可用」的图种，这四个成员全库只有一份实现：
 * `nonAddressableCapabilities` 工厂内。各降级 adapter 文件只保留图种知识四件套
 * （keyboardProjection / resolveSelection / deleteIntent / keyHandler）与
 * 「渲染器不给 data-id」的行号证据注释（真知识，类型表达不了）。
 *
 * 本模块**只做类型导入、零运行时依赖**：adapter 被 `diagram-registry` 以值导入，
 * 工厂若放回 `capabilities.ts`（它反过来值导入 DIAGRAM_TYPES）会构成
 * registry → adapter → capabilities → registry 的运行时循环，注册表初始化时
 * 撞 TDZ。工厂独立成文件即切断循环（architecture-deepening-3 工单 06）。 */
export type NonAddressableMembers = 'dataIdResolver' | 'toSelection' | 'canvasIdOf' | 'navigationIds'

/** 不可寻址降级能力包工厂（architecture-deepening-3 工单 06）：pie / timeline / gitgraph
 * 等画布整体不可寻址的图种（ADR-0017），四个寻址成员逐字相同——
 * `dataIdResolver` 返回永不命中的 resolver（没有东西会带着 data-id 出现）、
 * `toSelection` / `canvasIdOf` 返回 null（安静地不高亮）、`navigationIds` 返回 []
 * （方位导航无锚点，回落首节点也没有）。工厂把这份空实现收成唯一一份；
 * 调用方只补图种特有的四件套，可选成员（edgeAnnotator / nodeAnnotator）天然不实现。
 * 「哪些成员是降级省略的」由 `NonAddressableMembers` + 参数处的 Omit 表达，
 * 不再靠每处手写注释。降级证据（渲染 chunk 行号）留在各 adapter 文件注释。 */
export function nonAddressableCapabilities<P extends AnyProjection>(
  knowledge: Omit<CanvasCapabilities<P>, NonAddressableMembers>,
): CanvasCapabilities<P> {
  return {
    // —— 以下四件空实现是全库唯一一份（NonAddressableMembers）——
    // 无 data-id 可寻址：永不命中（只认已知元素也无法命中，因为没有东西会带着 data-id 出现）
    dataIdResolver: () => () => null,
    // 画布选中不可能产生（resolver 永不命中）——保留空实现以守能力包形状
    toSelection: () => null,
    // 画布上无高亮目标：安静地不高亮
    canvasIdOf: () => null,
    // 无画布可寻址节点 → 不参与方位导航 / 回落首节点
    navigationIds: () => [],
    // —— 图种知识四件套，由调用方提供 ——
    keyboardProjection: knowledge.keyboardProjection,
    resolveSelection: knowledge.resolveSelection,
    deleteIntent: knowledge.deleteIntent,
    keyHandler: knowledge.keyHandler,
  }
}
