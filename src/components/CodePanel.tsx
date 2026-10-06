import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { Decoration, keymap, type DecorationSet } from '@codemirror/view'
import { EditorState, Prec, StateEffect, StateField, type Extension } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { useTranslation } from 'react-i18next'
import { Box, Stack, Title } from '@mantine/core'
import { useEditorStore } from '../store/editor'
import { debounce } from '../lib/debounce'
import { selectionAtSourceOffset, spanOfSelection } from '../lib/follow/source-index'
import { followGuard } from '../lib/follow/follow-guard'
import { useCursorHintStore } from '../lib/follow/hint-store'
import type { SourceParseError } from '../lib/mermaid-error'

/**
 * 代码面板（左侧）：显示并允许直接编辑当前图表的 Mermaid 源码。
 * 源码出现语法错误时，错误行整行标红（.cm-errorLine），并在行侧标记 + hover 悬浮
 * 显示错误信息（title，工单 14）——错误出现在写代码的地方，写代码的人不必去画布侧找。
 * 行号来自 mermaid 抛出的错误消息（extractParseError 已解析，工单 14 复用，不再二次解析）；
 * 拿不到行号（error.line 为 null）或行号越界时不标任何行，退化为既有全局错误提示
 * （画布角标 / 属性面板 Alert），绝不误标。
 *
 * 光标↔元素双向跟随（工单 16）：
 * - 选中画布元素 → 滚动到该元素的源码区间并短暂高亮（.cm-followHighlight，淡出清除）；
 * - 光标停在源码某行 → 对应画布元素轻量提示（写 hint store，不改选中语义）；
 * - 跟随失败（未覆盖图种 / 元素无 span）静默降级，不滚动不高亮；
 * - 程序化事务（跟随滚动、外部回写、错误行跳转）用 followGuard 标记，光标方向忽略之，
 *   双向不形成反馈循环。
 */

/** 错误行装饰载荷（工单 14）：行号 + 错误文案（文案用于行侧 hover 提示） */
interface ErrorLineMark {
  line: number
  message: string
}

const setErrorLineEffect = StateEffect.define<ErrorLineMark | null>()

/** 跟随高亮区间（[from, to) 字符偏移）；null 清除 */
const setFollowSpanEffect = StateEffect.define<{ from: number; to: number } | null>()

/** 光标→画布提示的防抖窗口：停在某行超过该值才提示，避免逐键击发 */
const CURSOR_HINT_DEBOUNCE_MS = 180

