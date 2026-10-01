import { useEffect, useState } from 'react'
import { Button, MultiSelect, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  GanttProjection,
  ProjectionGanttDirective,
  ProjectionGanttSection,
  ProjectionGanttTask,
} from '../lib/projection/gantt-projection'
import {
  GANTT_TAGS,
  buildGanttCoreFields,
  isValidGanttDirectiveValue,
  isValidGanttSectionName,
  isValidGanttTaskName,
  isValidGanttTitle,
  type GanttIntent,
  type GanttTaskMeta,
  type GanttTaskShape,
} from '../lib/pipeline/gantt'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * gantt 属性表单集合（more-diagrams 工单 11）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时
 * 提交，避免逐字符快照。
 *
 * 任务元数据按「形态」编辑（工单定案，与 pipeline/gantt.ts 的形态模型同源）：
 * 先选形态（起止日期 / 起止+时长 / after / until / after+until），字段输入随形态变化，
 * 提交时按形态拼回逗号序（buildGanttCoreFields）——校验不过拒绝落码（绝不产出非法
 * mermaid），输入框上就地提示。清单外形态（meta = null）不假装可编辑：先选形态
 * 初始化，再填写字段（不静默改写用户源码）。
 *
 * 日期一律按字符串提交（verbatim，工单定案）：编辑不换格式，day.js 是否可解析是
 * 渲染层事务。任务条画布可寻址（见 gantt-adapter），改名另有双击内联编辑入口
 * （inline-edit 的 gantt-task 目标，与表单共用 set-task-name 意图）；section 与
 * 指令行不可寻址，表单是其唯一编辑入口。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

/** todayMarker 从 off 切回时的缺省样式（mermaid 官方文档的示例值；off 本身由 Switch 承担） */
const TODAY_MARKER_DEFAULT_STYLE = 'stroke-width:5px,stroke:red'

// ---------- 图表（标题 + dateFormat） ----------

export function GanttDiagramForm({ projection }: { projection: GanttProjection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(projection.title ?? '', (next) => {
    commitIntent({ type: 'set-title', text: next } satisfies GanttIntent)
  })
  // dateFormat 是文档级属性元素（指令行，工单定案）：没有该行时如实提示（不新增指令行——
  // 没有加指令的编辑意图，清单外；新建模板自带 dateFormat，正常路径覆盖）
  const dateFormatDirective = projection.directives.find(
    (d) => d.keyword.toLowerCase() === 'dateformat',
  )
  const dateFormatDraft = useDraft(dateFormatDirective?.value ?? '', (next) => {
    if (dateFormatDirective === undefined) return
    commitIntent({
      type: 'set-directive',
      elementId: dateFormatDirective.elementId,
      value: next,
    } satisfies GanttIntent)
  })

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.ganttTitle')}
        placeholder={t('app:propertyPanel.ganttTitle')}
        value={titleDraft.draft}
        error={isValidGanttTitle(titleDraft.draft) ? undefined : t('app:propertyPanel.invalidGanttTitle')}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={titleDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') titleDraft.commit()
        }}
      />
      {dateFormatDirective !== undefined ? (
        <TextInput
          label={t('app:propertyPanel.ganttDateFormat')}
          value={dateFormatDraft.draft}
          error={
            isValidGanttDirectiveValue(dateFormatDirective.keyword, dateFormatDraft.draft)
              ? undefined
              : t('app:propertyPanel.invalidGanttDirectiveValue')
          }
          onChange={(e) => dateFormatDraft.setDraft(e.currentTarget.value)}
          onBlur={dateFormatDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') dateFormatDraft.commit()
          }}
        />
      ) : (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.ganttNoDateFormat')}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.ganttDiagramHint')}
      </Text>
    </Stack>
  )
}

// ---------- 指令行（文档级属性元素） ----------

