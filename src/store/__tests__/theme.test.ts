import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { readTheme } from '../../lib/pipeline/frontmatter'
import { resetEditorHistory, useEditorStore } from '../editor'

/**
 * store 集成（工单 11）：主题选择经 commitIntent（set-theme 意图）
 * 手术式落码，独立快照、可撤销。
 */
describe('editor store：主题选择器', () => {
  beforeEach(() => {
    window.localStorage?.clear()
    resetEditorHistory(DEFAULT_DIAGRAM_SOURCE)
  })

  it('切换主题写入 frontmatter 并可撤销回无主题状态', () => {
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'dark' })).toBe(true)
    const dark = useEditorStore.getState().source
    expect(dark.startsWith('---\nconfig:\n  theme: dark\n---\n')).toBe(true)
    expect(readTheme(dark)).toBe('dark')

    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'forest' })).toBe(true)
    const forest = useEditorStore.getState().source
    expect(forest.startsWith('---\nconfig:\n  theme: forest\n---\n')).toBe(true)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(dark)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().source).toBe(dark)
  })

  it('非法主题值被拒绝', () => {
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'solarized' })).toBe(false)
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
  })

  it('既有 frontmatter 的其他配置项经 store 落码后逐字保留', () => {
    const src = '---\ntitle: 我的图\n---\nflowchart TD\n    A --> B\n'
    resetEditorHistory(src)
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'neutral' })).toBe(true)
    const out = useEditorStore.getState().source
    expect(out).toBe('---\ntitle: 我的图\nconfig:\n  theme: neutral\n---\nflowchart TD\n    A --> B\n')
  })
})
