import { Select } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { MERMAID_THEMES, isMermaidTheme, readTheme, type MermaidTheme } from '../lib/pipeline/frontmatter'
import { useEditorStore } from '../store/editor'

/**
 * 主题选择器（工单 01，spec 用户故事 34）：
 * - 置顶「跟随 Mermaid 默认（不设置主题）」= 源码里没有 theme 键，选它即清除主题键
 * - 其余 11 项为 mermaid 12 注册的全部主题，经 frontmatter 意图（set-theme）
 *   手术式落码、可撤销
 * - 回显源码里的**原始字符串**（源码是唯一真相源）；手写非法值时回显原文并提示
 */

/** 「跟随 Mermaid 默认」的哨兵值（不是主题名，仅用于 Select 选项） */
const FOLLOW_THEME_VALUE = '__follow__'

const THEME_LABEL_KEY: Record<MermaidTheme, string> = {
  default: 'themeDefault',
  neutral: 'themeNeutral',
  dark: 'themeDark',
  forest: 'themeForest',
  base: 'themeBase',
  'redux-color': 'themeReduxColor',
  'redux-dark-color': 'themeReduxDarkColor',
  redux: 'themeRedux',
  'redux-dark': 'themeReduxDark',
  neo: 'themeNeo',
  'neo-dark': 'themeNeoDark',
}

export function ThemePicker({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation()
  const source = useEditorStore((s) => s.source)
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const current = readTheme(source)
  const invalidRaw = current !== null && !isMermaidTheme(current) ? current : null

  return (
    <Select
      size="xs"
      label={t('app:propertyPanel.theme')}
      aria-label={t('app:propertyPanel.themeAria')}
      allowDeselect={false}
      disabled={disabled}
      data={[
        { value: FOLLOW_THEME_VALUE, label: t('app:propertyPanel.themeFollow') },
        ...MERMAID_THEMES.map((theme) => ({
          value: theme,
          label: t(`app:propertyPanel.${THEME_LABEL_KEY[theme]}`),
        })),
        // 手写非法值：如实回显原文（mermaid 会静默忽略它并回退到图表默认）
        ...(invalidRaw === null ? [] : [{ value: invalidRaw, label: invalidRaw }]),
      ]}
      value={current ?? FOLLOW_THEME_VALUE}
      error={invalidRaw === null ? undefined : t('app:propertyPanel.themeInvalid')}
      onChange={(value) => {
        if (value === null) return
        // 跟随 = 清除主题键（store 侧校验白名单，非法值不会落码）
        commitIntent({ type: 'set-theme', theme: value === FOLLOW_THEME_VALUE ? null : value })
      }}
    />
  )
}
