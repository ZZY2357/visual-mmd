import { describe, expect, it } from 'vitest'

import { initI18n } from '../../../i18n'
import {
  BORDER_DASH_OPTIONS,
  ARROW_OPTIONS,
  DIRECTION_OPTIONS,
  LINK_STYLE_OPTIONS,
  SHAPE_OPTIONS,
} from '../flowchart-forms'
import {
  BLOCK_KEYWORD_OPTIONS,
  MESSAGE_ACT_OPTIONS,
  MESSAGE_ARROW_OPTIONS,
  NOTE_POS_OPTIONS,
} from '../sequence-forms'
import { RELATION_KIND_OPTIONS, VISIBILITY_OPTIONS } from '../class-forms'
import { MINDMAP_SHAPE_OPTIONS } from '../mindmap-forms'

/**
 * i18n 锁步对测试（architecture-deepening-2 工单 07）：
 * 每张枚举选项表都以 {value, labelKey} 对导出，文案键与字典必须锁步延伸。
 * 遍历所有选项表，断言 t(labelKey) 不返回键名本身——字典缺键即在此红。
 */
const OPTION_TABLES = {
  SHAPE_OPTIONS,
  LINK_STYLE_OPTIONS,
  ARROW_OPTIONS,
  DIRECTION_OPTIONS,
  BORDER_DASH_OPTIONS,
  MESSAGE_ARROW_OPTIONS,
  MESSAGE_ACT_OPTIONS,
  NOTE_POS_OPTIONS,
  BLOCK_KEYWORD_OPTIONS,
  RELATION_KIND_OPTIONS,
  VISIBILITY_OPTIONS,
  MINDMAP_SHAPE_OPTIONS,
}

const t = initI18n().t.bind(initI18n())

describe('选项表与 i18n 字典的锁步对', () => {
  it('每张选项表都不为空', () => {
    for (const [name, table] of Object.entries(OPTION_TABLES)) {
      expect(table.length, name).toBeGreaterThan(0)
    }
  })

  it('每个 labelKey 在字典中都有文案（t 不回退为键名本身）', () => {
    for (const [name, table] of Object.entries(OPTION_TABLES)) {
      for (const { labelKey } of table) {
        expect(t(labelKey), `${name} 的 ${labelKey}`).not.toBe(labelKey)
      }
    }
  })
})
