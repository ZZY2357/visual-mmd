import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { Decoration, keymap, type DecorationSet } from '@codemirror/view'
import { EditorState, Prec, StateEffect, StateField, type Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { useTranslation } from 'react-i18next'
import { Box, Stack, Title } from '@mantine/core'
import { useEditorStore } from '../store/editor'
import type { SourceParseError } from '../lib/mermaid-error'

/**
 * 代码面板（左侧）：显示并允许直接编辑当前图表的 Mermaid 源码。
 * 源码出现语法错误时，错误行整行标红（.cm-errorLine）。
 */

const setErrorLineEffect = StateEffect.define<number | null>()

/** 编辑器撑满面板宿主（工单 04）：面板内任意位置点击都落在编辑器上，焦点可进入 */
const fillPanelTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { minHeight: '100%' },
  '.cm-content': { minHeight: '100%' },
})

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setErrorLineEffect)) {
        if (effect.value === null) return Decoration.none
        const line = effect.value - 1
        if (line < 0 || line >= transaction.state.doc.lines) return Decoration.none
        const lineInfo = transaction.state.doc.line(line + 1)
        return Decoration.set([
          Decoration.line({ class: 'cm-errorLine' }).range(lineInfo.from),
        ])
      }
    }
    return decorations
  },
  provide: (field) => EditorView.decorations.from(field),
})

interface CodePanelProps {
  error: SourceParseError | null
}

export function CodePanel({ error }: CodePanelProps) {
  const { t } = useTranslation()
  const source = useEditorStore((s) => s.source)
  const commitTypedSource = useEditorStore((s) => s.commitTypedSource)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  // 最新 store 源码：区分「用户键入」与「外部同步的回声」，避免回声污染撤销历史
  const sourceRef = useRef(source)
  sourceRef.current = source

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString()
        // 外部同步（画布落码等）造成的 doc 变化与 store 一致，不上报——
        // 否则回声会写入撤销快照；且旧实现用布尔标记配对回声与外部变更，
        // 会交替吞掉外部同步，代码面板停在旧源码（工单 08 浏览器实测发现）
        if (doc !== sourceRef.current) commitTypedSource(doc)
      }
    })

    // 撤销/重做走代码快照单栈（store），压过 basicSetup 自带的文本级历史
    const snapshotHistoryKeymap = Prec.high(
      keymap.of([
        { key: 'Mod-z', run: () => (useEditorStore.getState().undo(), true) },
        { key: 'Shift-Mod-z', run: () => (useEditorStore.getState().redo(), true) },
        { key: 'Mod-y', run: () => (useEditorStore.getState().redo(), true) },
      ]),
    )

    const extensions: Extension[] = [
      basicSetup,
      snapshotHistoryKeymap,
      keymap.of([indentWithTab]),
      errorLineField,
      updateListener,
      EditorView.lineWrapping,
      // 编辑器撑满面板宿主高度：否则文档下方是宿主的空白区（工单 04 实测）——
      // 点击该区域焦点不进入 CodeMirror，Ctrl+Z 等编辑键全部落空
      fillPanelTheme,
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: source, extensions }),
      parent: host,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 仅在挂载时创建视图；源码同步通过下方 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部源码变更（画布落码、恢复存档等）回写 CodeMirror；doc 已一致时无事发生
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== source) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: source },
      })
    }
  }, [source])

  // 错误行号变化时更新标红装饰
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    view.dispatch({ effects: setErrorLineEffect.of(error?.line ?? null) })
  }, [error])

  // 错误行跳转请求（属性面板触发）：滚动到目标行并高亮
  const gotoLine = useEditorStore((s) => s.gotoLine)
  useEffect(() => {
    const view = viewRef.current
    if (view === null || gotoLine === null) return
    const lineNo = Math.min(Math.max(gotoLine.line, 1), view.state.doc.lines)
    const lineInfo = view.state.doc.line(lineNo)
    view.dispatch({
      effects: [
        setErrorLineEffect.of(lineNo),
        EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
      ],
    })
  }, [gotoLine])

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Title order={4}>{t('codePanel.title')}</Title>
      <Box
        ref={hostRef}
        onMouseDown={(e) => {
          // 兜底：点到编辑器之外的宿主表面（边框缝隙等）时把焦点交给编辑器（工单 04）
          if ((e.target as Element).closest('.cm-editor') === null) viewRef.current?.focus()
        }}
        h="100%"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 'var(--mantine-radius-sm)',
        }}
        aria-label={t('codePanel.ariaLabel')}
      />
    </Stack>
  )
}
