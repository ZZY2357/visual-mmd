# Visual MMD

一个纯前端的 Mermaid 可视化编辑器：用户通过表单与预览交互编辑图表，无需学习 Mermaid 语法；同时通过可编辑的代码面板，在编辑过程中自然学会 Mermaid 语法。

## Language

### 图表

**图表（Diagram）**:
用户在编辑器中创建和编辑的一张图，由可视化模型描述。
_Avoid_: 文件、文档

**图表类型（Diagram Type）**:
Mermaid 支持的一类图的种类（如 flowchart、sequence）。每种图表类型拥有独立的编辑界面。v1 覆盖：flowchart、mindmap、class、sequence。
_Avoid_: 图格式

**Mermaid 源码（Mermaid Source）**:
用 Mermaid 语法描述一张图表的文本，是渲染与导出的依据。
_Avoid_: 代码（单独使用时）、脚本

### 编辑器双面板

**代码面板（Code Panel）**:
编辑器左侧的文本区，显示并允许直接编辑当前图表的 Mermaid 源码；源码是编辑器的唯一真相源。
_Avoid_: 源码视图、编辑器（单独使用时）

**画布（Canvas）**:
编辑器右侧的可视化编辑区，由表单控件与 Mermaid 实时渲染的预览组成。
_Avoid_: 预览区、画板

### 应用结构

**图表库（Library）**:
用户保存在 localStorage 中的全部图表的集合，支持新建、重命名、复制、删除。
_Avoid_: 工作区、项目

**结构树（Structure Tree）**:
属性面板上半区，以树形/列表呈现当前图表的节点、连线等元素，是可视化编辑的主要入口。
_Avoid_: 大纲

**属性面板（Property Panel）**:
画布右侧的编辑区，由结构树（上）与选中元素属性表单（下）组成。
_Avoid_: 检查器

### 模型

**投影（Projection）**:
从 Mermaid 源码解析出的只读派生视图，驱动画布预览与属性面板；一切编辑都通过修改源码表达。
_Avoid_: 可视化模型、AST（仅用于指解析器的内部产物）

**逐字保留（Verbatim Preservation）**:
不被编辑触碰的源码文本——注释、空行、格式习惯、无法解析的语法——保持逐字不变。
_Avoid_: 往返转换、透传
