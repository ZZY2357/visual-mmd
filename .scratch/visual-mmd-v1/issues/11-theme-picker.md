# 11 — 主题选择器

**What to build:** 五种 mermaid 主题（default/neutral/dark/forest/base）以选择器形式切换，写入/更新 frontmatter 配置，经管线手术式落码（不改源码其余部分）。frontmatter 已存在时只改主题项；不存在时在文首插入。用户手写的其他 frontmatter 配置项原样保留。

**Blocked by:** 04 — Flowchart 可视化编辑端到端（复用管线与表单框架）。

**Status:** ready-for-agent

- [ ] 切换主题 → frontmatter 手术式更新，画布重渲染
- [ ] 无 frontmatter 时自动插入；已有 frontmatter 时其他配置项逐字保留
- [ ] 可撤销
