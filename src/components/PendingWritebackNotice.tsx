import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/editor'
import { NoticeBar } from './NoticeBar'

/**
 * 挂起的外部写回提示（self-grill-hardening 工单 09）。
 *
 * 代码面板打字打到一半时，表单/画布的外部写回不再静默覆盖未完成的输入，而是被
 * 挂起（store.pendingWriteback）并浮出本提示。用户二选一：
 *
 * - 「接受外部变更」：以外部源码替换本页（一次可撤销编辑，见 acceptPendingWriteback）；
 * - 「放弃外部变更」：丢弃外部变更，本页源码获胜——按 LWW（ADR-0003/0008）在下次保存
 *   时覆盖对方。提示文案明示这一点，让静默丢数据变成一次有意识的选择。
 *
 * 以 fixed 浮层呈现（同 StorageNotice / CrossTabNotice），不参与三栏布局。
 * 文案全部经 i18n（no-hardcoded-chinese.test.ts 审计）。
 */
export function PendingWritebackNotice() {
  const { t } = useTranslation()
  const pending = useEditorStore((s) => s.pendingWriteback)
  const accept = useEditorStore((s) => s.acceptPendingWriteback)
  const discard = useEditorStore((s) => s.discardPendingWriteback)

  if (pending === null) return null

  return (
    <NoticeBar
      color="orange"
      title={t('pendingWriteback.title')}
      dataAttribute="data-pending-writeback"
      dataValue={pending.origin}
      role="alert"
      // 与 StorageNotice / CrossTabNotice（bottom: 16）错开，三者同时出现时不叠在一起
      bottom={88}
      zIndex={410}
      hint={t('pendingWriteback.hint')}
    >
      <Button size="compact-xs" variant="filled" onClick={accept}>
        {t('pendingWriteback.accept')}
      </Button>
      <Button size="compact-xs" variant="default" onClick={discard}>
        {t('pendingWriteback.discard')}
      </Button>
    </NoticeBar>
  )
}
