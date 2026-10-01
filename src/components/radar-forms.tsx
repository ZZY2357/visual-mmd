import { Button, Select, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionRadarAxis, ProjectionRadarCurve, RadarProjection } from '../lib/projection/radar-projection'
import {
  isValidRadarId,
  isValidRadarLabelText,
  isValidRadarNumber,
  isValidRadarOptionValue,
  RADAR_OPTION_NAMES,
  type RadarIntent,
  type RadarOptionName,
} from '../lib/pipeline/radar'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * radar 属性表单集合（more-diagrams 工单 15）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 表单是 radar 的**主要文本编辑入口**：画布无 data-id 寻址（见 radar-adapter），
 * 轴/曲线的编辑入口 = 结构树选中 + 这几张表单（轴 label 另有双击内联编辑，按 class
 * 文本匹配）。数值输入按 NUMBER 词法校验（radar 无负号）；键值曲线的悬空条目
 * （ref 不在轴集合）不进表单——如实展示的是轴维度上的值。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（标题 + 选项） ----------

/** 文档中同名选项的生效值（mermaid db 语义：最后一个覆盖） */
function lastOptionValue(projection: RadarProjection, name: RadarOptionName): ProjectionRadarOptionEntry | undefined {
  const found = projection.options.filter((o) => o.name === name)
  return found[found.length - 1]
}

type ProjectionRadarOptionEntry = RadarProjection['options'][number]

export function RadarDiagramForm({ projection }: { projection: RadarProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-title', text: next } satisfies RadarIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.radarTitle')}
        placeholder={t('app:propertyPanel.radarTitle')}
        value={titleDraft.draft}
        error={isValidRadarLabelText(titleDraft.draft) ? undefined : t('app:propertyPanel.invalidRadarTitle')}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      {RADAR_OPTION_NAMES.map((name) => {
        const entry = lastOptionValue(projection, name)
        if (entry === undefined) {
          return (
            <Text key={name} size="xs" c="dimmed">
              {t('app:propertyPanel.radarOptionMissing', { name })}
            </Text>
          )
        }
        if (name === 'graticule' || name === 'showLegend') {
          const options =
            name === 'graticule'
              ? [
                  { value: 'circle', label: t('app:propertyPanel.radarGraticuleCircle') },
                  { value: 'polygon', label: t('app:propertyPanel.radarGraticulePolygon') },
                ]
              : [
                  { value: 'true', label: 'true' },
                  { value: 'false', label: 'false' },
                ]
          return (
            <Select
              key={name}
              label={t(`app:propertyPanel.radarOption.${name}`)}
              data={options}
              value={entry.value}
              onChange={(value) => {
                if (value !== null) {
                  commitIntent({ type: 'set-option-value', elementId: entry.elementId, value } satisfies RadarIntent)
                }
              }}
              allowDeselect={false}
            />
          )
        }
        return (
          <OptionValueInput
            key={name}
            name={name}
            entry={entry}
            onCommit={(value) =>
              commitIntent({ type: 'set-option-value', elementId: entry.elementId, value } satisfies RadarIntent)
            }
          />
        )
      })}
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.radarDiagramHint')}
      </Text>
    </Stack>
  )
}

/** NUMBER 选项（max / min / ticks）的值输入：失焦/回车提交（原文提交，词法门在管线） */
function OptionValueInput({
  name,
  entry,
  onCommit,
}: {
  name: RadarOptionName
  entry: ProjectionRadarOptionEntry
  onCommit: (value: string) => void
}) {
  const t = useTranslation().t
  const draft = useDraft(entry.value, onCommit)
  return (
    <TextInput
      label={t(`app:propertyPanel.radarOption.${name}`)}
      value={draft.draft}
      error={isValidRadarOptionValue(name, draft.draft) ? undefined : t('app:propertyPanel.invalidRadarOptionValue')}
      onChange={(e) => draft.setDraft(e.currentTarget.value)}
      onBlur={draft.commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') draft.commit()
      }}
    />
  )
}

// ---------- 轴 ----------

