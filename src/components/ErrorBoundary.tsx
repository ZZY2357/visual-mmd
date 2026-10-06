import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import { Alert, Button, Code, CopyButton, Group, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

/**
 * 面板级错误边界（工单 10）：
 * - 三栏布局中每个面板各挂一个边界，某个面板渲染崩溃只降级该面板，
 *   其余面板照常渲染（边界隔离）。
 * - 错误态提供两个出口：
 *   「重新渲染」= 清除错误状态并重挂载子树（generation 递增作为 key）；
 *   「重置视图」= 在重挂载之外再重置画布视图状态（缩放/平移）——
 *   视图状态是 CanvasPanel 内 useCanvasView 的局部 state，重挂载即回到 fit，
 *   故仅画布面板有此动作；其它面板没有视图状态，不提供该按钮。
 * - 错误摘要（消息 + 堆栈）以文本形式展示，可用 CopyButton 一键复制后反馈。
 *
 * 边界是类组件（React 错误边界只能是类组件）；错误态 UI 拆成函数组件以使用
 * hooks（useTranslation / CopyButton 的 render-prop）。
 */

export type ErrorBoundaryPane = 'code' | 'canvas' | 'properties'

export interface ErrorBoundaryProps {
  /** 面板标识：用于错误态文案与摘要（代码面板 / 画布 / 属性面板） */
  pane: ErrorBoundaryPane
  children: ReactNode
  /**
   * 重置视图钩子（仅画布注入）。默认实现即重挂载子树——视图状态在
   * CanvasPanel 内，重挂载自然回到 fit；注入回调用于将来有外部视图状态时扩展。
   */
  onResetView?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
  componentStack: string
  /** 恢复动作的代数：作为子树 key 强制重挂载 */
  generation: number
}

/** 摘要文本（可复制）：标题 / 面板 / 消息 / 堆栈。全部经 i18n，无硬编码文案。 */
function buildSummary(
  t: (key: string, options?: Record<string, unknown>) => string,
  paneLabel: string,
  error: Error,
  componentStack: string,
): string {
  const message = error.message !== '' ? error.message : error.name
  const stack = error.stack !== undefined && error.stack !== '' ? error.stack : componentStack
  const lines = [
    t('app:errorBoundary.summaryHeader'),
    t('app:errorBoundary.summaryPane', { pane: paneLabel }),
    t('app:errorBoundary.summaryMessage', { message }),
  ]
  if (stack !== '') {
    lines.push(t('app:errorBoundary.summaryStack'), stack)
  }
  return lines.join('\n')
}

function ErrorFallback(props: {
  pane: ErrorBoundaryPane
  error: Error
  componentStack: string
  onRerender: () => void
  onResetView: () => void
}) {
  const { t } = useTranslation()
  const paneLabel = t(`app:errorBoundary.pane.${props.pane}`)
  const summary = buildSummary(t, paneLabel, props.error, props.componentStack)

  return (
    <Stack
      gap="xs"
      data-error-boundary={props.pane}
      style={{ height: '100%', minHeight: 0, overflow: 'auto' }}
    >
      <Alert color="red" title={t('app:errorBoundary.title')}>
        <Text size="sm">{t('app:errorBoundary.hint')}</Text>
      </Alert>
      <Text size="xs" c="dimmed">
        {t('app:errorBoundary.summaryLabel')}
      </Text>
      <Code
        block
        data-error-summary
        style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}
      >
        {summary}
      </Code>
      <Group gap="xs">
        <Button size="compact-xs" onClick={props.onRerender}>
          {t('app:errorBoundary.rerender')}
        </Button>
        {props.pane === 'canvas' && (
          <Button
            size="compact-xs"
            variant="default"
            title={t('app:errorBoundary.resetViewHint')}
            onClick={props.onResetView}
          >
            {t('app:errorBoundary.resetView')}
          </Button>
        )}
        <CopyButton value={summary} timeout={1500}>
          {({ copied, copy }) => (
            <Button size="compact-xs" variant="light" onClick={copy}>
              {copied ? t('app:errorBoundary.copied') : t('app:errorBoundary.copy')}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Stack>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '', generation: 0 }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(_error: Error, errorInfo: ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? '' })
  }

  /** 重新渲染：清除错误并重挂载子树 */
  private rerender = (): void => {
    this.setState((s) => ({ error: null, componentStack: '', generation: s.generation + 1 }))
  }

  /** 重置视图：先执行宿主钩子，再重挂载（画布视图随之回到 fit） */
  private resetView = (): void => {
    this.props.onResetView?.()
    this.setState((s) => ({ error: null, componentStack: '', generation: s.generation + 1 }))
  }

  render(): ReactNode {
    const { error, componentStack, generation } = this.state
    if (error !== null) {
      return (
        <ErrorFallback
          pane={this.props.pane}
          error={error}
          componentStack={componentStack}
          onRerender={this.rerender}
          onResetView={this.resetView}
        />
      )
    }
    // key 变更强制子树重挂载：崩溃后被丢弃的树以全新状态重建。
    // 用 Fragment（不产生布局盒）以免干扰三栏 flex 布局。
    return <Fragment key={generation}>{this.props.children}</Fragment>
  }
}
