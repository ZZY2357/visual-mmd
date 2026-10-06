# 纯前端 PWA，localStorage 持久化，无后端

> **状态：accepted**

产品定位为纯前端静态站点（react + mantine + vite），以 PWA 形式可安装、离线可用；图表保存在浏览器 localStorage，通过导出 .mmd/.svg/.png 文件带走数据。不建后端、不做账号云同步。

被否决的方案：File System Access API 直接读写用户本地文件夹 —— 用户从未见到该 API 被广泛使用，担心兼容性与稳定性问题；如未来验证可行可作为增量特性加入。