export function GanttDirectiveForm({ directive }: { directive: ProjectionGanttDirective }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const isTodayMarker = directive.keyword.toLowerCase() === 'todaymarker'
  const isOff = isTodayMarker && directive.value.trim().toLowerCase() === 'off'
  const valueDraft = useDraft(directive.value, (next) => {
    commitIntent({ type: 'set-directive', elementId: directive.elementId, value: next } satisfies GanttIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {directive.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.ganttDirectiveValue', { keyword: directive.keyword })}
        value={valueDraft.draft}
        disabled={isOff}
        error={
          isValidGanttDirectiveValue(directive.keyword, valueDraft.draft)
            ? undefined
            : t('app:propertyPanel.invalidGanttDirectiveValue')
        }
        onChange={(e) => valueDraft.setDraft(e.currentTarget.value)}
        onBlur={valueDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') valueDraft.commit()
        }}
      />
      {isTodayMarker && (
        // todayMarker 的 off 开关（工单定案）：勾选 = 落 `off`（渲染层隐藏当日参考线）；
        // 取消勾选需一个非 off 值——取官方文档示例样式（渲染层再按该样式画线）
        <Switch
          label={t('app:propertyPanel.ganttTodayMarkerOff')}
          checked={isOff}
          onChange={(e) => {
            commitIntent({
              type: 'set-directive',
              elementId: directive.elementId,
              value: e.currentTarget.checked ? 'off' : TODAY_MARKER_DEFAULT_STYLE,
            } satisfies GanttIntent)
          }}
        />
      )}
    </Stack>
  )
}

// ---------- 任务（形态化元数据编辑） ----------

/** 表单里的元数据草稿（五个字段全集，按 shape 决定哪些提交） */
interface GanttMetaDraft {
  shape: GanttTaskShape
  taskId: string
  start: string
  end: string
  afterIds: string
  untilId: string
}

const EMPTY_DRAFT: GanttMetaDraft = {
  shape: 'date-end',
  taskId: '',
  start: '',
  end: '',
  afterIds: '',
  untilId: '',
}

function draftOf(meta: GanttTaskMeta): GanttMetaDraft {
  return { ...meta }
}

/** 换形态：保留语义兼容的字段，不兼容的清空（用户重新填写，不瞎猜值） */
function remapForShape(draft: GanttMetaDraft, shape: GanttTaskShape): GanttMetaDraft {
  const hasStart = shape === 'date-end' || shape === 'date-duration' || shape === 'date-until'
  const hasEnd = shape === 'date-end' || shape === 'date-duration' || shape === 'after-end'
  const hasAfter = shape === 'after-end' || shape === 'after-until'
  const hasUntil = shape === 'date-until' || shape === 'after-until'
  return {
    shape,
    taskId: draft.taskId,
    start: hasStart ? draft.start : '',
    end: hasEnd ? draft.end : '',
    afterIds: hasAfter ? draft.afterIds : '',
    untilId: hasUntil ? draft.untilId : '',
  }
}

const SHAPE_OPTIONS: { value: GanttTaskShape; labelKey: string }[] = [
  { value: 'date-end', labelKey: 'app:propertyPanel.ganttShapeDateEnd' },
  { value: 'date-duration', labelKey: 'app:propertyPanel.ganttShapeDateDuration' },
  { value: 'after-end', labelKey: 'app:propertyPanel.ganttShapeAfterEnd' },
  { value: 'date-until', labelKey: 'app:propertyPanel.ganttShapeDateUntil' },
  { value: 'after-until', labelKey: 'app:propertyPanel.ganttShapeAfterUntil' },
]

export function GanttTaskForm({ task }: { task: ProjectionGanttTask }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(task.name, (next) => {
    commitIntent({ type: 'set-task-name', elementId: task.elementId, name: next } satisfies GanttIntent)
  })
  // 元数据草稿：task.meta 更新（提交后投影重建）时重同步；清单外形态从空白草稿起步
  const [metaDraft, setMetaDraft] = useState<GanttMetaDraft>(() => (task.meta !== null ? draftOf(task.meta) : EMPTY_DRAFT))
  useEffect(() => {
    setMetaDraft(task.meta !== null ? draftOf(task.meta) : EMPTY_DRAFT)
  }, [task.meta])

  // 按形态拼回逗号字段（buildGanttCoreFields 校验：null = 有非法字段，就地提示不落码）
  const metaFields = buildGanttCoreFields(metaDraft)
  const commitMeta = (tags: string[], fields: string[]) => {
    commitIntent({ type: 'set-task-meta', elementId: task.elementId, tags, fields } satisfies GanttIntent)
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {task.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.ganttTaskName')}
        value={nameDraft.draft}
        error={isValidGanttTaskName(nameDraft.draft) ? undefined : t('app:propertyPanel.invalidGanttTaskName')}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <MultiSelect
        label={t('app:propertyPanel.ganttTaskTags')}
        data={GANTT_TAGS.map((tag) => ({ value: tag, label: tag }))}
        value={task.tags}
        onChange={(tags) => {
          // 标签即时提交：字段沿用投影现值（1–3 字段均合法，见 isValidGanttFields）
          commitMeta(tags, task.fields)
        }}
        clearable
        searchable={false}
      />
      {task.meta === null && (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.ganttMetaOtherHint')}
        </Text>
      )}
      <Select
        label={t('app:propertyPanel.ganttTaskShape')}
        data={SHAPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        value={metaDraft.shape}
        onChange={(shape) => {
          if (shape === null) return
          setMetaDraft((d) => remapForShape(d, shape as GanttTaskShape))
        }}
        allowDeselect={false}
      />
      <TextInput
        label={t('app:propertyPanel.ganttTaskId')}
        placeholder={t('app:propertyPanel.ganttTaskIdPlaceholder')}
        value={metaDraft.taskId}
        onChange={(e) => {
          const value = e.currentTarget.value
          setMetaDraft((d) => ({ ...d, taskId: value }))
        }}
        onBlur={() => {
          if (metaFields !== null) commitMeta(task.tags, metaFields)
        }}
      />
      {(metaDraft.shape === 'date-end' || metaDraft.shape === 'date-duration' || metaDraft.shape === 'date-until') && (
        <TextInput
          label={t('app:propertyPanel.ganttTaskStart')}
          value={metaDraft.start}
          onChange={(e) => {
            const value = e.currentTarget.value
            setMetaDraft((d) => ({ ...d, start: value }))
          }}
          onBlur={() => {
            if (metaFields !== null) commitMeta(task.tags, metaFields)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && metaFields !== null) commitMeta(task.tags, metaFields)
          }}
        />
      )}
      {(metaDraft.shape === 'date-end' || metaDraft.shape === 'date-duration' || metaDraft.shape === 'after-end') && (
        <TextInput
          label={
            metaDraft.shape === 'date-duration'
              ? t('app:propertyPanel.ganttTaskDuration')
              : t('app:propertyPanel.ganttTaskEnd')
          }
          value={metaDraft.end}
          onChange={(e) => {
            const value = e.currentTarget.value
            setMetaDraft((d) => ({ ...d, end: value }))
          }}
          onBlur={() => {
            if (metaFields !== null) commitMeta(task.tags, metaFields)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && metaFields !== null) commitMeta(task.tags, metaFields)
          }}
        />
      )}
      {(metaDraft.shape === 'after-end' || metaDraft.shape === 'after-until') && (
        <TextInput
          label={t('app:propertyPanel.ganttTaskAfterIds')}
          value={metaDraft.afterIds}
          onChange={(e) => {
            const value = e.currentTarget.value
            setMetaDraft((d) => ({ ...d, afterIds: value }))
          }}
          onBlur={() => {
            if (metaFields !== null) commitMeta(task.tags, metaFields)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && metaFields !== null) commitMeta(task.tags, metaFields)
          }}
        />
      )}
      {(metaDraft.shape === 'date-until' || metaDraft.shape === 'after-until') && (
        <TextInput
          label={t('app:propertyPanel.ganttTaskUntilId')}
          value={metaDraft.untilId}
          onChange={(e) => {
            const value = e.currentTarget.value
            setMetaDraft((d) => ({ ...d, untilId: value }))
          }}
          onBlur={() => {
            if (metaFields !== null) commitMeta(task.tags, metaFields)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && metaFields !== null) commitMeta(task.tags, metaFields)
          }}
        />
      )}
      {metaFields === null && (
        <Text size="xs" c="red">
          {t('app:propertyPanel.invalidGanttMeta')}
        </Text>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-task', elementId: task.elementId } satisfies GanttIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteGanttTask')}
      </Button>
    </Stack>
  )
}

// ---------- section ----------

export function GanttSectionForm({ section }: { section: ProjectionGanttSection }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(section.name, (next) => {
    commitIntent({ type: 'set-section-name', elementId: section.elementId, name: next } satisfies GanttIntent)
  })

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {section.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.ganttSectionName')}
        value={nameDraft.draft}
        error={
          isValidGanttSectionName(nameDraft.draft) ? undefined : t('app:propertyPanel.invalidGanttSectionName')
        }
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-section', elementId: section.elementId } satisfies GanttIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteGanttSection')}
      </Button>
    </Stack>
  )
}
