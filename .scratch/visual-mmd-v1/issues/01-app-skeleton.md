# 01 — 应用骨架：代码面板 + 预览最小编辑器

**What to build:** 编辑器的最小可用闭环：左侧代码面板显示并可编辑当前图表的 Mermaid 源码，右侧画布用 mermaid 实时渲染预览。输入代码画布即时更新；源码出现语法错误时画布冻结在最近一次合法状态、代码面板标红错误行。图表自动保存到 localStorage，刷新恢复。PWA 可安装、离线可用。中文界面，文案全部走 i18n 字典（只配中文 locale）。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 敲代码 → 画布实时更新（源码为王，代码面板即真相源）
- [x] 写入非法语法 → 画布停留在最近合法状态，错误行标红并显示错误信息
- [x] 修改自动保存，刷新后图表恢复
- [x] PWA：可安装、离线打开可用
- [x] 全部文案经 i18n 字典，界面为中文
- [x] 技术栈落地：React + Mantine + Vite + TypeScript，mermaid 锁定 v12
