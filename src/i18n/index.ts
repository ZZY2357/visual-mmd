import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * i18n 只配置中文 locale（spec：从第一天接入但只配中文 locale）。
 * 所有界面文案必须经过这里的字典。
 */
export const defaultNamespace = 'app'

export const zhDict = {
  app: {
    title: 'Visual MMD',
    subtitle: '可视化 Mermaid 编辑器',
    codePanel: {
      title: '代码面板',
      ariaLabel: 'Mermaid 源码编辑区',
      collapse: '折叠代码面板',
      expand: '展开代码面板',
    },
    canvas: {
      title: '画布',
      rendering: '渲染中…',
      empty: '暂无可渲染的图表',
      errorTitle: '源码存在语法错误，画布已停留在最近一次合法状态',
      emptySource: '暂无内容，请在左侧代码面板输入 Mermaid 源码',
      keyboardHint: '点击节点选中后：Delete 删除 · Tab 添加子节点 · Enter 添加同级节点',
      selectHint: '点击图中的节点可在属性面板查看其属性',
    },
    history: {
      undo: '撤销',
      redo: '重做',
    },
    propertyPanel: {
      title: '属性面板',
      ariaLabel: '结构与属性面板',
      structureTree: '结构树',
      diagram: '图表',
      nodes: '节点',
      edges: '连线',
      subgraphs: '子图',
      classDefs: '样式',
      edgeLabel: (args: { from: string; to: string }) => `${args.from} → ${args.to}`,
      unnamedSubgraph: '（未命名子图）',
      nothingSelected: '在结构树中选择一个元素，或点击画布中的节点查看属性。',
      disabledTitle: '源码存在语法错误，表单编辑已暂停',
      disabledHint: '修复语法错误后即可继续使用属性面板；画布停留在最近一次合法状态。',
      gotoError: '跳转到错误行',
      // ---- 表单通用 ----
      add: '添加',
      delete: '删除',
      apply: '应用',
      // ---- 图表表单 ----
      direction: '方向',
      // ---- 节点表单 ----
      nodeText: '显示文本',
      nodeId: '节点 ID',
      invalidId: 'ID 只能包含字母、数字、下划线、连字符（且不为 end）',
      nodeShape: '形状',
      deleteNode: '删除节点',
      // ---- 连线表单 ----
      edgeFrom: '起点',
      edgeTo: '终点',
      edgeLineStyle: '线型',
      edgeArrow: '箭头',
      edgeBidirectional: '双向连线',
      edgeLength: '长度',
      edgeLabelField: '标签',
      edgeLabelPlaceholder: '留空表示无标签',
      deleteEdge: '删除连线',
      // ---- 子图表单 ----
      subgraphTitle: '子图标题',
      deleteSubgraph: '删除子图',
      // ---- classDef 表单 ----
      classDefName: '样式名称',
      styleFill: '填充色',
      styleStroke: '边框色',
      styleDash: '边框线型',
      styleColor: '文字色',
      deleteClassDef: '删除样式项',
      // ---- 添加表单 ----
      addNodeTitle: '添加节点',
      addNodeId: '节点 ID',
      addNodeText: '显示文本',
      addEdgeTitle: '添加连线',
      addEdgeFrom: '起点节点',
      addEdgeTo: '终点节点',
      addEdgeLabel: '标签（可选）',
      addSubgraphTitle: '添加子图',
      addSubgraphLabel: '子图标题（可选）',
      addClassDefTitle: '添加样式',
      noNodeAvailable: '（暂无节点）',
    },
    shapes: {
      rectangle: '矩形',
      rounded: '圆角',
      stadium: '体育场',
      subroutine: '子程序',
      cylinder: '圆柱',
      circle: '圆',
      'double-circle': '双圆',
      asymmetric: '旗形',
      rhombus: '菱形',
      hexagon: '六边形',
      parallelogram: '平行四边形',
      'parallelogram-alt': '平行四边形（反向）',
      trapezoid: '梯形',
      'trapezoid-alt': '梯形（反向）',
    },
    linkStyles: {
      solid: '实线',
      dotted: '虚线（点）',
      thick: '粗线',
      invisible: '隐藏连线',
    },
    arrows: {
      arrow: '箭头 >',
      none: '无箭头',
      circle: '圆端 o',
      cross: '叉端 x',
    },
    borderDash: {
      solid: '实线',
      dashed: '虚线',
      dotted: '点线',
    },
    directions: {
      TB: '从上到下（TB）',
      BT: '从下到上（BT）',
      LR: '从左到右（LR）',
      RL: '从右到左（RL）',
    },
  },
} as const

let initialized = false

export function initI18n(): typeof i18next {
  if (!initialized) {
    void i18next.use(initReactI18next).init({
      lng: 'zh',
      fallbackLng: 'zh',
      defaultNS: defaultNamespace,
      resources: {
        zh: zhDict,
      },
      interpolation: {
        escapeValue: false,
      },
    })
    initialized = true
  }
  return i18next
}
