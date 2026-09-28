import type { MindmapIntent, MindmapShapeType } from '../pipeline/mindmap'
import { isValidMindmapNodeId, isValidMindmapNodeText } from '../pipeline/mindmap'

/**
 * 表单值 → 编辑意图 的纯映射（工单 08）。
 * 本模块不做任何解析或落码：产出意图后由管线 applyEdit 执行。
 * 意图集合与语义见 src/lib/pipeline/mindmap.ts。
 */

/** mindmap 节点形状下拉选项（mermaid v12 全部形状 + 默认无形状） */
export const MINDMAP_SHAPE_OPTIONS: Array<{ value: MindmapShapeType | 'default'; label: string }> = [
  { value: 'default', label: 'default' },
  { value: 'square', label: 'square' },
  { value: 'rounded', label: 'rounded' },
  { value: 'circle', label: 'circle' },
  { value: 'bang', label: 'bang' },
  { value: 'cloud', label: 'cloud' },
  { value: 'hexagon', label: 'hexagon' },
]

export function setMindmapNodeTextIntent(elementId: string, text: string): MindmapIntent | null {
  return isValidMindmapNodeText(text) ? { type: 'set-node-text', elementId, text } : null
}

/**
 * 节点 ID 字段 → set-node-id 意图（工单 05）。
 * 空串 = 清除 id（还原纯文本节点）；非法字符（空白/圆括号/方括号/花括号）返回 null，
 * 表单层据此展示错误并阻止提交。是否为空操作（无 id 可清、id 未变）由管线侧判定。
 */
export function setMindmapNodeIdIntent(elementId: string, id: string): MindmapIntent | null {
  if (id === '') return { type: 'set-node-id', elementId, id: null }
  if (!isValidMindmapNodeId(id)) return null
  return { type: 'set-node-id', elementId, id }
}

export function setMindmapNodeShapeIntent(
  elementId: string,
  shape: MindmapShapeType | 'default',
): MindmapIntent {
  return { type: 'set-node-shape', elementId, shape: shape === 'default' ? null : shape }
}

export function setMindmapNodeIconIntent(elementId: string, icon: string): MindmapIntent {
  return { type: 'set-node-icon', elementId, icon: icon === '' ? null : icon }
}

export function addChildIntent(
  parentElementId: string | undefined,
  text: string,
  shape?: MindmapShapeType | 'default',
): MindmapIntent | null {
  if (!isValidMindmapNodeText(text)) return null
  return {
    type: 'add-child',
    ...(parentElementId !== undefined ? { parentElementId } : {}),
    text,
    ...(shape !== undefined && shape !== 'default' ? { shape } : {}),
  }
}

export function addSiblingIntent(
  elementId: string,
  text: string,
  shape?: MindmapShapeType | 'default',
): MindmapIntent | null {
  if (!isValidMindmapNodeText(text)) return null
  return {
    type: 'add-sibling',
    elementId,
    text,
    ...(shape !== undefined && shape !== 'default' ? { shape } : {}),
  }
}

export function deleteMindmapNodeIntent(elementId: string): MindmapIntent {
  return { type: 'delete-node', elementId }
}
