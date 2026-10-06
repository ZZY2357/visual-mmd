import type { ReactNode } from 'react'
import { Alert, CloseButton, Group, Text } from '@mantine/core'

/**
 * 浮层提示条（NoticeBar）——四个通知组件（StorageNotice / CrossTabNotice /
 * PendingWritebackNotice / FileSyncNotice）共用的纯展示外壳。
 *
 * 抽取自四处几乎逐字重复的 `<Alert>` 固定定位 + `<Group>/<Text>/<Button>/<CloseButton>`
 * 布局（Fowler：Duplicated Code）。本组件只负责：
 * - fixed 浮层的定位样式（left/bottom/transform/zIndex/宽度/阴影）；
 * - 文本行与动作区的排布；
 * - 透传 data-* / role 等可观测属性。
 *
 * 业务判定（何时渲染、文案、颜色、按钮行为）仍留在各自的容器组件里，
 * 通过 props 注入——本组件不含任何 store 依赖，便于测试与复用。
 */
export interface NoticeBarProps {
  /** Mantine Alert 主题色（如 'red' / 'yellow' / 'blue' / 'orange' / 'teal'） */
  color: string
  /** 标题文案（已由调用方经 i18n 解析） */
  title: string
  /**
   * 可观测的 `data-*` 标识属性名（如 `data-storage-notice`）。
   * 测试与外部脚本依赖这些属性，故由调用方逐一指定，值经 `dataValue` 传入。
   */
  dataAttribute: string
  /** `dataAttribute` 对应的值 */
  dataValue: string
  /** 附加 `data-*` 属性（值为 undefined 时不渲染，如 FileSync 的 data-file-dirty） */
  extraDataAttributes?: Record<string, string | undefined>
  /** 无障碍角色：Alert 类提示用 'alert'，状态类用 'status' */
  role: 'alert' | 'status'
  /** 距视口底部的偏移（px），用于多个提示错开堆叠 */
  bottom: number
  /** 浮层层级，越大越靠上（与 bottom 共同维持既有堆叠顺序） */
  zIndex: number
  /** 正文文案（已由调用方经 i18n 解析） */
  hint: string
  /** 动作按钮（渲染在正文之后、关闭按钮之前） */
  children?: ReactNode
  /** 可选的关闭按钮（aria-label 与点击行为由调用方提供） */
  closeButton?: { ariaLabel: string; onClick: () => void }
}

export function NoticeBar({
  color,
  title,
  dataAttribute,
  dataValue,
  extraDataAttributes,
  role,
  bottom,
  zIndex,
  hint,
  children,
  closeButton,
}: NoticeBarProps) {
  return (
    <Alert
      color={color}
      title={title}
      {...{ [dataAttribute]: dataValue }}
      {...extraDataAttributes}
      role={role}
      style={{
        position: 'fixed',
        left: '50%',
        bottom,
        transform: 'translateX(-50%)',
        zIndex,
        maxWidth: 560,
        width: 'calc(100% - 32px)',
        boxShadow: 'var(--mantine-shadow-md)',
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Text size="sm">{hint}</Text>
        {children}
        {closeButton !== undefined ? (
          <CloseButton aria-label={closeButton.ariaLabel} onClick={closeButton.onClick} />
        ) : null}
      </Group>
    </Alert>
  )
}
