import { useEffect, useState } from 'react'
import { ActionIcon, Button, Group, SegmentedControl, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type {
  ProjectionXychartAxis,
  ProjectionXychartSeries,
  XychartProjection,
} from '../lib/projection/xychart-projection'
import {
  isValidXychartNumberInput,
  isValidXychartText,
  type XychartIntent,
} from '../lib/pipeline/xychart'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * xychart 属性表单集合（more-diagrams 工单 14）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。文本类输入在失焦/回车时
 * 提交，避免逐字符快照。
 *
 * **数组编辑**（工单定案）：系列数值与 x 轴类别以**可增删的行列表**呈现（不是自由
 * 文本框）；落码数值保留原字面格式（`45` 不写 `45.0`），未触碰行原文逐字回写。
 * 带点标签（v11.16）的系列 editable=false——表单不展开数值行（工单定案，记录在案），
 * 只展示提示文案。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 行编辑器（系列数值 / x 轴类别共用骨架） ----------

/** 单行草稿输入：外部值变化时同步，失焦/回车时提交（合法才提交，非法标红不落码） */
function DraftRow({
  value,
  onCommit,
  validate,
  errorText,
  ariaLabel,
}: {
  value: string
  onCommit: (next: string) => void
  validate: (text: string) => boolean
  errorText: string
  ariaLabel: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const valid = validate(draft.trim()) || draft.trim() === ''
  const commit = (): void => {
    const next = draft.trim()
    if (next === '' || !validate(next)) return
    onCommit(next)
  }
  return (
    <TextInput
      value={draft}
      error={valid ? undefined : errorText}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      flex={1}
      aria-label={ariaLabel}
    />
  )
}

/**
 * 可增删的行列表（工单定案的数组编辑形态）：每行一个 token（数值或类别文本），
 * 行内草稿失焦/回车提交，删除按钮由 canDelete 门控（至少保留一行）。
 */
function ValueRows({
  rows,
  onChange,
  onDelete,
  onAdd,
  canDelete,
  addLabel,
  numberOnly,
}: {
  rows: { key: string; text: string }[]
  onChange: (index: number, next: string) => void
  onDelete: (index: number) => void
  onAdd: () => void
  canDelete: boolean
  addLabel: string
  /** true = 数值行（数值词法校验），false = 文本行（文本落码门校验） */
  numberOnly: boolean
}) {
  const t = useTranslation().t
  const invalidText = t('app:propertyPanel.invalidXychartText')
  const invalidNumber = t('app:propertyPanel.invalidXychartNumber')
  return (
    <Stack gap="xs">
      {rows.map((row, i) => (
        <Group key={row.key} gap="xs" wrap="nowrap" align="center">
          <DraftRow
            value={row.text}
            onCommit={(next) => onChange(i, next)}
            validate={numberOnly ? isValidXychartNumberInput : isValidXychartText}
            errorText={numberOnly ? invalidNumber : invalidText}
            ariaLabel={`${t('app:propertyPanel.xychartValueN')} ${i + 1}`}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            disabled={!canDelete}
            aria-label={t('app:propertyPanel.deleteXychartValue', { index: i + 1 })}
            onClick={() => onDelete(i)}
          >
            ✕
          </ActionIcon>
        </Group>
      ))}
      <Button variant="light" onClick={onAdd}>
        ＋ {addLabel}
      </Button>
    </Stack>
  )
}

// ---------- 标题 ----------

export function XychartTitleForm({ title }: { title: XychartProjection['title'] }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const textDraft = useDraft(title?.text ?? '', (next) => {
    if (!isValidXychartText(next)) return
    commitIntent({ type: 'set-title', text: next } satisfies XychartIntent)
  })
  const invalid = textDraft.draft.trim() !== '' && !isValidXychartText(textDraft.draft)
  return (
    <TextInput
      label={t('app:propertyPanel.xychartTitle')}
      value={textDraft.draft}
      error={invalid ? t('app:propertyPanel.invalidXychartText') : undefined}
      onChange={(e) => textDraft.setDraft(e.currentTarget.value)}
      onBlur={() => {
        if (!invalid) textDraft.commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !invalid) textDraft.commit()
      }}
    />
  )
}

// ---------- 轴 ----------

/**
 * 轴表单（文档级属性元素）：标题 + 后半段（x = 类别行列表或数值 range；y = 可选 range，
 * Switch 控制启停——range 可省自动推算）。形态切换由意图隐式完成（在 range 形态下加
 * 类别 = 转类别形态；set-axis-range = 转 range 形态）。
 */
export function XychartAxisForm({ axis }: { axis: ProjectionXychartAxis }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const titleDraft = useDraft(axis.title ?? '', (next) => {
    if (!isValidXychartText(next)) return
    commitIntent({ type: 'set-axis-title', axis: axis.axis, title: next } satisfies XychartIntent)
  })
  const titleInvalid = titleDraft.draft.trim() !== '' && !isValidXychartText(titleDraft.draft)

  const isX = axis.axis === 'x'
  const inCategories = isX && axis.form === 'categories'

  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.xychartAxisTitle', { axis: axis.axis.toUpperCase() })}
        value={titleDraft.draft}
        error={titleInvalid ? t('app:propertyPanel.invalidXychartText') : undefined}
        onChange={(e) => titleDraft.setDraft(e.currentTarget.value)}
        onBlur={() => {
          if (!titleInvalid) titleDraft.commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !titleInvalid) titleDraft.commit()
        }}
      />
      {isX && (
        <>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {t('app:propertyPanel.xychartAxisForm')}
            </Text>
            <SegmentedControl
              size="xs"
              value={inCategories ? 'categories' : 'range'}
              data={[
                { value: 'categories', label: t('app:propertyPanel.xychartUseCategories') },
                { value: 'range', label: t('app:propertyPanel.xychartUseRange') },
              ]}
              onChange={(v) => {
                if (v === 'range' && !inCategories) {
                  // 类别/无后半段 → range：以既有 range 或 0-->100 起步（可再改）
                  commitIntent({
                    type: 'set-axis-range',
                    axis: 'x',
                    min: axis.range?.min ?? '0',
                    max: axis.range?.max ?? '100',
                  } satisfies XychartIntent)
                } else if (v === 'categories' && inCategories === false) {
                  // range/无后半段 → 类别：首个类别用默认名（可再改）
                  commitIntent({ type: 'add-axis-category', text: t('app:propertyPanel.xychartNewCategory') } satisfies XychartIntent)
                }
              }}
            />
          </Group>
          {inCategories ? (
            <ValueRows
              rows={axis.categories.map((c, i) => ({ key: `${i}:${c.raw}`, text: c.text }))}
              onChange={(index, next) => {
                commitIntent({ type: 'set-axis-category', index, text: next } satisfies XychartIntent)
              }}
              onDelete={(index) => commitIntent({ type: 'delete-axis-category', index } satisfies XychartIntent)}
              onAdd={() => commitIntent({ type: 'add-axis-category', text: t('app:propertyPanel.xychartNewCategory') } satisfies XychartIntent)}
              canDelete={axis.categories.length > 1}
              addLabel={t('app:propertyPanel.xychartAddCategory')}
              numberOnly={false}
            />
          ) : (
            <Group gap="xs" align="center" wrap="nowrap">
              <DraftRow
                value={axis.range?.min ?? ''}
                onCommit={(next) => commitIntent({ type: 'set-axis-range', axis: 'x', min: next, max: axis.range?.max ?? '100' } satisfies XychartIntent)}
                validate={isValidXychartNumberInput}
                errorText={t('app:propertyPanel.invalidXychartNumber')}
                ariaLabel={t('app:propertyPanel.xychartMin')}
              />
              <Text size="sm" c="dimmed">
                {'=>'}
              </Text>
              <DraftRow
                value={axis.range?.max ?? ''}
                onCommit={(next) => commitIntent({ type: 'set-axis-range', axis: 'x', min: axis.range?.min ?? '0', max: next } satisfies XychartIntent)}
                validate={isValidXychartNumberInput}
                errorText={t('app:propertyPanel.invalidXychartNumber')}
                ariaLabel={t('app:propertyPanel.xychartMax')}
              />
            </Group>
          )}
        </>
      )}
      {!isX && (
        <Stack gap="xs">
          <Switch
            size="xs"
            label={t('app:propertyPanel.xychartYRangeToggle')}
            checked={axis.form === 'range'}
            onChange={(e) => {
              if (e.currentTarget.checked) {
                commitIntent({ type: 'set-axis-range', axis: 'y', min: axis.range?.min ?? '0', max: axis.range?.max ?? '100' } satisfies XychartIntent)
              } else {
                commitIntent({ type: 'remove-axis-range', axis: 'y' } satisfies XychartIntent)
              }
            }}
          />
          {axis.form === 'range' && (
            <Group gap="xs" align="center" wrap="nowrap">
              <DraftRow
                value={axis.range?.min ?? ''}
                onCommit={(next) => commitIntent({ type: 'set-axis-range', axis: 'y', min: next, max: axis.range?.max ?? '100' } satisfies XychartIntent)}
                validate={isValidXychartNumberInput}
                errorText={t('app:propertyPanel.invalidXychartNumber')}
                ariaLabel={t('app:propertyPanel.xychartMin')}
              />
              <Text size="sm" c="dimmed">
                {'=>'}
              </Text>
              <DraftRow
                value={axis.range?.max ?? ''}
                onCommit={(next) => commitIntent({ type: 'set-axis-range', axis: 'y', min: axis.range?.min ?? '0', max: next } satisfies XychartIntent)}
                validate={isValidXychartNumberInput}
                errorText={t('app:propertyPanel.invalidXychartNumber')}
                ariaLabel={t('app:propertyPanel.xychartMax')}
              />
            </Group>
          )}
        </Stack>
      )}
    </Stack>
  )
}

