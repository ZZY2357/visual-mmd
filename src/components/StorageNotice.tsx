import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/editor'
import { NoticeBar } from './NoticeBar'

/**
 * 存储降级提示（self-grill-hardening 工单 07）。
 *
 * - quota（保存失败）：可关闭的红条，提示「图表已留在内存中」；下次保存成功后自动消失。
 * - unavailable（隐私模式）：黄色条，一次性明示本地存储不可用；确认后不再出现。
 *
 * 以 fixed 浮层呈现，不参与三栏布局——避免挤压编辑器高度（App 只需挂载本组件）。
 * 文案全部经 i18n（no-hardcoded-chinese.test.ts 审计）。
 */
export function StorageNotice() {
  const { t } = useTranslation()
  const issue = useEditorStore((s) => s.storageIssue)
  const dismiss = useEditorStore((s) => s.dismissStorageIssue)

  if (issue === null) return null

  const title = issue === 'quota' ? t('storage.saveFailedTitle') : t('storage.unavailableTitle')
  const hint = issue === 'quota' ? t('storage.saveFailedHint') : t('storage.unavailableHint')

  return (
    <NoticeBar
      color={issue === 'quota' ? 'red' : 'yellow'}
      title={title}
      dataAttribute="data-storage-notice"
      dataValue={issue}
      role="alert"
      bottom={16}
      zIndex={400}
      hint={hint}
      closeButton={{ ariaLabel: t('storage.dismiss'), onClick: dismiss }}
    >
      <Button size="compact-xs" variant="default" onClick={dismiss}>
        {t('storage.dismiss')}
      </Button>
    </NoticeBar>
  )
}
