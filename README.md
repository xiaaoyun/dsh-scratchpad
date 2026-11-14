# dsh-scratchpad 便签

一个带左侧栏入口的 DSH 插件：左侧栏多一个「便签」图标，点开是应用内的便签面板，笔记存在这台机器的浏览器里。

之所以做成「便签」，是因为它刚好需要一块完整的应用内面板：列表、编辑、删除、复制、空状态、深浅色都能跑一遍，同时又是一个真的能用的小工具。想换成别的面板内容，只改 `client.js` 里的页面组件即可，入口那一套不用动。

## 能做什么

- **标签**：每条便签可以打标签（回车加、点 × 删），列表按标签筛选，标签池从现有便签里自动汇总。
- **附件**：图片和普通文件都能挂到便签上——点按钮选、直接粘贴图片、或把文件拖进正文框。图片显示缩略图（点开看原图），文件显示名字和体积。有体积上限：单个 ≤ 700 KB，每条便签 ≤ 2.5 MB（浏览器 `localStorage` 是全站共享的），超了会给提示而不是悄悄失败。
- **待办**：正文里写 `- [ ] 事情` 就是一条待办，编辑区下面会列出来，点一下打勾（勾选状态回写到正文 `- [x]`）。点「加一条待办」自动补一行。
- **导入 / 导出**：整份便签导出成 JSON（带版本号和导出时间），导入时按 id 合并，不会覆盖掉别人的条目。
- **复制 / 删除**：复制正文（有标题就带上标题），删除要二次确认。
- 全部存在这台机器的浏览器 `localStorage` 里（`dsh-scratchpad:notes:v1`），不上传；旧版本存的便签会在读取时自动补齐 `tags` / `attachments` 字段。

## 结构

```
dsh-scratchpad/
├─ package.json        声明 dsh.bundle.patch 与 dsh.client（浏览器半）
├─ cordis.patch.yml    插入一条 Host 行，浏览器半才随之加载
├─ index.js            Host 半：没有 Host 服务，只有 apply()
├─ client.js           浏览器半：左侧栏图标 + 面板页面 + 样式 + 中英词典
├─ icon.svg            插件管理页里显示的图标
└─ locale/
   ├─ zh.json          meta.title / meta.description（插件管理页文案）
   └─ en.json
```

## 入口是怎么接上的

左侧栏没有专门的「入口」插槽，入口就是一块**全局面板**，由两处注册共同组成，且必须用同一个 id：

1. `sidebar.panellist`（list 插槽）—— 这里每注册一条，左侧栏就生成一行按钮；插槽 owner 负责按钮、选中态、`aria-current` 和折叠成图标栏时的尺寸（16 / 18px）。
   - `id`：面板标识，也是按钮与面板之间的对应关系；
   - `label`：这一行的文字和 tooltip，传函数可随语言切换；
   - `order`：排序，本插件用 20（官方「插件」是 0，`schedules` 是 10）；
   - 组件只画图标，收到 `{ size, active }`。
2. `main`（keyed 插槽）—— 用 `key` 等于同一个 id 注册页面组件。左侧栏点按钮时调用 `ctx.layout.selectPanel(id)`，中间栏就渲染 `main` 里这个 key 的组件；选中的是 `conversation`（或没有选中）时渲染对话。

所以左侧栏按钮不是自己画的，也不是往对话里塞的浮动元素：注册这两条，按钮和页面就都有了。

`main` 的容器是一列 flex（`flex:1`、`min-height:0`），页面自己负责标题行、滚动区域和上下留白；本插件的 `.dsh-sp-page / .dsh-sp-scroll / .dsh-sp-content` 照着官方面板（定时任务页）的尺寸写：标题 20/28、内容区 `max-width:960px`、左右 `clamp(24px,4vw,48px)`。

## 样式与文案

- 颜色只用 `--dsw-alias-*` 主题变量（另有 `--dsw-radius-*`、`--dsw-focus-ring-*`），不写死颜色，深浅色跟着宿主走；写死的 `#4D6BFE` 只出现在 `icon.svg` 这种插图里。
- 样式在 `apply` 里注入一个带 `data-plugin-css` 的 `<style>`，卸载时移除；没有单独打包 CSS，也没有 `require` 宿主任何 UI 包。
- 文案走 Client 语言服务：`ctx.locale.register('scratchpad', { zh, en })`，注册 `main` / `sidebar.panellist` 时带 `locale: 'scratchpad'`，组件里就能拿到 `t`；侧栏 `label` 用 `ctx.locale.bind('scratchpad')`，切语言时自己会重算。

## 数据

笔记存在浏览器 `localStorage` 的 `dsh-scratchpad:notes:v1` 里（只在这台机器、这个浏览器有效），不是会话数据，所以不写进 Session 日志。写入有 400ms 防抖，退出面板时会把最后一次改动刷下去。

想换成服务端存储，就把 `readNotes` / `writeNotes` 换掉，页面组件不用改。

## 安装

本目录已经是可直接安装的 bundle。在 DSH 里安装（`target` 传本目录绝对路径）：

```
plugin_manager: install_bundle
  target: C:\Users\1\Documents\deepseek-harness\default-workspace\dsh-scratchpad
```

安装后左侧栏会出现「便签」。停用或卸载时，图标、面板、样式、词典一起撤掉。

## 改造清单

- 改名/改 id：`client.js` 顶部的 `PANEL_ID`、`NS`、`id: 'dsh-scratchpad'` 三处要和 `package.json` 的包名保持一致（浏览器模块 id 等于包名）。
- 换顺序：`sidebar.panellist` 注册里的 `order`。
- 换图标：改 `ScratchpadIcon` 里的 `ICON_PATHS.note`（16 网格线稿），再改 `icon.svg`（插件管理页用）。
- 加语言：`ctx.locale.register(NS, {...})` 里加键，`resolveSlotLabel` 和 `t` 都按当前语言回退。
- 换面板内容：只改 `ScratchpadPage`，`apply` 里两处注册不动。
