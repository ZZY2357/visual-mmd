import type { SourceDocument } from '../pipeline/document'
import {
  emEntityGroupOf,
  emNamespaceOf,
  emNameOf,
  emSwimlaneOfGroup,
  type EmDataBlockData,
  type EmEntityGroup,
  type EmFrameData,
  type EmSwimlane,
  type EventModelingElementData,
} from '../pipeline/eventmodeling'
import type { Selection } from './selection'

/**
 * eventmodeling 投影（more-diagrams 工单 28，ADR-0008/0016）：从解析产物派生的只读结构视图。
 *
 * - 帧 = **位置序身份** `frame:N`（ADR-0012，文档序）——帧号可乱序/改动，位置序唯一稳定；
 *   帧号 `frameId` 作为字段保留（`->>` 引用靠它）。
 * - 数据块 = **位置序身份** `data:N`（文档序）——数据块名可重复/改名。
 * - **派生连线（默认推断关系）**：EM 的连线**默认是推断的、无源码语句**（research §3/§8.4，
 *   渲染器 `decidePositionRelation` 实测）。投影按**同一规则**推断：
 *   `rf` 帧与首帧**无入边**；有显式 `->>` 时来源 = 被引用的帧集合；否则来源 = 文档序上
 *   **从上一帧倒扫、第一个「泳道不同」的帧**（`findBoxByLineIndex` 口径）。
 *   这些连线是**派生、只读**——`elementId` 为 `relation:N`（位置序），但**无源码语句**
 *   （不可手术改写），仅供结构树展示与画布高亮（画布本身不可寻址）。
 * - 泳道 = 派生分组（类型带 + 命名空间，research §8.5）——不是独立语法元素。
 * - **画布 DOM 无 data-id**（research §4/§8.2 实测：`em-box`/`em-swimlane`/`em-relation`
 *   均无 data-id、无 id，仅 `<defs>` 箭头 marker 有 id）→ 画布寻址整体降级（不伪造，
 *   ADR-0007），结构树 + 属性表单是完整编辑入口。
 */

export interface ProjectionEmFrame {
  /** `frame:N`，位置序身份（ADR-0012）+ 编辑意图寻址键 */
  elementId: string
  /** 帧号原文（1–3 位数字） */
  frameId: string
  /** 帧关键字原文（`tf` / `timeframe` / `rf` / `resetframe`） */
  keyword: string
  /** 实体类型原文（别名保留） */
  entityType: EmFrameData['entityType']
  /** 实体类型归一（ui / pcr / cmd / rmo / evt） */
  group: EmEntityGroup
  /** 实体标识原文（可含命名空间） */
  entityIdentifier: string
  /** 命名空间（首个点前；无为空串） */
  namespace: string
  /** 名字（末个点后） */
  name: string
  /** 泳道带（ui / crm / events） */
  swimlane: EmSwimlane
  /** 泳道显示标签（带命名空间时为 `UI/A: Ns` 等，research §8.5） */
  swimlaneLabel: string
  /** 是否为重置帧（`rf` / `resetframe`，打断默认关系推断） */
  isReset: boolean
  /** 显式来源帧号（`->>` 原文）；空数组 = 默认推断 */
  sourceFrames: string[]
  /** 数据块引用名（`[[Name]]`；无引用为 null） */
  dataReference: string | null
}

export interface ProjectionEmData {
  /** `data:N`，位置序身份 + 编辑意图寻址键 */
  elementId: string
  /** 数据块名原文 */
  name: string
  /** 类型前缀（无则 null） */
  dataType: string | null
  /** 被哪些帧引用（帧 elementId 列表，文档序） */
  referencedBy: string[]
}

/** 派生连线（默认推断 / `->>` 显式；**无源码语句、只读**） */
export interface ProjectionEmRelation {
  /** `relation:N`，位置序身份（ADR-0012）——仅供结构树 / 画布高亮寻址，**不可手术编辑** */
  elementId: string
  /** 源帧 elementId（`frame:N`）；无来源为 null（`rf` / 首帧） */
  source: string | null
  /** 目标帧 elementId（`frame:N`） */
  target: string
  /** 连线来源：`explicit`（`->>` 显式）/ `inferred`（默认推断） */
  origin: 'explicit' | 'inferred'
  /** 可编辑的帧 elementId = 目标帧（改 `->>` 要走目标帧的 set-em-frame；推断连线不可编辑） */
  editable: boolean
}

