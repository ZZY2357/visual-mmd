/**
 * frontmatter 主题配置（工单 01，图种无关）：
 * mermaid 12 的 11 个主题以 YAML frontmatter 的 `config: theme:` 落码
 * （mermaid v10.5+ 官方写法，金样测试用 mermaid v12 实际 parse 验证其合法性）。
 *
 * 手术式语义（ADR-0008）：
 * - 无 frontmatter：在文首插入 `---\nconfig:\n  theme: xxx\n---\n`
 * - 已有 frontmatter：只新增/改写主题项一行；用户手写的其余配置项逐字保留
 * - 清除（theme = null）：删 `theme:` 行 → `config:` 下再无有效子项（忽略空行与
 *   `#` 注释）则连 `config:` 行一起删 → frontmatter 因此无有效内容则连整块一起删
 *   （回到「无 frontmatter」），正文与其余配置项逐字保留
 *
 * 本模块不参与各图种解析器的元素解析；frontmatter 块整体作为文档开头的
 * verbatim 区间被解析器保留（各 parseDocument 用 frontmatterEnd 跳过）。
 */

export type MermaidTheme =
  | 'default'
  | 'neutral'
  | 'dark'
  | 'forest'
  | 'base'
  | 'redux-color'
  | 'redux-dark-color'
  | 'redux'
  | 'redux-dark'
  | 'neo'
  | 'neo-dark'

/**
 * mermaid 12 注册的全部 11 个主题（spec 背景事实）。
 * 顺序 = 选择器展示顺序：既有 5 个在前，新增 6 个在后。
 */
export const MERMAID_THEMES: readonly MermaidTheme[] = [
  'default',
  'neutral',
  'dark',
  'forest',
  'base',
  'redux-color',
  'redux-dark-color',
  'redux',
  'redux-dark',
  'neo',
  'neo-dark',
]

export function isMermaidTheme(value: string): value is MermaidTheme {
  return (MERMAID_THEMES as readonly string[]).includes(value)
}

/**
 * 返回文首 frontmatter 块的结束偏移（块含闭合 `---` 行及其后的换行）。
 * 无完整的文首 frontmatter 块时返回 0。
 */
export function frontmatterEnd(source: string): number {
  const m = /^---[ \t\r]*\n[\s\S]*?\n---[ \t\r]*(?:\n|$)/.exec(source)
  return m === null ? 0 : m[0].length
}

interface FrontmatterSplit {
  /** 闭合 `---` 行之前的内容行（不含分隔符行），保留原始行文本 */
  lines: string[]
  /** 分隔符行（含换行）原文：开头 `---\n` 与结尾 `---\n` */
  openDelimiter: string
  closeDelimiter: string
  /** frontmatter 块之后的正文 */
  body: string
  /** 源码的换行风格（插入新行时跟随） */
  eol: string
}

function splitFrontmatter(source: string): FrontmatterSplit | null {
  const end = frontmatterEnd(source)
  if (end === 0) return null
  const block = source.slice(0, end)
  const body = source.slice(end)
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const rawLines = block.split(/\r?\n/)
  // 首行是 `---`，其后的换行已在分隔符里；最后一项可能是闭合行后的空串
  const closeIdx = rawLines.length - 1 >= 1 && /^---[ \t\r]*$/.test(rawLines[rawLines.length - 2] ?? '')
    ? rawLines.length - 2
    : rawLines.length - 1
  const closeDelimiter = rawLines[closeIdx] + eol
  const lines = rawLines.slice(1, closeIdx)
  return { lines, openDelimiter: '---' + eol, closeDelimiter, body, eol }
}

/** 在 config 块内找 theme 行：缩进大于 0 的 `theme:` 键，止于下一个顶层键 */
function findThemeLine(lines: string[], configIdx: number): number {
  for (let i = configIdx + 1; i < lines.length; i++) {
    const m = /^([ \t]*)/.exec(lines[i])
    if (m === null) return -1
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (m[1].length === 0) break // 下一个顶层键：config 块结束
    if (/^theme[ \t]*:/.test(trimmed)) return i
  }
  return -1
}

function findConfigLine(lines: string[]): number {
  return lines.findIndex((l) => /^config[ \t]*:/.test(l.trim()) && /^[ \t]*config[ \t]*:/.test(l))
}

