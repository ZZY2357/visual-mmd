/**
 * 画布节点位置测量（工单 14「方向键改为方位导航」的 DOM 测量适配层）。
 *
 * 背景：方向键不再承诺「源码顺序 / 树关系」，而是按**屏幕几何方位**选邻近节点。
 * 之所以必须实测渲染后的 DOM，是因为 mermaid 的布局引擎不保证源码顺序与屏幕方位一致：
 *   - flowchart = dagre：B 分叉到 C/D 时，源码顺序 C 在 D 前，但 D 可能离 B 更近；
 *   - mindmap = cose-bilkent（力导向，`mindmapDb.getData()` 硬编码 layout='cose-bilkent'）：
 *     「父节点」甚至可能落在子节点右上方。这正是用户报的「上下左右键切换选中特别严重」的根因。
 * 故导航锚点 = 实测外接矩形中心，测量只能发生在渲染之后。
 *
 * 可视范围口径 = 「高亮会标出的全部元素」外接矩形的**并集**：
 * 匹配谓词**直接复用** `canvas-selection/highlight.ts` 的 `matchesDataId`（同一份实现，
 * 不是逐字重抄），保证「位置」与「高亮」永远是同一集合（否则选中态与实际几何会错位）。
 *
 * 为什么 sequence 需要「并集」口径：一个参与者被高亮时会标出**两个**元素——贯穿全程的
 * 生命线 `line.actor-line` 与顶部实例 `g`（底部实例不带 data-id）。若只取顶部实例，
 * 高亮范围（生命线 + 顶部实例）会明显高于/长于位置口径，选中框与锚点对不上；
 * 取两者外接矩形的并集才与高亮一致（见工单 §4「已实测事实」表）。
 *
 * 本模块是纯 DOM 读取，无 React / store 依赖，方便 happy-dom 单测（mermaid 在 happy-dom
 * 里渲染不出产物，故这里只吃已渲染的 DOM，不做渲染）。
 */
import { DATA_ID_CANDIDATE_SELECTOR, matchesDataId } from '../canvas-selection/highlight'
import { overlayRectInContainer, toRect, type Rect } from './inline-edit'

/**
 * 测量若干节点的「可视范围」（工单 14）。
 * 可视范围 = 「高亮会标出的全部元素」外接矩形的**并集**，再换成画布容器坐标。
 * 返回 Map<dataId, Rect>；某个 dataId 找不到元素时该条**不出现**在 Map 里（= 不参与导航）。
 */
export function measureNodeExtents(
  container: HTMLElement,
  root: ParentNode | null,
  dataIds: readonly string[],
): Map<string, Rect> {
  const result = new Map<string, Rect>()
  if (root === null) return result

  // 容器矩形只测一次（不随 dataId 重复测量）。
  const containerRect = toRect(container.getBoundingClientRect())

  // 匹配候选元素一次性取全（[data-id] 或 [id]），不扫全量元素。
  const all = Array.from(root.querySelectorAll(DATA_ID_CANDIDATE_SELECTOR))

  for (const dataId of dataIds) {
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    let hits = 0

    for (const el of all) {
      // 与高亮同一份谓词（highlight.ts 的 matchesDataId）——位置与高亮必须同集合。
      if (matchesDataId(el, dataId)) {
        const r = toRect(el.getBoundingClientRect())
        left = Math.min(left, r.left)
        top = Math.min(top, r.top)
        right = Math.max(right, r.left + r.width)
        bottom = Math.max(bottom, r.top + r.height)
        hits += 1
      }
    }

    if (hits >= 1) {
      result.set(
        dataId,
        overlayRectInContainer(containerRect, {
          left,
          top,
          width: right - left,
          height: bottom - top,
        }),
      )
    }
  }

  return result
}
