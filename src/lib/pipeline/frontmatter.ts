/**
 * frontmatter 主题配置（工单 11，图种无关）：
 * 五种 mermaid 主题以 YAML frontmatter 的 `config: theme:` 落码（mermaid v10.5+
 * 官方写法，金样测试用 mermaid v12 实际 parse 验证其合法性）。
 *
 * 手术式语义（ADR-0008）：
 * - 无 frontmatter：在文首插入 `---\nconfig:\n  theme: xxx\n---\n`
 * - 已有 frontmatter：只新增/改写主题项一行；用户手写的其余配置项逐字保留
 *
 * 本模块不参与各图种解析器的元素解析；frontmatter 块整体作为文档开头的
 * verbatim 区间被解析器保留（各 parseDocument 用 frontmatterEnd 跳过）。
 */

export type MermaidTheme = 'default' | 'neutral' | 'dark' | 'forest' | 'base'

export const MERMAID_THEMES: readonly MermaidTheme[] = ['default', 'neutral', 'dark', 'forest', 'base']

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

/** 读取当前主题；无 frontmatter / 无 config / 无 theme / 值非法时返回 null */
export function readTheme(source: string): MermaidTheme | null {
  const split = splitFrontmatter(source)
  if (split === null) return null
  const configIdx = findConfigLine(split.lines)
  if (configIdx === -1) return null
  const themeIdx = findThemeLine(split.lines, configIdx)
  if (themeIdx === -1) return null
  const value = split.lines[themeIdx].slice(split.lines[themeIdx].indexOf(':') + 1).trim()
  return isMermaidTheme(value) ? value : null
}

/**
 * 主题编辑的手术式落码：`(当前源码, 主题) → 新源码`。
 * 未触碰的 frontmatter 配置项与图表正文逐字保留。
 */
export function applySetTheme(source: string, theme: MermaidTheme): string {
  const split = splitFrontmatter(source)
  if (split === null) {
    return `---\nconfig:\n  theme: ${theme}\n---\n` + source
  }
  const { lines, openDelimiter, closeDelimiter, body, eol } = split
  const configIdx = findConfigLine(lines)
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
