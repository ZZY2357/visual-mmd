import { beforeAll, describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { initI18n, setAppLanguage } from '../index'

/**
 * i18n-english 工单 02：核心界面（头部 / 三栏 / 画布 / 属性面板 / 图表库 / 主题）
 * 用到的键在英文下必须是英文（不得回退出中文，也不得出现裸 key）。
 * 图种菜单（canvas.menu.*）与表单键归工单 03–06，不在此列。
 */

const CORE_KEYS = [
  'title',
  'subtitle',
  'layout.collapseDisabled',
  'codePanel.title',
  'codePanel.ariaLabel',
  'codePanel.collapse',
  'codePanel.expand',
  'canvas.title',
  'canvas.rendering',
  'canvas.empty',
  'canvas.errorTitle',
  'canvas.emptySource',
  'canvas.keyboardHint',
  'canvas.unsupportedTitle',
  'canvas.unsupportedHint',
  'canvas.fitView',
  'canvas.selectHint',
  'canvas.inlineEditAria',
  'history.undo',
  'history.redo',
  'file.import',
  'file.importAria',
  'file.importReadError',
  'file.export',
  'file.exportMmd',
  'file.exportSvg',
  'file.exportPng',
  'file.exportUnavailable',
  'newDiagram.title',
  'library.title',
  'library.ariaLabel',
  'library.open',
  'library.openAria',
  'library.active',
  'library.empty',
  'library.rename',
  'library.renameAria',
  'library.duplicate',
  'library.duplicateAria',
  'library.delete',
  'library.deleteAria',
  'library.renameTitle',
  'library.nameLabel',
  'library.cancel',
  'library.apply',
  'library.deleteTitle',
  'library.deleteConfirm',
  'library.deleteIrreversible',
  'library.deleteConfirmAction',
  'propertyPanel.title',
  'propertyPanel.ariaLabel',
  'propertyPanel.collapse',
  'propertyPanel.expand',
  'propertyPanel.theme',
  'propertyPanel.themeAria',
  'propertyPanel.themeFollow',
  'propertyPanel.themeInvalid',
  'propertyPanel.structureTree',
  'propertyPanel.diagram',
  'propertyPanel.nodes',
  'propertyPanel.edges',
  'propertyPanel.subgraphs',
  'propertyPanel.classDefs',
  'propertyPanel.edgeLabel',
  'propertyPanel.unnamedSubgraph',
  'propertyPanel.nothingSelected',
  'propertyPanel.disabledTitle',
  'propertyPanel.disabledHint',
  'propertyPanel.gotoError',
  'propertyPanel.unsupportedTitle',
  'propertyPanel.unsupportedHint',
  'propertyPanel.add',
  'propertyPanel.delete',
  'propertyPanel.apply',
  'propertyPanel.cancel',
  'propertyPanel.direction',
]

const THEME_KEYS = [
  'themeDefault',
  'themeNeutral',
  'themeDark',
  'themeForest',
  'themeBase',
  'themeReduxColor',
  'themeReduxDarkColor',
  'themeRedux',
  'themeReduxDark',
  'themeNeo',
  'themeNeoDark',
].map((k) => `propertyPanel.${k}`)

// newDiagram 下的 31 个图种名（core: 新建菜单）
const NEW_DIAGRAM_KEYS = [
  'flowchart', 'sequence', 'class', 'mindmap', 'state', 'er', 'gitgraph', 'timeline',
  'kanban', 'requirement', 'journey', 'pie', 'block', 'sankey', 'gantt', 'quadrant',
  'packet', 'xychart', 'radar', 'architecture', 'treemap', 'ishikawa', 'wardley',
  'venn', 'cynefin', 'usecase', 'treeview', 'eventmodeling', 'agentflow', 'zenuml', 'c4',
].map((k) => `newDiagram.${k}`)

const ALL_CORE_KEYS = [...CORE_KEYS, ...THEME_KEYS, ...NEW_DIAGRAM_KEYS]

beforeAll(() => {
  initI18n()
})

describe('英文核心界面文案', () => {
  it('每个核心键在英文下都翻译且不含中文、不回退裸 key', async () => {
    await setAppLanguage('en')
    for (const key of ALL_CORE_KEYS) {
      const text = i18next.t(key)
      expect(text, `key ${key} 回退成了中文`).not.toMatch(/[\u4e00-\u9fff]/)
      expect(text, `key ${key} 是裸 key`).not.toBe(key)
    }
  })

  it('中文下核心键不受影响（抽查）', async () => {
    await setAppLanguage('zh')
    expect(i18next.t('codePanel.title')).toBe('代码面板')
    expect(i18next.t('newDiagram.flowchart')).toBe('流程图')
  })
})
