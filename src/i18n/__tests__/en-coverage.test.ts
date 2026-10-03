import { describe, expect, it } from 'vitest'
import { zhDict, enDict } from '../index'

/**
 * i18n-english 工单 08：全量覆盖审计（防回归）。
 * - 英文资源必须覆盖中文资源的全部叶键（新增文案只改中文会在此失败）
 * - 英文值不得含中文字符（不得拿中文充当英文文案）
 */

function leaves(obj: Record<string, unknown>, prefix = ''): Array<[string, string]> {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return v !== null && typeof v === 'object'
      ? leaves(v as Record<string, unknown>, key)
      : [[key, String(v)]]
  })
}

describe('en 资源全量覆盖审计', () => {
  const zhLeaves = leaves(zhDict.app)
  const enMap = new Map(leaves(enDict.app))

  it('每个中文叶键在英文资源中都有对应条目', () => {
    const missing = zhLeaves.filter(([k]) => !enMap.has(k))
    expect(missing, `缺失 ${missing.length} 个键`).toEqual([])
  })

  it('英文值不含中文字符且不为空', () => {
    // language.zh 是语言自身的名字（「中文」），任何语言下都保持原样
    const offenders = leaves(enDict.app).filter(
      ([k, v]) => k !== 'language.zh' && (/[\u4e00-\u9fff]/.test(v) || v === ''),
    )
    expect(offenders).toEqual([])
  })
})
