import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * i18n 只配置中文 locale（spec：从第一天接入但只配中文 locale）。
 * 所有界面文案必须经过这里的字典。
 */
export const defaultNamespace = 'app'

export const zhDict = {
  app: {
    title: 'Visual MMD',
    subtitle: '可视化 Mermaid 编辑器',
    codePanel: {
      title: '代码面板',
      ariaLabel: 'Mermaid 源码编辑区',
    },
    canvas: {
      title: '画布',
      rendering: '渲染中…',
      empty: '暂无可渲染的图表',
      errorTitle: '源码存在语法错误，画布已停留在最近一次合法状态',
      emptySource: '暂无内容，请在左侧代码面板输入 Mermaid 源码',
    },
    history: {
      undo: '撤销',
      redo: '重做',
    },
  },
} as const

let initialized = false

export function initI18n(): typeof i18next {
  if (!initialized) {
    void i18next.use(initReactI18next).init({
      lng: 'zh',
      fallbackLng: 'zh',
      defaultNS: defaultNamespace,
      resources: {
        zh: zhDict,
      },
      interpolation: {
        escapeValue: false,
      },
    })
    initialized = true
  }
  return i18next
}
