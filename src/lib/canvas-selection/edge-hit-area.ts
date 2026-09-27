/**
 * 连线命中区域（工单 01）：mermaid 渲染的 flowchart 边 path 描边很窄（~1px），
 * 鼠标几乎点不中。本模块给每条边克隆一条透明宽描边（~12px）的命中路径，
 * 复制原 path 的 data-id —— 点中命中路径即走既有的 data-id 选中链路
 * （edgeDataIdResolver → EdgeForm），不改渲染视觉。
 *
 * 纯 DOM 操作，幂等（重复调用不产生重复克隆），方便单测与图种复用。
 */

const HIT_ATTR = 'data-vm-hit'

export function addEdgeHitAreas(root: ParentNode): void {
  for (const path of Array.from(root.querySelectorAll('.edgePaths path[data-id]'))) {
    // 克隆自身也带 data-id，跳过；幂等：克隆固定插在原 path 之前，
    // 已处理过的原 path 其前驱即克隆
    if (path.hasAttribute(HIT_ATTR)) continue
    const prev = path.previousElementSibling
    if (prev !== null && prev.hasAttribute(HIT_ATTR)) continue
    const dataId = path.getAttribute('data-id')
    if (dataId === null) continue
    const hit = path.cloneNode() as Element
    hit.removeAttribute('id')
    // 箭头由 marker 提供，透明描边也会触发绘制；去掉避免箭头重影
    hit.removeAttribute('marker-start')
    hit.removeAttribute('marker-end')
    hit.setAttribute('data-id', dataId)
    hit.setAttribute(HIT_ATTR, 'true')
    // 透明宽描边，只吃命中不吃视觉；fill 无效避免闭合路径内部误命中
    hit.setAttribute(
      'style',
      'stroke: transparent; stroke-width: 12px; fill: none; pointer-events: stroke;',
    )
    path.parentNode?.insertBefore(hit, path)
  }
}
