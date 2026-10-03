import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * i18n-english 工单 08：UI 组件层不得出现硬编码中文文案字面量。
 * 组件目录（src/components/**.tsx，不含测试）里，字符串字面量中的中文只允许出现在
 * 注释行；文案一律走 src/i18n 字典（lib 层的中文标签表与 mermaid 模板不在本检查范围，
 * 分别由 en-coverage 与既有测试覆盖）。
 */

function collectTsx(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...collectTsx(full))
    } else if (name.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

const CJK = /[\u4e00-\u9fff]/
const STRING_LITERALS = /(?<!\\)(['"])(?:\\.|(?!\1).)*?\1/g

describe('组件层无硬编码中文文案', () => {
  const files = collectTsx(join(__dirname, '..'))

  it('所有组件文件的字符串字面量不含中文（注释除外）', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, i) => {
        const stripped = line.trim()
        if (stripped.startsWith('*') || stripped.startsWith('//') || stripped.startsWith('/*')) return
        for (const m of line.matchAll(STRING_LITERALS)) {
          if (CJK.test(m[0])) offenders.push(`${file}:${i + 1}: ${stripped.slice(0, 100)}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
