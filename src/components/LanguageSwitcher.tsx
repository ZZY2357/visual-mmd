import { SegmentedControl } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { setAppLanguage, supportedLanguages } from '../i18n'
import type { AppLanguage } from '../i18n/language'

/**
 * 界面语言切换控件（i18n-english 工单 01）：
 * 切换立即生效（i18next.changeLanguage）并持久化到 localStorage；
 * languageChanged 事件驱动 useTranslation 订阅者整体重渲染。
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const language = i18n.language as AppLanguage

  return (
    <SegmentedControl
      size="compact-sm"
      aria-label={t('language.switchAria')}
      data={supportedLanguages.map((lng) => ({ value: lng, label: t(`language.${lng}`) }))}
      value={language}
      onChange={(value) => {
        if (value !== language) void setAppLanguage(value as AppLanguage)
      }}
    />
  )
}
