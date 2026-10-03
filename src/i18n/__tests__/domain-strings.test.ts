import { describe, expect, it } from 'vitest'
import { initI18n, setAppLanguage } from '../index'
import { copyDiagramName, newElementName, unnamedDiagramName } from '../domain-strings'

/**
 * i18n-english 工单 07：领域层默认命名跟随界面语言。
 * - 未初始化 i18next（纯 lib 测试环境）回落中文：既有测试的中文断言不受影响
 * - 初始化并切英文后产出英文默认名
 */

describe('领域层默认命名', () => {
  it('未初始化 i18next 时回落中文', () => {
    expect(newElementName('node')).toBe('新节点')
    expect(unnamedDiagramName()).toBe('未命名图表')
    expect(copyDiagramName('流程图')).toBe('流程图 副本')
  })

  it('切英文后产出英文默认名', () => {
    initI18n()
    return setAppLanguage('en').then(() => {
      expect(newElementName('node')).toBe('New node')
      expect(newElementName('section')).toBe('New section')
      expect(unnamedDiagramName()).toBe('Untitled diagram')
      expect(copyDiagramName('My diagram')).toBe('My diagram copy')
      return setAppLanguage('zh').then(() => {
        expect(newElementName('node')).toBe('新节点')
      })
    })
  })
})
