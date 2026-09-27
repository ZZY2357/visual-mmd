import { Select } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { MERMAID_THEMES, readTheme, type MermaidTheme } from '../lib/pipeline/frontmatter'
import { useEditorStore } from '../store/editor'

/**
 * 主题选择器（工单 11，spec 用户故事 34）：五种 mermaid 主题，
 * 经 frontmatter 意图（set-theme）手术式落码、可撤销；
 * 当前主题从源码 frontmatter 读取（源码是唯一真相源）。
 */

const THEME_LABEL_KEY: Record<MermaidTheme, string> = {
  default: 'themeDefault',
  neutral: 'themeNeutral',
  dark: 'themeDark',
  forest: 'themeForest',
  base: 'themeBase',
}

export function ThemePicker({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation()
  const source = useEditorStore((s) => s.source)
  const commitIntent = useEditorStore((s) => s.commitIntent)
  const current = readTheme(source)

  return (
    <Select
      size="xs"
      label={t('app:propertyPanel.theme')}
      aria-label={t('app:propertyPanel.themeAria')}
      allowDeselect={false}
      disabled={disabled}
      data={MERMAID_THEMES.map((theme) => ({
        value: theme,
        label: t(`app:propertyPanel.${THEME_LABEL_KEY[theme]}`),
      }))}
      value={current ?? 'default'}
      onChange={(value) => {
        if (value === null) return
        commitIntent({ type: 'set-theme', theme: value as MermaidTheme })
      }}
    />
  )
}
