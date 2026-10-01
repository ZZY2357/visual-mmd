import { Button, Stack, Text, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { ProjectionPacketField, PacketProjection } from '../lib/projection/packet-projection'
import { isValidPacketFieldName, type PacketIntent } from '../lib/pipeline/packet'
import { useEditorStore } from '../store/editor'
import { useDraft } from './property-forms'

/**
 * packet 属性表单集合（more-diagrams 工单 16）：全部表单值变化都映射为编辑意图，
 * 经 store.commitIntent 走管线手术式落码（独立撤销快照）。
 * 文本类输入在失焦/回车时提交，避免逐字符快照。
 *
 * 字段表单暴露 name 与位区间（start/end 绝对位）：改位区间以 start-end 绝对形态落码
 * （工单定案）；结果序列不连续（间隙/重叠/回退）时管线拒绝落码，意图被安静丢弃——
 * 与「非法编辑拒绝落码」同口径（错误在输入框即时提示，落码门是第二道防线）。
 */

function useCommit() {
  return useEditorStore((s) => s.commitIntent)
}

function clearSelection() {
  useEditorStore.getState().select(null)
}

// ---------- 图表（只读提示） ----------

export function PacketDiagramForm({ projection }: { projection: PacketProjection }) {
  const t = useTranslation().t
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t('app:propertyPanel.packetDiagramFields', { count: projection.fields.length })}
      </Text>
      <Text size="xs" c="dimmed">
        {t('app:propertyPanel.packetDiagramHint')}
      </Text>
    </Stack>
  )
}

// ---------- 字段 ----------

export function PacketFieldForm({ field }: { field: ProjectionPacketField }) {
  const t = useTranslation().t
  const commitIntent = useCommit()
  const nameDraft = useDraft(field.name, (next) => {
    commitIntent({ type: 'set-field-name', elementId: field.elementId, name: next } satisfies PacketIntent)
  })
  const startDraft = useDraft(`${field.absStart}`, (next) => {
    commitIntent({
      type: 'set-field-range',
      elementId: field.elementId,
      start: next,
      end: `${field.absEnd}`,
    } satisfies PacketIntent)
  })
  const endDraft = useDraft(`${field.absEnd}`, (next) => {
    commitIntent({
      type: 'set-field-range',
      elementId: field.elementId,
      start: `${field.absStart}`,
      end: next,
    } satisfies PacketIntent)
  })

  // 位区间以绝对形态回显（工单定案落码即绝对形态）；非法整数即时提示，
  // 提交交由管线连续性校验收口（不连续 → 拒绝落码）
  const numberValid = (value: string): boolean => /^[0-9]+$/.test(value.trim())
  const startValid = numberValid(startDraft.draft)
  const endValid = numberValid(endDraft.draft)
  const commitRange = (start: string, end: string) => {
    if (!numberValid(start) || !numberValid(end)) return
    commitIntent({
      type: 'set-field-range',
      elementId: field.elementId,
      start,
      end,
    } satisfies PacketIntent)
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {field.elementId}
      </Text>
      {!field.contiguous && (
        <Text size="xs" c="red">
          {t('app:propertyPanel.packetNotContiguous')}
        </Text>
      )}
      <TextInput
        label={t('app:propertyPanel.packetFieldName')}
        value={nameDraft.draft}
        error={
          isValidPacketFieldName(nameDraft.draft) ? undefined : t('app:propertyPanel.invalidPacketFieldName')
        }
        onChange={(e) => nameDraft.setDraft(e.currentTarget.value)}
        onBlur={nameDraft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') nameDraft.commit()
        }}
      />
      <TextInput
        label={t('app:propertyPanel.packetFieldStart')}
        value={startDraft.draft}
        error={startValid ? undefined : t('app:propertyPanel.invalidPacketBit')}
        onChange={(e) => startDraft.setDraft(e.currentTarget.value)}
        onBlur={() => commitRange(startDraft.draft, `${field.absEnd}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRange(startDraft.draft, `${field.absEnd}`)
        }}
      />
      <TextInput
        label={t('app:propertyPanel.packetFieldEnd')}
        value={endDraft.draft}
        error={endValid ? undefined : t('app:propertyPanel.invalidPacketBit')}
        onChange={(e) => endDraft.setDraft(e.currentTarget.value)}
        onBlur={() => commitRange(`${field.absStart}`, endDraft.draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitRange(`${field.absStart}`, endDraft.draft)
        }}
      />
      <Button
        variant="light"
        color="red"
        onClick={() => {
          if (commitIntent({ type: 'delete-field', elementId: field.elementId } satisfies PacketIntent)) {
            clearSelection()
          }
        }}
      >
        {t('app:propertyPanel.deletePacketField')}
      </Button>
    </Stack>
  )
}
