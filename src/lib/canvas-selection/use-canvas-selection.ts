import { useEffect, useRef } from 'react'
import { selectionFromEventTarget, type CanvasSelection, type DataIdResolver } from './data-id'
import { addEdgeHitAreas } from './edge-hit-area'
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
}

export function useCanvasSelection({ svg, resolver, selectedDataId, onSelect }: CanvasSelectionOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // 高亮：SVG 重新注入（dangerouslySetInnerHTML 换子树）或选中变化时重新标记。
  // 放在 ref 所指容器上而非 svg 节点本身，兼容容器内其它静态内容。
  // 先补连线命中区域（工单 01，幂等）：边描边过窄点不中，需在点击链路前注入宽命中路径。
  useEffect(() => {
    const root = containerRef.current
    if (root === null) return
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