/** 跟随高亮停留时长，到点清除（短暂高亮，不做常驻装饰） */
const FOLLOW_HIGHLIGHT_MS = 1200

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
        const { line, message } = effect.value
        // 行号越界（源码已缩短等）→ 不标任何行，退化为全局提示，绝不误标
        if (line < 1 || line > transaction.state.doc.lines) return Decoration.none
        const lineInfo = transaction.state.doc.line(line)
        // title：hover 到错误行即可见错误信息（行内提示，不遮挡编辑）。
        // 文案为空（属性面板跳转行，无错误文案）时不加 title，避免空悬浮框。
        const attributes: Record<string, string> = { 'data-error-line': String(line) }
        if (message !== '') attributes.title = message
        return Decoration.set([
          Decoration.line({ class: 'cm-errorLine', attributes }).range(lineInfo.from),
        ])
      }
    }
    return decorations
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** 跟随高亮装饰（StateField，非 DOM hack）：mark 装饰落在区间上，随文档变更映射位置 */
const followSpanField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setFollowSpanEffect)) {
        if (effect.value === null) return Decoration.none
        const length = transaction.state.doc.length
        const from = Math.max(0, Math.min(effect.value.from, length))
        const to = Math.max(from, Math.min(effect.value.to, length))
        if (from === to) return Decoration.none
        return Decoration.set([Decoration.mark({ class: 'cm-followHighlight' }).range(from, to)])
      }
    }
    return decorations.map(transaction.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

interface CodePanelProps {
  error: SourceParseError | null
}

export function CodePanel({ error }: CodePanelProps) {
  const { t } = useTranslation()
  const source = useEditorStore((s) => s.source)
  const selection = useEditorStore((s) => s.selection)
  const commitTypedSource = useEditorStore((s) => s.commitTypedSource)
  const setHint = useCursorHintStore((s) => s.setHint)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  // 最新 store 源码：区分「用户键入」与「外部同步的回声」，避免回声污染撤销历史
  const sourceRef = useRef(source)
  sourceRef.current = source
  // 光标→画布提示的防抖器（跨事务复用）；跟随高亮清除定时器
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    /** 光标方向：把「当前光标所在元素」写入 hint store（防抖后） */
    const emitCursorHint = (offset: number): void => {
      // 光标不在任何元素区间内（空行 / 注释 / 未覆盖图种）→ 清空提示，静默降级
      setHint(selectionAtSourceOffset(sourceRef.current, offset))
    }
    const hintDebounced = debounce(emitCursorHint, CURSOR_HINT_DEBOUNCE_MS)

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const doc = update.state.doc.toString()
        // 外部同步（画布落码等）造成的 doc 变化与 store 一致，不上报——
        // 否则回声会写入撤销快照；且旧实现用布尔标记配对回声与外部变更，
        // 会交替吞掉外部同步，代码面板停在旧源码（工单 08 浏览器实测发现）
        if (doc !== sourceRef.current) commitTypedSource(doc)
      }
      // 光标/选区变化 → 防抖提示（不抢选中、不弹层）。
      // 反馈循环守卫：程序化事务（跟随滚动 / 外部回写 / 错误行跳转）在**调度时**就拦下
      // （守卫在 dispatch 同步期间为 true；若只在防抖回调里判会因异步失效）——
      // 取消挂起的旧提示，避免程序化滚动后补发一次误导提示。
      if (update.selectionSet || update.docChanged) {
        if (followGuard.isProgrammatic()) {
          hintDebounced.cancel()
        } else {
          hintDebounced(update.state.selection.main.head)
        }
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

    // 未完成输入探测（工单 09）：打字即代表输入会话进行中（由 commitTypedSource 置位，
    // 见 updateListener）；失焦 = 会话结束（markInputFinished 清位）。挂起的写回不在此
    // 自动应用，仍由用户在挂起提示里显式选择接受/放弃。
    const inputSessionHandlers = EditorView.domEventHandlers({
      blur: () => {
        useEditorStore.getState().markInputFinished()
      },
    })

    const extensions: Extension[] = [
      basicSetup,
      snapshotHistoryKeymap,
      keymap.of([indentWithTab]),
      errorLineField,
      followSpanField,
      updateListener,
      inputSessionHandlers,
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
      hintDebounced.cancel()
      if (highlightTimerRef.current !== null) {
        clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }
    }
    // 仅在挂载时创建视图；源码同步通过下方 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部源码变更（画布落码、恢复存档等）回写 CodeMirror；doc 已一致时无事发生。
  // 标记为程序化：由此产生的 selectionSet 事务不得反向触发画布提示（防循环）。
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== source) {
      followGuard.runProgrammatic(() => {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: source },
        })
      })
    }
  }, [source])

  // 错误行号/文案变化时更新标红装饰（工单 14：行号 + hover 文案）。
  // 无行号（error 为 null 或 line 为 null）→ 清除装饰，退化为全局提示，不误标。
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const mark: ErrorLineMark | null =
      error !== null && error.line !== null ? { line: error.line, message: error.message } : null
    view.dispatch({ effects: setErrorLineEffect.of(mark) })
  }, [error])

  // 错误行跳转请求（属性面板触发）：滚动到目标行并高亮。
  // 高亮复用错误行装饰；文案仅在目标行与当前 mermaid 错误行一致时带上（否则空文案，
  // 只做定位高亮，不把不相干的错误信息挂到该行）。
  const gotoLine = useEditorStore((s) => s.gotoLine)
  useEffect(() => {
    const view = viewRef.current
    if (view === null || gotoLine === null) return
    const lineNo = Math.min(Math.max(gotoLine.line, 1), view.state.doc.lines)
    const lineInfo = view.state.doc.line(lineNo)
    const mark: ErrorLineMark = {
      line: lineNo,
      message: error !== null && error.line === lineNo ? error.message : '',
    }
    // 程序化滚动：光标随之移动，但不得反向触发画布提示（防循环）
    followGuard.runProgrammatic(() => {
      view.dispatch({
        effects: [
          setErrorLineEffect.of(mark),
          EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
        ],
      })
    })
    // error 变化由上方 effect 独立处理；此处只在跳转请求变化时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotoLine])

  // 选中元素 → 滚动到其源码区间并短暂高亮（工单 16）。
  // 无对应 span（未覆盖图种 / 元素不可寻址 / 取消选中）时静默降级：不滚动、不高亮，
  // 并清除可能残留的旧高亮。
  // 只在**选中变化**时触发（不依赖 source）：源码每次键入都重跑会导致滚动/高亮
  // 在打字时反复打断用户。区间取当前 store 源码（getState），保证偏移不过期。
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    // 选中变化即清掉光标提示：真选中高亮接管，避免旧提示滞留（提示不抢选中语义）
    setHint(null)
    const clearTimer = () => {
      if (highlightTimerRef.current !== null) {
        clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }
    }
    const span = selection === null ? null : spanOfSelection(useEditorStore.getState().source, selection)
    if (span === null) {
      clearTimer()
      followGuard.runProgrammatic(() => {
        view.dispatch({ effects: setFollowSpanEffect.of(null) })
      })
      return
    }
    const length = view.state.doc.length
    const from = Math.max(0, Math.min(span.start, length))
    const to = Math.max(from, Math.min(span.end, length))
    // 程序化滚动 + 装饰：光标移动由跟随发起，不得反向触发画布提示（防循环）
    followGuard.runProgrammatic(() => {
      view.dispatch({
        effects: [
          setFollowSpanEffect.of({ from, to }),
          EditorView.scrollIntoView(from, { y: 'center' }),
        ],
      })
    })
    // 短暂高亮：到点清除
    clearTimer()
    highlightTimerRef.current = setTimeout(() => {
      highlightTimerRef.current = null
      const currentView = viewRef.current
      if (currentView !== null) {
        followGuard.runProgrammatic(() => {
          currentView.dispatch({ effects: setFollowSpanEffect.of(null) })
        })
      }
    }, FOLLOW_HIGHLIGHT_MS)
  }, [selection, setHint])

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