// ---------- 系列 ----------

/**
 * 系列表单（节点级元素）：名字（可清空 = 未命名）、类型切换（line↔bar）、
 * 数值行编辑（可增删；带点标签的系列锁定，只显示提示）、删除系列。
 */
export function XychartSeriesForm({ series }: { series: ProjectionXychartSeries }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(series.name ?? '', (next) => {
    const name = next.trim()
    if (name === '') {
      commitIntent({ type: 'set-series-name', elementId: series.elementId, name: null } satisfies XychartIntent)
      return
    }
    if (!isValidXychartText(name)) return
    commitIntent({ type: 'set-series-name', elementId: series.elementId, name } satisfies XychartIntent)
  })
  const invalid = nameDraft.draft.trim() !== '' && !isValidXychartText(nameDraft.draft)

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {series.elementId}
      </Text>
      <TextInput
        label={t('app:propertyPanel.xychartSeriesName')}
        value={nameDraft.draft}
        error={invalid ? t('app:propertyPanel.invalidXychartText') : undefined}
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={() => {
          if (!invalid) nameDraft.commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !invalid) nameDraft.commit()
        }}
      />
      <Group gap="xs">
        <Text size="sm" c="dimmed">
          {t('app:propertyPanel.xychartSeriesType')}
        </Text>
        <SegmentedControl
          size="xs"
          value={series.seriesType}
          data={[
            { value: 'line', label: 'line' },
            { value: 'bar', label: 'bar' },
          ]}
          onChange={(v) => {
            if (v === 'line' || v === 'bar') {
              commitIntent({
                type: 'set-series-type',
                elementId: series.elementId,
                seriesType: v,
              } satisfies XychartIntent)
            }
          }}
        />
      </Group>
      {series.editable ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {t('app:propertyPanel.xychartValues')}
          </Text>
          <ValueRows
            rows={series.values.map((v, i) => ({ key: `${i}:${v.raw}`, text: v.raw }))}
            onChange={(index, next) => {
              commitIntent({ type: 'set-series-value', elementId: series.elementId, index, value: next } satisfies XychartIntent)
            }}
            onDelete={(index) => commitIntent({ type: 'delete-series-value', elementId: series.elementId, index } satisfies XychartIntent)}
            onAdd={() => commitIntent({ type: 'add-series-value', elementId: series.elementId, value: '0' } satisfies XychartIntent)}
            canDelete={series.values.length > 1}
            addLabel={t('app:propertyPanel.xychartAddValue')}
            numberOnly
          />
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          {t('app:propertyPanel.xychartLabelsHint')}
        </Text>
      )}
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-series', elementId: series.elementId } satisfies XychartIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deleteXychartSeries')}
      </Button>
    </Stack>
  )
}

