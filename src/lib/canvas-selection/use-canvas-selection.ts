import { useEffect, useRef } from 'react'
import { selectionFromEventTarget, type CanvasSelection, type DataIdResolver } from './data-id'
import { addEdgeHitAreas } from './edge-hit-area'
import { annotateNodeDataIds } from './node-data-ids'
import { applyHighlight, clearHighlight } from './highlight'

/**
 * 画布选中 Hook（工单 05，图种无关）：
 * - 点击渲染 SVG 中带 data-id 的元素 → 经 resolver 解析 → onSelect 上报
 * - selectedDataId 对应的元素打高亮标记；SVG 重新渲染 / 选中变化时自动刷新
 *
 * 使用方（画布组件）只需把返回的 ref 与 onClick 挂到 SVG 容器上。
 */

export interface CanvasSelectionOptions {
  /** 最近一次合法渲染的 SVG 字符串；null = 尚无渲染产物 */
  svg: string | null
  /** 图种提供的 data-id resolver；null = 该图种不支持画布选中 */
  resolver: DataIdResolver | null
  /** 当前选中的 data-id（节点选中即节点 id）；null = 无高亮 */
  selectedDataId: string | null
  /** 点击命中选中时回调 */
  onSelect: (selection: CanvasSelection) => void
  /** 外部已有的容器 ref（工单 03：画布视图与选中共享同一容器）；缺省自建 */
  containerRef?: React.RefObject<HTMLDivElement | null>
  /** 渲染后把连线位置序身份写进 DOM（工单 02）；缺省不标注（该图种无位置序连线） */
  annotateEdges?: (root: ParentNode) => void
  /** 渲染后把节点级 data-id 写进 DOM（more-diagrams 工单 12，quadrant 位置序反注）；
   * 缺省不标注（该图种由 annotateNodeDataIds 的通用/专属形态承担） */
  annotateNodes?: (root: ParentNode) => void
  /** data-id 未命中时的连线几何兜底命中（工单 02，沿真实路径采样）；缺省不兜底 */
  hitTestEdge?: (root: ParentNode, clientX: number, clientY: number) => CanvasSelection | null
}

export function useCanvasSelection({
  svg,
  resolver,
  selectedDataId,
  onSelect,
  containerRef: externalRef,
  annotateEdges,
  annotateNodes,
  hitTestEdge,
}: CanvasSelectionOptions) {
  const ownRef = useRef<HTMLDivElement | null>(null)
  const containerRef = externalRef ?? ownRef
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // 标注闭包随投影变化；effect 只在 svg/选中 变化时跑（svg 变了投影必然也变了），
  // 故用 ref 取最新值而不把闭包塞进依赖数组
  const annotateEdgesRef = useRef(annotateEdges)
  annotateEdgesRef.current = annotateEdges
  const annotateNodesRef = useRef(annotateNodes)
  annotateNodesRef.current = annotateNodes

  // 高亮：SVG 重新注入（dangerouslySetInnerHTML 换子树）或选中变化时重新标记。
  // 放在 ref 所指容器上而非 svg 节点本身，兼容容器内其它静态元素。
  // 先补节点 data-id（工单 08：mermaid v12 节点 g 不带 data-id，从 DOM id 反注）、
  // 连线位置序身份（工单 02）与连线命中区域（工单 01，幂等）：均为点击链路前的渲染后处理。
  // 顺序有讲究——身份必须先于命中区标注，工单 01 的克隆才会带上位置序 data-id。
  useEffect(() => {
    const root = containerRef.current
    if (root === null) return
    annotateNodeDataIds(root)
    annotateNodesRef.current?.(root)
    annotateEdgesRef.current?.(root)
    addEdgeHitAreas(root)
    if (selectedDataId === null) {
      clearHighlight(root)
    } else {
      applyHighlight(root, selectedDataId)
    }
  }, [svg, selectedDataId])

  const onClick = (e: React.MouseEvent) => {
    const selection = selectionFromEventTarget(e.target, resolver)
    if (selection !== null) {
      onSelectRef.current(selection)
      return
    }
    // 兜底：data-id 没命中时按屏幕坐标沿真实路径采样找连线（工单 02）。
    // 序列消息只有 1.5px 描边，靠浏览器精确命中过于苛刻；容差小到不会吃到空白。
    const root = containerRef.current
    if (root === null || hitTestEdge === undefined) return
    const hit = hitTestEdge(root, e.clientX, e.clientY)
    if (hit !== null) onSelectRef.current(hit)
  }

  return { containerRef, onClick }
}
