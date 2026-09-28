import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_DIAGRAM_SOURCE } from '../../lib/storage'
import { MERMAID_THEMES, isMermaidTheme, readTheme } from '../../lib/pipeline/frontmatter'
import { resetEditorHistory, useEditorStore } from '../editor'

/**
 * store 集成（工单 01）：主题选择经 commitIntent（set-theme 意图）
 * 手术式落码，独立快照、可撤销；theme = null 即「跟随 Mermaid 默认」（清除主题键）。
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

  it('11 个主题全部可设置（含 mermaid 12 新增的 6 个）', () => {
    expect(MERMAID_THEMES).toHaveLength(11)
    for (const theme of MERMAID_THEMES) {
      expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme })).toBe(true)
      expect(readTheme(useEditorStore.getState().source)).toBe(theme)
      useEditorStore.getState().undo()
    }
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
  })

  it('白名单扩到 11 个后，非法主题值仍被拒绝', () => {
    expect(isMermaidTheme('solarized')).toBe(false)
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'solarized' })).toBe(false)
    // 契约外的取值（缺 theme / 非字符串）也拒绝
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme' })).toBe(false)
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 42 })).toBe(false)
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
  })

  it('清除意图（theme: null）：主题键被清干净并可撤销/重做', () => {
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'redux-color' })).toBe(true)
    const withTheme = useEditorStore.getState().source
    expect(readTheme(withTheme)).toBe('redux-color')

    // 跟随 Mermaid 默认：悬空的 config 行与 frontmatter 块一起清除
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: null })).toBe(true)
    const cleared = useEditorStore.getState().source
    expect(cleared).toBe(DEFAULT_DIAGRAM_SOURCE)
    expect(readTheme(cleared)).toBe(null)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(withTheme)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().source).toBe(withTheme)
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().source).toBe(DEFAULT_DIAGRAM_SOURCE)
  })

  it('清除时用户手写的其余 config 项逐字保留', () => {
    const src = `---\ntitle: 我的图\nconfig:\n  theme: dark\n  themeVariables:\n    fontSize: 16px\n---\nflowchart TD\n    A --> B\n`
    resetEditorHistory(src)
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: null })).toBe(true)
    expect(useEditorStore.getState().source).toBe(
      `---\ntitle: 我的图\nconfig:\n  themeVariables:\n    fontSize: 16px\n---\nflowchart TD\n    A --> B\n`,
    )
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(src)
  })

  it('手写非法主题值经 store 不被吞掉（回显原文），清除可用', () => {
    const src = '---\nconfig:\n  theme: solarized\n---\nflowchart TD\n    A --> B\n'
    resetEditorHistory(src)
    expect(readTheme(useEditorStore.getState().source)).toBe('solarized')
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: null })).toBe(true)
    expect(useEditorStore.getState().source).toBe('flowchart TD\n    A --> B\n')
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().source).toBe(src)
  })

  it('既有 frontmatter 的其他配置项经 store 落码后逐字保留', () => {
    const src = '---\ntitle: 我的图\n---\nflowchart TD\n    A --> B\n'
    resetEditorHistory(src)
    expect(useEditorStore.getState().commitIntent({ type: 'set-theme', theme: 'neutral' })).toBe(true)
    const out = useEditorStore.getState().source
    expect(out).toBe('---\ntitle: 我的图\nconfig:\n  theme: neutral\n---\nflowchart TD\n    A --> B\n')
  })
})
