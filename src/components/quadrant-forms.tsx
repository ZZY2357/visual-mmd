import { Button, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionQuadrantAxis,
  ProjectionQuadrantPoint,
  ProjectionQuadrantQuadrant,
  QuadrantProjection,
} from '../lib/projection/quadrant-projection'
import {
  isQuadrantCoordinate,
  isValidQuadrantPointText,
  isValidQuadrantSegmentText,
  isValidQuadrantStyleValue,
  isValidQuadrantTitle,
  type QuadrantIntent,
  type QuadrantStyleField,
} from '../lib/pipeline/quadrant'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * quadrant 属性表单集合（more-diagrams 工单 12）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 轴与象限标题是文档级属性元素（工单定案）：只有文本编辑、无删除语义。
 * 点表单暴露 text / x / y 与四个已知内联样式字段（color / radius / stroke-color /
 * stroke-width，与 mermaid parseStyles 的分支一致）；样式输入留空提交 = 删除字段。
 * 坐标只接受 0–1 的合法词法（越界拒绝落码——工单定案源码始终合法），非法值以原文
 * 回显在输入框上并提示，不提交。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（标题） ----------

export function QuadrantDiagramForm({ projection }: { projection: QuadrantProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-title', text: next } satisfies QuadrantIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.quadrantTitle')}
        placeholder={t('app:propertyPanel.quadrantTitle')}
        value={titleDraft.draft}
        error={
          titleDraft.draft === '' || isValidQuadrantTitle(titleDraft.draft)
            ? undefined
            : t('app:propertyPanel.invalidQuadrantTitle')
        }
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.quadrantDiagramHint')}
      </Text>
    </Stack>
  )
}

// ---------- 轴（文档级属性元素） ----------

export function QuadrantAxisForm({ axis }: { axis: ProjectionQuadrantAxis }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const firstDraft = useDraft(axis.first, (next) => {
    commitIntent({
      type: 'set-axis',
      axis: axis.elementId === 'x-axis' ? 'x' : 'y',
      segment: 'first',
      text: next,
    } satisfies QuadrantIntent)
  })
  const secondDraft = useDraft(axis.second ?? '', (next) => {
    commitIntent({
      type: 'set-axis',
      axis: axis.elementId === 'x-axis' ? 'x' : 'y',
      segment: 'second',
      text: next,
    } satisfies QuadrantIntent)
  })

  const firstLabel =
    axis.elementId === 'x-axis'
      ? t('app:propertyPanel.quadrantXAxisFirst')
      : t('app:propertyPanel.quadrantYAxisFirst')
  const secondLabel =
    axis.elementId === 'x-axis'
      ? t('app:propertyPanel.quadrantXAxisSecond')
      : t('app:propertyPanel.quadrantYAxisSecond')

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {axis.elementId === 'x-axis'
          ? t('app:propertyPanel.quadrantXAxis')
          : t('app:propertyPanel.quadrantYAxis')}
      </Text>
      <TextInput
        label={firstLabel}
        value={firstDraft.draft}
        error={
          isValidQuadrantSegmentText(firstDraft.draft)
            ? undefined
            : t('app:propertyPanel.invalidQuadrantSegment')
        }
        onChange={(e) => firstDraft.setDraft(e.currentTarget.value)}
        onBlur={firstDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') firstDraft.commit()
        }}
      />
      <TextInput
        label={secondLabel}
        value={secondDraft.draft}
        error={
          isValidQuadrantSegmentText(secondDraft.draft)
            ? undefined
            : t('app:propertyPanel.invalidQuadrantSegment')
        }
        onChange={(e) => secondDraft.setDraft(e.currentTarget.value)}
        onBlur={secondDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') secondDraft.commit()
        }}
      />
    </Stack>
  )
}

// ---------- 象限标题（文档级属性元素） ----------