/** 泳道分组（派生） */
export interface ProjectionEmSwimlane {
  /** 泳道带 */
  swimlane: EmSwimlane
  /** 泳道显示标签 */
  label: string
  /** 该泳道内的帧（文档序） */
  frames: ProjectionEmFrame[]
}

/** 文档级注释 / 声明（entity / note / gwt；逐字保留，不进选中面） */
export interface ProjectionEmDocLine {
  /** 解析期元素 id（`entity:<line>` / `note:<line>` / `gwt:<line>`） */
  elementId: string
  /** 种类 */
  docKind: 'entity' | 'note' | 'gwt'
  /** 原文首行（展示用） */
  text: string
}

export interface EventModelingProjection {
  /** 全部帧（文档序平铺；键盘 / 表单寻址用） */
  frames: ProjectionEmFrame[]
  /** 全部数据块（文档序平铺） */
  dataBlocks: ProjectionEmData[]
  /** 全部连线（文档序，含派生与显式；只读展示） */
  relations: ProjectionEmRelation[]
  /** 泳道分组（按泳道带 + 命名空间归并，首次出现序） */
  swimlanes: ProjectionEmSwimlane[]
  /** 文档级注释 / 声明行（文档序） */
  docLines: ProjectionEmDocLine[]
  /** 下一个新增帧的预测序号（追加到文档末尾时准） */
  nextFrameOrdinal: number
}

const SWIMLANE_LABEL: Record<EmSwimlane, string> = {
  ui: 'UI/Automation',
  crm: 'Command/Read Model',
  events: 'Events',
}

const SWIMLANE_PREFIX: Record<EmSwimlane, string> = {
  ui: 'UI/A: ',
  crm: 'C/RM: ',
  events: 'Stream: ',
}

/** 泳道显示标签（带命名空间加前缀，research §8.5） */
function swimlaneLabelOf(swimlane: EmSwimlane, namespace: string): string {
  return namespace === '' ? SWIMLANE_LABEL[swimlane] : SWIMLANE_PREFIX[swimlane] + namespace
}