/** 有效行 = 非空且非 `#` 注释（判定 config 子项与 frontmatter 是否为空时忽略它们） */
function isEffectiveLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed !== '' && !trimmed.startsWith('#')
}

/** 删掉 theme 行后，config 块内是否还有有效子项（止于下一个顶层键） */
function hasEffectiveConfigChildren(lines: string[], configIdx: number): boolean {
  for (let i = configIdx + 1; i < lines.length; i++) {
    if (!isEffectiveLine(lines[i])) continue
    const indent = /^([ \t]*)/.exec(lines[i])?.[1] ?? ''
    if (indent.length === 0) break // 下一个顶层键：config 块结束
    return true
  }
  return false
}

/**
 * 读取源码里的主题**原始字符串**；无 frontmatter / 无 config / 无 theme 键时返回 null。
 * 只识别 `config.theme`，顶层 `theme:` 视为无效文本（既不回显也不清除，工单 08 口径）。
 * 不做白名单过滤：手写的非法值（如 `solarized`）也如实回显（mermaid 会静默忽略它）。
 */
export function readTheme(source: string): string | null {
  const split = splitFrontmatter(source)
  if (split === null) return null
  const configIdx = findConfigLine(split.lines)
  if (configIdx === -1) return null
  const themeIdx = findThemeLine(split.lines, configIdx)
  if (themeIdx === -1) return null
  const line = split.lines[themeIdx]
  const value = line.slice(line.indexOf(':') + 1).trim()
  return value === '' ? null : value
}

/**
 * 主题编辑的手术式落码：`(当前源码, 主题) → 新源码`。
 * - theme 为字符串：新增/改写主题项一行；未触碰的 frontmatter 配置项与图表正文逐字保留
 * - theme 为 null（「跟随 Mermaid 默认」）：清除主题键，并连带清掉因此悬空的
 *   `config:` 行与 frontmatter 块
 */
export function applySetTheme(source: string, theme: MermaidTheme | null): string {
  const split = splitFrontmatter(source)
  if (split === null) return theme === null ? source : `---\nconfig:\n  theme: ${theme}\n---\n` + source
  const { lines, openDelimiter, closeDelimiter, body, eol } = split
  const configIdx = findConfigLine(lines)

  if (theme === null) {
    // ---- 清除：删 theme 行 → 若 config 再无有效子项则删 config 行 → 若 frontmatter
    // 再无有效内容则删整块（含因此悬空的空行与注释），回到「无 frontmatter」 ----
    if (configIdx === -1) return source
    const themeIdx = findThemeLine(lines, configIdx)
    if (themeIdx === -1) return source
    const withoutTheme = lines.filter((_, i) => i !== themeIdx)
    if (hasEffectiveConfigChildren(withoutTheme, configIdx)) {
      return openDelimiter + withoutTheme.join(eol) + eol + closeDelimiter + body
    }
    const withoutConfig = withoutTheme.filter((_, i) => i !== configIdx)
    if (withoutConfig.some(isEffectiveLine)) {
      return openDelimiter + withoutConfig.join(eol) + eol + closeDelimiter + body
    }
    return body
  }

  const newLines = [...lines]

  if (configIdx === -1) {
    // 无 config：把 config 块追加到闭合 `---` 之前（空行分隔可选配置，保持紧凑）
    newLines.push('config:', `  theme: ${theme}`)
  } else {
    const themeIdx = findThemeLine(newLines, configIdx)
    if (themeIdx !== -1) {
      // 已有 theme 行：只改这一行的值，缩进保持原样
      const indent = /^[ \t]*/.exec(newLines[themeIdx])?.[0] ?? '  '
      newLines[themeIdx] = `${indent}theme: ${theme}`
    } else {
      // config 存在但无 theme：紧跟 config 行插入，缩进跟随 config 的现有子项
      let childIndent = '  '
      for (let i = configIdx + 1; i < newLines.length; i++) {
        const trimmed = newLines[i].trim()
        if (trimmed === '' || trimmed.startsWith('#')) continue
        const m = /^([ \t]+)/.exec(newLines[i])
        if (m === null) break // 顶层键：config 无子项
        childIndent = m[1]
        break
      }
      newLines.splice(configIdx + 1, 0, `${childIndent}theme: ${theme}`)
    }
  }

  return openDelimiter + newLines.join(eol) + eol + closeDelimiter + body
}
