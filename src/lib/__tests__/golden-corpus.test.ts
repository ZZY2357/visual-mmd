import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'
import { DIAGRAM_TYPE_LIST } from '../diagram-registry'
import { GOLDEN_CORPUS, getGoldenCorpusEntry, type GoldenSample } from '../golden-corpus'

/**
 * 金样库校验（ticket 05）。
 *
 * 断言：
 * 1. 语料覆盖全部已注册图种（含 zenuml），键与 DIAGRAM_TYPE_LIST 完全一致；
 * 2. 每个**非外部**图种 >= 3 条金样（起步级 / 核心语法 / 边角语法）；
 * 3. 每个非外部图种有 >= 1 条纯中文显示文本样例，或登记了语法上不可能的豁免理由；
 * 4. 全部金样通过真实 `mermaid.parse`（zenuml 除外，见下）。
 *
 * zenuml 是外部渲染器：parse 依赖异步注册 `@mermaid-js/mermaid-zenuml`，在本仓测试
 * 环境因外部包/网络不可用而失败（golden-validity.test.ts 中 zenuml 用例即此既有现象）。
 * 故本测试对 zenuml **只校验语料存在性、不校验 parse**，与既有文件同口径、不引入新失败。
 */

/** 非外部图种（zenuml 跳过 parse 断言） */
const parseableRegistrations = DIAGRAM_TYPE_LIST.filter(
  (registration) => !getGoldenCorpusEntry(registration.id)?.external,
)

const sampleLabel = (type: string, sample: GoldenSample, index: number): string =>
  `${type} 第 ${index + 1} 条金样（${sample.kind}：${sample.description}）`

describe('金样库：语料覆盖与计数', () => {
  it('语料键与注册表完全一致（含外部图种 zenuml）', () => {
    const registeredIds = DIAGRAM_TYPE_LIST.map((registration) => registration.id).sort()
    const corpusIds = Object.keys(GOLDEN_CORPUS).sort()
    expect(corpusIds).toEqual(registeredIds)
  })

  it('每个非外部图种至少 3 条金样', () => {
    const failures: string[] = []
    for (const registration of parseableRegistrations) {
      const entry = getGoldenCorpusEntry(registration.id)
      if (!entry) {
        failures.push(`${registration.id}: 语料缺失`)
        continue
      }
      if (entry.samples.length < 3) {
        failures.push(`${registration.id}: 仅 ${entry.samples.length} 条金样（需 >= 3）`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('每个非外部图种至少 1 条纯中文显示文本样例（或登记豁免理由）', () => {
    const failures: string[] = []
    for (const registration of parseableRegistrations) {
      const entry = getGoldenCorpusEntry(registration.id)
      if (!entry) {
        failures.push(`${registration.id}: 语料缺失`)
        continue
      }
      const hasChinese = entry.samples.some((sample) => sample.kind === 'chinese')
      if (!hasChinese && !entry.chineseUnsupportedReason) {
        failures.push(`${registration.id}: 无纯中文样例，也未登记豁免理由`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})

describe('金样库：全部金样通过真实 mermaid.parse', () => {
  for (const registration of parseableRegistrations) {
    const entry = getGoldenCorpusEntry(registration.id)
    if (!entry) continue
    entry.samples.forEach((sample, index) => {
      it(sampleLabel(registration.id, sample, index), async () => {
        await expect(
          mermaid.parse(sample.source),
          sampleLabel(registration.id, sample, index),
        ).resolves.toBeTruthy()
      })
    })
  }

  it('zenuml 语料存在（外部图种，parse 断言跳过——见文件头说明）', () => {
    const entry = getGoldenCorpusEntry('zenuml')
    expect(entry).toBeDefined()
    expect(entry?.external).toBe(true)
    expect(entry?.samples.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