/** 从解析产物构建 eventmodeling 投影（纯函数，ADR-0016） */
export function buildEventModelingProjection(doc: SourceDocument): EventModelingProjection {
  const frames: ProjectionEmFrame[] = []
  const dataBlocks: ProjectionEmData[] = []
  const docLines: ProjectionEmDocLine[] = []
  const frameIdToElementId = new Map<string, string>()

  // 首遍：收集帧与数据块（先建帧号 → elementId 索引，`->>` 与默认推断靠它解析）
  for (const part of doc.elements) {
    const data = part.element
    if (data.kind === 'em-frame') {
      const frame = data as EmFrameData
      const group = emEntityGroupOf(frame.entityType)
      const swimlane = emSwimlaneOfGroup(group)
      const namespace = emNamespaceOf(frame.entityIdentifier)
      frames.push({
        elementId: part.id,
        frameId: frame.frameId,
        keyword: frame.keyword,
        entityType: frame.entityType,
        group,
        entityIdentifier: frame.entityIdentifier,
        namespace,
        name: emNameOf(frame.entityIdentifier),
        swimlane,
        swimlaneLabel: swimlaneLabelOf(swimlane, namespace),
        isReset: frame.keyword === 'rf' || frame.keyword === 'resetframe',
        sourceFrames: [...frame.sourceFrames],
        dataReference: frame.dataReference,
      })
      frameIdToElementId.set(frame.frameId, part.id)
    } else if (data.kind === 'em-data') {
      const block = data as EmDataBlockData
      dataBlocks.push({ elementId: part.id, name: block.name, dataType: block.dataType, referencedBy: [] })
    } else if (data.kind === 'em-entity' || data.kind === 'em-note' || data.kind === 'em-gwt') {
      const raw = (data as { raw?: string }).raw
      const text = (data as { name?: string }).name ?? raw ?? ''
      docLines.push({
        elementId: part.id,
        docKind: data.kind === 'em-entity' ? 'entity' : data.kind === 'em-note' ? 'note' : 'gwt',
        text: text.split('\n')[0],
      })
    }
  }

  // 数据块引用回填（帧 → 数据块）
  const dataByName = new Map<string, ProjectionEmData>()
  for (const block of dataBlocks) dataByName.set(block.name, block)
  for (const frame of frames) {
    if (frame.dataReference === null) continue
    const block = dataByName.get(frame.dataReference)
    if (block !== undefined && !block.referencedBy.includes(frame.elementId)) {
      block.referencedBy.push(frame.elementId)
    }
  }

  // 次遍：连线（显式 `->>` + 默认推断；**无源码语句、只读**）
  const relations: ProjectionEmRelation[] = []
  let ordinal = 0
  frames.forEach((frame, index) => {
    // 首帧 / 重置帧：无入边（research §8.4：isEmResetFrame || isFirstFrame → 无）
    if (index === 0 || frame.isReset) return
    if (frame.sourceFrames.length > 0) {
      for (const fid of frame.sourceFrames) {
        const source = frameIdToElementId.get(fid) ?? null
        ordinal++
        relations.push({
          elementId: `relation:${ordinal}`,
          source,
          target: frame.elementId,
          origin: 'explicit',
          editable: true,
        })
      }
      return
    }
    // 默认推断：从上一帧倒扫、第一个「泳道不同」的帧（findBoxByLineIndex 口径）
    const targetSwimlane = frame.swimlane
    let source: string | null = null
    for (let i = index - 1; i >= 0; i--) {
      if (frames[i].swimlane !== targetSwimlane) {
        source = frames[i].elementId
        break
      }
    }
    ordinal++
    relations.push({
      elementId: `relation:${ordinal}`,
      source,
      target: frame.elementId,
      origin: 'inferred',
      editable: false,
    })
  })

  // 泳道分组（按首次出现序归并；同泳道带不同命名空间各成一组）
  const swimlanes: ProjectionEmSwimlane[] = []
  const swimlaneKey = new Map<string, ProjectionEmSwimlane>()
  for (const frame of frames) {
    const key = `${frame.swimlane}\u0000${frame.namespace}`
    let lane = swimlaneKey.get(key)
    if (lane === undefined) {
      lane = { swimlane: frame.swimlane, label: frame.swimlaneLabel, frames: [] }
      swimlaneKey.set(key, lane)
      swimlanes.push(lane)
    }
    lane.frames.push(frame)
  }

  return {
    frames,
    dataBlocks,
    relations,
    swimlanes,
    docLines,
    nextFrameOrdinal: frames.length + 1,
  }
}

/** 帧号 → elementId（`->>` 表单 / 键盘复用；未声明的帧号返回 undefined） */
export function emFrameElementIdOf(projection: EventModelingProjection, frameId: string): string | undefined {
  return projection.frames.find((f) => f.frameId === frameId)?.elementId
}

// ---------- 选中回落 ----------

/** 选中目标在投影中仍存在则原样返回，否则回落 null（由调用方回落图表级） */
export function resolveEventModelingSelection(
  projection: EventModelingProjection,
  selection: Selection | null,
): Selection | null {
  if (selection === null) return null
  switch (selection.kind) {
    case 'diagram':
      return selection
    case 'em-frame':
      return projection.frames.some((f) => f.elementId === selection.elementId) ? selection : null
    case 'em-data':
      return projection.dataBlocks.some((d) => d.elementId === selection.elementId) ? selection : null
    case 'em-relation':
      return projection.relations.some((r) => r.elementId === selection.elementId) ? selection : null
    default:
      return null
  }
}

/** 导出供表单 / 结构树复用的词法助手 */
export { emNamespaceOf, emNameOf, emEntityGroupOf, emSwimlaneOfGroup, type EventModelingElementData }
