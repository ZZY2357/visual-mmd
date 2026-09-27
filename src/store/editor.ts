import { create } from 'zustand'
import { DEFAULT_DIAGRAM_SOURCE, loadDiagram } from '../lib/storage'

/**
 * 编辑器状态：源码是唯一真相源（ADR-0008）。
 * 画布渲染与后续的投影派生都只从 source 出发。
 */

interface EditorState {
  /** 当前图表的 Mermaid 源码 */
  source: string
  setSource: (source: string) => void
}

function initialSource(): string {
  const stored = loadDiagram()
  return stored !== null ? stored.source : DEFAULT_DIAGRAM_SOURCE
}

export const useEditorStore = create<EditorState>((set) => ({
  source: initialSource(),
  setSource: (source) => set({ source }),
}))
