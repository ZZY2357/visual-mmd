import { useEffect } from 'react'
import { Button } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/editor'
import { NoticeBar } from './NoticeBar'
import {
  decideCrossTabAction,
  type CrossTabOptions,
  type UnfinishedInputProbe,
} from '../lib/cross-tab'

/**
 * 跨标签页修改提示（self-grill-hardening 工单 11）。
 *
 * 挂载即监听 window 的 `storage` 事件：他页写入图表库、且改动的正是本页当前活跃
 * 图表时，本页浮出可见提示。`storage` 事件不会在写入方自身触发，故天然只反映
 * 「别的标签页」的动作；测试用派发模拟 StorageEvent 覆盖该路径。
 *
 * - 「载入最新」：以他页源码替换本页（一次可撤销编辑，见 store.loadCrossTabChange）。
 * - 关闭：不载入，继续在本页编辑（保存时按 LWW 覆盖他页，ADR-0003/0008）——提示文案
 *   明示这一点，让最隐蔽的静默覆盖至少变成一次有意识的选择。
 * - 自动载入：仅当本页**无未完成输入**且显式开启 autoLoadWhenIdle（默认关）时发生；
 *   「未完成输入」判定经工单 09 接缝（`UnfinishedInputProbe`，默认读 store 的
 *   `hasUnfinishedInput`；09 落地前该字段恒 false）。
 *
 * 以 fixed 浮层呈现（同 StorageNotice），不参与三栏布局。文案全走 i18n。
 */
export interface CrossTabNoticeProps {
  /** 透传给决策层的策略（默认不自动载入；测试可注入） */
  options?: CrossTabOptions
  /**
   * 未完成输入探测（工单 09 接缝）。默认读 store 的 hasUnfinishedInput；
   * 09 落地后无需改动本组件，store 字段被置位即自动生效。测试可注入替身。
   */
  hasUnfinishedInput?: UnfinishedInputProbe
}

export function CrossTabNotice({ options, hasUnfinishedInput }: CrossTabNoticeProps) {
  const { t } = useTranslation()
  const change = useEditorStore((s) => s.crossTabChange)
  const load = useEditorStore((s) => s.loadCrossTabChange)
  const dismiss = useEditorStore((s) => s.dismissCrossTabChange)
  const noteChange = useEditorStore((s) => s.noteCrossTabChange)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // 从 store 现取现算，避免闭包捕获过期的 activeId / source
      const state = useEditorStore.getState()
      const probe = hasUnfinishedInput ?? (() => state.hasUnfinishedInput)
      const decision = decideCrossTabAction(
        event,
        {
          activeId: state.activeId,
          source: state.source,
          hasUnfinishedInput: probe(),
        },
        options,
      )
      if (decision.kind === 'ignore') return
      if (decision.kind === 'auto-load') {
        // 无未完成输入且显式开启自动载入：记下后立即应用（同一渲染周期内）
        noteChange(decision.change)
        useEditorStore.getState().loadCrossTabChange()
        return
      }
      noteChange(decision.change)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [options, hasUnfinishedInput, noteChange])

  if (change === null) return null

  return (
    <NoticeBar
      color="blue"
      title={t('crossTab.title')}
      dataAttribute="data-cross-tab-notice"
      dataValue="changed"
      role="alert"
      bottom={16}
      zIndex={400}
      hint={t('crossTab.hint')}
      closeButton={{ ariaLabel: t('crossTab.dismiss'), onClick: dismiss }}
    >
      <Button size="compact-xs" variant="filled" onClick={load}>
        {t('crossTab.loadLatest')}
      </Button>
      <Button size="compact-xs" variant="default" onClick={dismiss}>
        {t('crossTab.dismiss')}
      </Button>
    </NoticeBar>
  )
}
