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
  // 代码面板是源码的编辑入口；store 的外部变更（如恢复存档）才需要回写视图
  const isInternalUpdate = useRef(false)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        isInternalUpdate.current = true
        commitTypedSource(update.state.doc.toString())
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

  // 外部源码变更（如恢复存档）回写 CodeMirror；避免编辑自身触发的回环
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }
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

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Title order={4}>{t('codePanel.title')}</Title>
      <Box
        ref={hostRef}
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