export function RadarAxisForm({ axis }: { axis: ProjectionRadarAxis }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const idDraft = useDraft(axis.id, (next) => {
    commitIntent({ type: 'set-axis-id', elementId: axis.elementId, id: next } satisfies RadarIntent)
  })
  const labelDraft = useDraft(axis.label ?? '', (next) => {
    commitIntent({ type: 'set-axis-label', elementId: axis.elementId, label: next } satisfies RadarIntent)
  })

  function deleteAxis() {
    if (commitIntent({ type: 'delete-axis', elementId: axis.elementId } satisfies RadarIntent)) {
      clearSelection()
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {axis.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.radarAxisId')}
        value={idDraft.draft}
        error={isValidRadarId(idDraft.draft) ? undefined : t('app:propertyPanel.invalidRadarId')}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.radarAxisLabel')}
        placeholder={t('app:propertyPanel.radarAxisLabelPlaceholder')}
        value={labelDraft.draft}
        error={isValidRadarLabelText(labelDraft.draft) ? undefined : t('app:propertyPanel.invalidRadarLabelText')}
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      <Button variant="light" color="red" onClick={deleteAxis}>
        {t('app:propertyPanel.deleteRadarAxis')}
      </Button>
    </Stack>
  )
}

// ---------- 曲线 ----------

export function RadarCurveForm({
  curve,
  projection,
}: {
  curve: ProjectionRadarCurve
  projection: RadarProjection
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const idDraft = useDraft(curve.id, (next) => {
    commitIntent({ type: 'set-curve-id', elementId: curve.elementId, id: next } satisfies RadarIntent)
  })
  const labelDraft = useDraft(curve.label ?? '', (next) => {
    commitIntent({ type: 'set-curve-label', elementId: curve.elementId, label: next } satisfies RadarIntent)
  })

  function deleteCurve() {
    if (commitIntent({ type: 'delete-curve', elementId: curve.elementId } satisfies RadarIntent)) {
      clearSelection()
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {curve.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.radarCurveId')}
        value={idDraft.draft}
        error={isValidRadarId(idDraft.draft) ? undefined : t('app:propertyPanel.invalidRadarId')}
        onChange={(e) => idDraft.setDraft(e.currentTarget.value)}
        onBlur={idDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') idDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.radarCurveLabel')}
        placeholder={t('app:propertyPanel.radarCurveLabelPlaceholder')}
        value={labelDraft.draft}
        error={isValidRadarLabelText(labelDraft.draft) ? undefined : t('app:propertyPanel.invalidRadarLabelText')}
        onChange={(e) => labelDraft.setDraft(e.currentTarget.value)}
        onBlur={labelDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') labelDraft.commit()
        }}
      />
      {curve.form === 'raw' ? (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.radarCurveRawHint')}
        </Text>
      ) : (
        projection.axes.map((axis) => (
          <CurveValueInput
            key={axis.id}
            curve={curve}
            axis={axis}
            onCommit={(value) =>
              commitIntent({
                type: 'set-curve-value',
                elementId: curve.elementId,
                axisId: axis.id,
                value,
              } satisfies RadarIntent)
            }
          />
        ))
      )}
      <Button variant="light" color="red" onClick={deleteCurve}>
        {t('app:propertyPanel.deleteRadarCurve')}
      </Button>
    </Stack>
  )
}

/** 单轴数值输入：缺条目（mermaid 渲染会报错的手写源码）禁用并提示，不假装可编辑 */
function CurveValueInput({
  curve,
  axis,
  onCommit,
}: {
  curve: ProjectionRadarCurve
  axis: ProjectionRadarAxis
  onCommit: (value: string) => void
}) {
  const t = useTranslation().t
  const value = curve.values[axis.id]
  const draft = useDraft(value === undefined ? '' : String(value), onCommit)
  const missing = value === undefined
  return (
    <TextInput
      label={t('app:propertyPanel.radarCurveValue', { axis: axis.label ?? axis.id })}
      value={draft.draft}
      disabled={missing}
      description={missing ? t('app:propertyPanel.radarCurveValueMissing') : undefined}
      error={isValidRadarNumber(draft.draft) ? undefined : t('app:propertyPanel.invalidRadarNumber')}
      onChange={(e) => draft.setDraft(e.currentTarget.value)}
      onBlur={draft.commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') draft.commit()
      }}
    />
  )
}
