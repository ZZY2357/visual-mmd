import { useEffect, useState } from 'react'
import mermaid from 'mermaid'
import { extractParseError, type SourceParseError } from '../lib/mermaid-error'
import { ensureZenumlRegistered, isZenumlSource } from './zenuml-registration'

/**
 * 用 mermaid 实时渲染给定源码的自定义 Hook。
 * 错误冻结语义（ADR-0003，ADR-0008 之下仍有效）：
 * parse/render 失败时保留最近一次合法的 SVG，返回错误信息。
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

export interface MermaidPreview {
  /** 最近一次合法渲染的 SVG；从未成功过时为 null */
  svg: string | null
  /** 当前源码的解析/渲染错误；合法时为 null */
  error: SourceParseError | null
  rendering: boolean
}

export function useMermaidPreview(source: string): MermaidPreview {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<SourceParseError | null>(null)
  const [rendering, setRendering] = useState(true)

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
      } catch (e) {
        if (cancelled) return
        // 失败时不更新 svg —— 画布停留在最近一次合法状态
        setError(extractParseError(e))
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source])

  return { svg, error, rendering }
}