export function QuadrantQuadrantForm({ quadrant }: { quadrant: ProjectionQuadrantQuadrant }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(quadrant.text, (next) => {
    commitIntent({
      type: 'set-quadrant-text',
      elementId: quadrant.elementId,
      text: next,
    } satisfies QuadrantIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.quadrantQuadrantN', { n: quadrant.index })}
      </Text>
      <TextInput
        label={t('app:propertyPanel.quadrantQuadrantText')}
        value={textDraft.draft}
        error={
          isValidQuadrantSegmentText(textDraft.draft)
            ? undefined
            : t('app:propertyPanel.invalidQuadrantSegment')
        }
        onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
        onBlur={textDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') textDraft.commit()
        }}
      />
    </Stack>
  )
}

// ---------- 点 ----------

/** 单个内联样式字段输入：留空提交 = 删除字段（未触碰字段逐字保留在源码里） */
function QuadrantStyleInput({
  field,
  value,
  elementId,
}: {
  field: QuadrantStyleField
  value: string | null
  elementId: string
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const draft = useDraft(value ?? '', (next) => {
    const trimmed = next.trim()
    commitIntent({
      type: 'set-point-style',
      elementId,
      field,
      value: trimmed === '' ? null : trimmed,
    } satisfies QuadrantIntent)
  })

  return (
    <TextInput
      label={t(`app:propertyPanel.quadrantStyle_${field}`)}
      value={draft.draft}
      error={
        draft.draft.trim() === '' || isValidQuadrantStyleValue(field, draft.draft)
          ? undefined
          : t('app:propertyPanel.invalidQuadrantStyleValue')
      }
      onChange={(e) => draft.setDraft(e.currentTarget.value)}
      onBlur={draft.commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') draft.commit()
      }}
    />
  )
}

export function QuadrantPointForm({ point }: { point: ProjectionQuadrantPoint }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(point.text, (next) => {
    commitIntent({
      type: 'set-point-text',
      elementId: point.elementId,
      text: next,
    } satisfies QuadrantIntent)
  })
  const xDraft = useDraft(point.xText, (next) => {
    commitIntent({
      type: 'set-point-coords',
      elementId: point.elementId,
      x: next,
      y: point.yText,
    } satisfies QuadrantIntent)
  })
  const yDraft = useDraft(point.yText, (next) => {
    commitIntent({
      type: 'set-point-coords',
      elementId: point.elementId,
      x: point.xText,
      y: next,
    } satisfies QuadrantIntent)
  })

  const xValid = isQuadrantCoordinate(xDraft.draft)
  const yValid = isQuadrantCoordinate(yDraft.draft)
  // 坐标非法（越界/畸形）拒绝落码——提交仅在双方都合法时发生
  const commitCoords = () => {
    if (!xValid || !yValid) return
    commitIntent({
      type: 'set-point-coords',
      elementId: point.elementId,
      x: xDraft.draft,
      y: yDraft.draft,
    } satisfies QuadrantIntent)
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {point.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.quadrantPointText')}
        value={textDraft.draft}
        error={
          isValidQuadrantPointText(textDraft.draft)
            ? undefined
            : t('app:propertyPanel.invalidQuadrantPointText')
        }
        onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
        onBlur={textDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') textDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.quadrantPointX')}
        value={xDraft.draft}
        error={xValid ? undefined : t('app:propertyPanel.invalidQuadrantCoord')}
        onChange={(e) => {
          xDraft.setDraft(e.currentTarget.value)
        }}
        onBlur={commitCoords}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitCoords()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.quadrantPointY')}
        value={yDraft.draft}
        error={yValid ? undefined : t('app:propertyPanel.invalidQuadrantCoord')}
        onChange={(e) => {
          yDraft.setDraft(e.currentTarget.value)
        }}
        onBlur={commitCoords}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitCoords()
        }}
      />
      <QuadrantStyleInput field="color" value={point.color} elementId={point.elementId} />
      <QuadrantStyleInput field="radius" value={point.radius} elementId={point.elementId} />
      <QuadrantStyleInput
        field="stroke-color"
        value={point.strokeColor}
        elementId={point.elementId}
      />
      <QuadrantStyleInput
        field="stroke-width"
        value={point.strokeWidth}
        elementId={point.elementId}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-point', elementId: point.elementId } satisfies QuadrantIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteQuadrantPoint')}
      </Button>
    </Stack>
  )
}
