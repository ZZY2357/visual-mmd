import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/editor'
import { NoticeBar } from './NoticeBar'
import { isDirty, useFileBindingStore } from '../lib/file-binding'

/**
 * 本地文件绑定提示（self-grill-hardening 工单 18）。
 *
 * 以 fixed 浮层呈现（同 StorageNotice / CrossTabNotice / PendingWritebackNotice），
 * 不参与三栏布局。两种态：
 * - **ready**：显示已连接的文件名与「有/无未保存改动」——明示磁盘文件与图表库草稿的关系
 *   （草稿自动存、磁盘需点「保存」），并提供「解除绑定」。
 * - **needs-permission / denied / error**：句柄仍在但不可用，提供「重新连接 / 重试」——
 *   权限请求需要用户手势，所以只能由这里的按钮触发。
 *
 * 文案全走 i18n；动作经 props 注入（App 提供，测试可替身）。
 */
export interface FileSyncNoticeProps {
  /** 重新授权 / 重试读取绑定文件 */
  onReconnect: () => void
  /** 解除文件绑定（不删磁盘文件） */
  onUnbind: () => void
}

export function FileSyncNotice({ onReconnect, onUnbind }: FileSyncNoticeProps) {
  const { t } = useTranslation()
  const status = useFileBindingStore((s) => s.status)
  const fileName = useFileBindingStore((s) => s.fileName)
  const lastSavedSource = useFileBindingStore((s) => s.lastSavedSource)
  const handle = useFileBindingStore((s) => s.handle)
  const source = useEditorStore((s) => s.source)

  if (status === 'none' || fileName === null) return null

  const dirty = isDirty({ handle, lastSavedSource }, source)

  let title: string
  let hint: string
  let actionLabel: string | null = null
  let action: (() => void) | null = null

  switch (status) {
    case 'ready':
      title = t('fileSync.bound', { name: fileName })
      hint = dirty ? t('fileSync.dirty') : t('fileSync.clean')
      break
    case 'needs-permission':
      title = t('fileSync.needsPermission', { name: fileName })
      hint = ''
      actionLabel = t('fileSync.reconnect')
      action = onReconnect
      break
    case 'denied':
      title = t('fileSync.denied', { name: fileName })
      hint = ''
      actionLabel = t('fileSync.retry')
      action = onReconnect
      break
    case 'error':
    default:
      title = t('fileSync.error', { name: fileName })
      hint = ''
      actionLabel = t('fileSync.retry')
      action = onReconnect
      break
  }

  return (
    <NoticeBar
      color={status === 'ready' ? 'teal' : 'orange'}
      title={title}
      dataAttribute="data-file-sync"
      dataValue={status}
      extraDataAttributes={{ 'data-file-dirty': status === 'ready' && dirty ? 'true' : undefined }}
      role="status"
      // 与其它提示（bottom 16 / 88）错开，避免叠放
      bottom={160}
      zIndex={420}
      hint={hint === '' ? title : hint}
      closeButton={{ ariaLabel: t('fileSync.unbind'), onClick: onUnbind }}
    >
      {actionLabel !== null && action !== null ? (
        <Button size="compact-xs" variant="filled" onClick={action}>
          {actionLabel}
        </Button>
      ) : null}
      <Button size="compact-xs" variant="default" onClick={onUnbind}>
        {t('fileSync.unbind')}
      </Button>
    </NoticeBar>
  )
}