// ---------- 添加系列（空白右键 / 系列上 Tab 的浮层小表单） ----------

/**
 * 添加系列表单：名字可空（未命名系列），数值行从一行起步（默认 0），提交才落码。
 * 非法输入由按钮 guard 拦下——管线侧同样拒绝，双保险。
 */
export function AddXychartSeriesInlineForm({
  seriesType,
  afterElementId,
  onDone,
}: {
  seriesType: 'line' | 'bar'
  /** 落码锚点：新系列行插到该元素之后；缺省 = 文档最后一个元素 */
  afterElementId?: string
  onDone: () => void
}) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const [name, setName] = useState('')
  const [values, setValues] = useState<string[]>(['0'])
  const nameValid = name.trim() === '' || isValidXychartText(name)
  const valuesValid = values.every((v) => isValidXychartNumberInput(v.trim()))
  const valid = nameValid && valuesValid
  return (
    <Stack gap="sm">
      <TextInput
        label={t('app:propertyPanel.xychartSeriesName')}
        value={name}
        error={nameValid ? undefined : t('app:propertyPanel.invalidXychartText')}
        onChange={(e) => setName(e.currentTarget.value)}
      />
      <ValueRows
        rows={values.map((v, i) => ({ key: `${i}`, text: v }))}
        onChange={(index, next) => {
          setValues((cur) => cur.map((v, i) => (i === index ? next : v)))
        }}
        onDelete={(index) => setValues((cur) => (cur.length > 1 ? cur.filter((_, i) => i !== index) : cur))}
        onAdd={() => setValues((cur) => [...cur, '0'])}
        canDelete={values.length > 1}
        addLabel={t('app:propertyPanel.xychartAddValue')}
        numberOnly
      />
      <Group gap="xs" justify="flex-end">
        <Button
          disabled={!valid}
          onClick={() => {
            if (
              !commitIntent({
                type: 'add-series',
                seriesType,
                name: name.trim() === '' ? null : name.trim(),
                values: values.map((v) => v.trim()),
                afterElementId,
              } satisfies XychartIntent)
            ) {
              return
            }
            onDone()
          }}
        >
          {t('app:propertyPanel.add')}
        </Button>
      </Group>
    </Stack>
  )
}
