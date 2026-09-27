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
}

export function useCanvasSelection({ svg, resolver, selectedDataId, onSelect, containerRef: externalRef }: CanvasSelectionOptions) {
  const ownRef = useRef<HTMLDivElement | null>(null)
  const containerRef = externalRef ?? ownRef
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // 高亮：SVG 重新注入（dangerouslySetInnerHTML 换子树）或选中变化时重新标记。
  // 放在 ref 所指容器上而非 svg 节点本身，兼容容器内其它静态内容。
  // 先补节点 data-id（工单 08：mermaid v12 节点 g 不带 data-id，从 DOM id 反注）
  // 与连线命中区域（工单 01，幂等）：均为点击链路前的渲染后处理。
  useEffect(() => {
    const root = containerRef.current
    if (root === null) return
    annotateNodeDataIds(root)
    addEdgeHitAreas(root)
    if (selectedDataId === null) {
      clearHighlight(root)
    } else {
      applyHighlight(root, selectedDataId)
    }
  }, [svg, selectedDataId])

  const onClick = (e: React.MouseEvent) => {
    const selection = selectionFromEventTarget(e.target, resolver)
    if (selection !== null) onSelectRef.current(selection)
  }

  return { containerRef, onClick }
}
