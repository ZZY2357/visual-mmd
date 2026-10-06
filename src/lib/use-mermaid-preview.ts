import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { extractParseError, type SourceParseError } from '../lib/mermaid-error'
import { ensureZenumlRegistered, isZenumlSource } from './zenuml-registration'

/**
 * 用 mermaid 实时渲染给定源码的自定义 Hook。
 * 错误冻结语义（ADR-0003，ADR-0008 之下仍有效）：
 * parse/render 失败时保留最近一次合法的 SVG，返回错误信息。
 *
 * last good render（工单 13）：失败时画布不换 svg（冻结），并额外提供一份**去抖的**
 * `errorNotice` 供画布角标使用——打字中的连续失败只在输入停顿后浮出一份提示，
 * 不在每个按键上闪红；源码修正（渲染成功）时角标立即消失。`error` 仍是即时的
 * （代码面板据此标红错误行），两者语义不同、互不影响。
 *
 * zenuml 异步注册适配（more-diagrams 工单 19）：zenuml 是外部图种，需经
 * `mermaid.registerExternalDiagrams` 异步注册后才能渲染。本 Hook 在渲染 zenuml 源码前
 * **await 注册完成**——注册中保持 rendering 态（画布停留，不白屏）；注册失败时给出
 * 一条合成的错误（降级提示），同样不白屏。
 */

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
})

let renderSeq = 0

/** 错误角标去抖窗口：连续失败在此窗口内共用同一个定时器，只浮出一份提示 */
export const ERROR_NOTICE_DELAY_MS = 400

export interface MermaidPreview {
  /** 最近一次合法渲染的 SVG；从未成功过时为 null */
  svg: string | null
  /** 当前源码的解析/渲染错误（即时）；合法时为 null */
  error: SourceParseError | null
  /** 去抖后的错误提示（画布角标）；打字中的连续失败只保留一份 */
  errorNotice: SourceParseError | null
  rendering: boolean
}

export function useMermaidPreview(source: string): MermaidPreview {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<SourceParseError | null>(null)
  const [errorNotice, setErrorNotice] = useState<SourceParseError | null>(null)
  const [rendering, setRendering] = useState(true)

  // 去抖状态跨 effect 存活（去抖窗口的意义就在于跨越相邻的源码变化）：
  // - latestErrorRef：定时器触发时取最新一次失败（连续失败时文案跟手更新）
  // - noticeVisibleRef：角标已浮出 → 后续失败只更新文案，不叠第二份
  // - noticeTimerRef：窗口内已排定 → 不重复排定
  const latestErrorRef = useRef<SourceParseError | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeVisibleRef = useRef(false)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (noticeTimerRef.current !== null) {
        clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setRendering(true)
    void (async () => {
      try {
        // zenuml 外部图种：渲染前确保插件注册完成（懒加载，只对 zenuml 源码触发）
        if (isZenumlSource(source)) {
          await ensureZenumlRegistered()
        }
        await mermaid.parse(source)
        const { svg: rendered } = await mermaid.render(`mmd-preview-${++renderSeq}`, source)
        if (cancelled) return
        setSvg(rendered)
        setError(null)
        // 修正即恢复：角标立刻消失，未决的去抖定时器作废
        latestErrorRef.current = null
        noticeVisibleRef.current = false
        if (noticeTimerRef.current !== null) {
          clearTimeout(noticeTimerRef.current)
          noticeTimerRef.current = null
        }
        setErrorNotice(null)
      } catch (e) {
        if (cancelled) return
        // 失败时不更新 svg —— 画布停留在最近一次合法状态
        const parsed = extractParseError(e)
        setError(parsed)
        latestErrorRef.current = parsed
        if (noticeVisibleRef.current) {
          // 角标已浮出：只更新文案，不叠第二份提示
          setErrorNotice(parsed)
        } else {
          // 尾沿去抖：连续失败不断重置同一个定时器，输入停顿后才浮出**一份**角标
          if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current)
          noticeTimerRef.current = setTimeout(() => {
            noticeTimerRef.current = null
            if (unmountedRef.current) return
            noticeVisibleRef.current = true
            setErrorNotice(latestErrorRef.current)
          }, ERROR_NOTICE_DELAY_MS)
        }
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source])

  return { svg, error, errorNotice, rendering }
}
