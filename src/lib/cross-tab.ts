/**
 * 跨标签页修改识别（self-grill-hardening 工单 11）。
 *
 * 浏览器 `storage` 事件只在**其他**标签页写入 localStorage 时触发（同一标签页自身
 * 写入不触发），因此它是「他页动了当前图表」的天然信号。本模块把该信号解析成
 * 可判定的动作，不直接触碰 store / DOM，便于纯函数测试：
 *
 * - 只认图表库 key（`visual-mmd:library`），复用 `loadLibrary` 的迁移 + 结构校验
 *   （工单 07），不重复实现解析。
 * - 仅当他页写入的库中，**本页活跃图表 id** 的源码与本页当前源码不同才判定为变更；
 *   他页改的是别的图、或只是重命名，都不弹提示（避免噪声）。
 * - 「本页有未完成输入」通过 `UnfinishedInputProbe` 接缝注入（工单 09 的挂起语义
 *   接入点）：09 落地前默认恒为 false（视为无未完成输入），见下方说明。
 *
 * 两 tab LWW 的最低限度防线：他页覆盖不再无声发生——本页浮出提示，用户可一键
 * 载入最新；提示文案同时明示「继续在本页编辑，保存时会覆盖对方改动」（LWW，ADR-0003
 * / 0008）。不引入 CRDT / 自动合并——本票只把最隐蔽的静默覆盖变成可见事件。
 */

import { LIBRARY_STORAGE_KEY, loadLibrary, type StoredLibrary } from './library-storage'

/**
 * 「本页是否有未完成输入」探测接缝（工单 09 的挂起语义接入点）。
 *
 * 工单 09 落地前：默认实现恒返回 false——即当前行为按「无未完成输入」处理，
 * 载入最新直接生效。工单 09 落地后：把代码面板「输入会话进行中」的判定接到此处
 * （store 的 `hasUnfinishedInput` 字段），载入即可与挂起写回走同一套接受/放弃流程，
 * 不丢用户未提交的输入。本模块只依赖该签名，不关心其实现。
 */
export type UnfinishedInputProbe = () => boolean

/** 默认探测：工单 09 落地前，恒为「无未完成输入」。 */
export const noUnfinishedInput: UnfinishedInputProbe = () => false

/** 他页对**本页当前活跃图表**的可识别修改 */
export interface RemoteDiagramChange {
  /** 发生变更的图表 id（等于本页活跃图表 id） */
  diagramId: string
  /** 他页写入的最新源码 */
  source: string
  /** 他页写入时间（epoch ms） */
  savedAt: number
}

/** 判定输入：本页当时的活跃图表与源码（供比较） */
export interface CrossTabContext {
  activeId: string | null
  source: string
  /** 本页是否有未完成输入（工单 09 接缝，默认 false） */
  hasUnfinishedInput: boolean
}

/** 跨页同步策略 */
export interface CrossTabOptions {
  /**
   * 本页无未完成输入时，是否自动载入他页最新（默认 false = 只弹提示）。
   *
   * 选「默认不自动载入」：静默自动载入本身就是本票要防的那种「看不见的覆盖」——
   * 用户的阅读/滚动/选中状态会被无预警替换，而两 tab LWW 的隐患正来自「不知不觉」。
   * 因此默认始终浮出可见提示、由用户点「载入最新」；自动载入作为可配置项保留，
   * 供明确想要「空闲即跟随」的场景开启。默认值确定，测试可注入。
   */
  autoLoadWhenIdle?: boolean
}

/** 一次 storage 事件的处置结果（纯数据，便于测试） */
export type CrossTabDecision =
  | { kind: 'ignore' }
  | { kind: 'notice'; change: RemoteDiagramChange }
  | { kind: 'auto-load'; change: RemoteDiagramChange }

/** 把 storage 事件负载包成只读 Storage，复用 loadLibrary 的迁移 + 校验 */
function valueStorage(value: string): Storage {
  return {
    getItem: (key: string) => (key === LIBRARY_STORAGE_KEY ? value : null),
  } as Storage
}

/**
 * 从 storage 事件的 newValue 解析图表库（含工单 07 的 schema 迁移）。
 * 非本库 key / 被清除（newValue 为 null）/ 结构损坏 → null。
 */
export function parseLibraryValue(newValue: string | null): StoredLibrary | null {
  if (newValue === null) return null
  return loadLibrary(valueStorage(newValue))
}

/**
 * 识别他页写入是否修改了本页当前活跃图表。
 * 返回 null 表示与本页无关（别的 key、别张图、源码未变、或本页无活跃图表）。
 */
export function detectRemoteChange(
  event: Pick<StorageEvent, 'key' | 'newValue'>,
  context: Pick<CrossTabContext, 'activeId' | 'source'>,
): RemoteDiagramChange | null {
  if (event.key !== LIBRARY_STORAGE_KEY) return null
  if (context.activeId === null) return null
  const library = parseLibraryValue(event.newValue)
  if (library === null) return null
  const remote = library.diagrams.find((d) => d.id === context.activeId)
  if (remote === undefined) return null
  // 源码一致 = 他页未改本图（改的是别张图，或只是重命名 / 切页）
  if (remote.source === context.source) return null
  return { diagramId: context.activeId, source: remote.source, savedAt: remote.savedAt }
}

/**
 * 判定一次 storage 事件应如何处理：
 * - 非本图变更 → ignore
 * - 本页有未完成输入 → 始终 notice（绝不自动覆盖未完成输入，工单 09 语义）
 * - 无未完成输入且开启 autoLoadWhenIdle → auto-load，否则 notice
 */
export function decideCrossTabAction(
  event: Pick<StorageEvent, 'key' | 'newValue'>,
  context: CrossTabContext,
  options: CrossTabOptions = {},
): CrossTabDecision {
  const change = detectRemoteChange(event, context)
  if (change === null) return { kind: 'ignore' }
  if (context.hasUnfinishedInput) return { kind: 'notice', change }
  if (options.autoLoadWhenIdle === true) return { kind: 'auto-load', change }
  return { kind: 'notice', change }
}
