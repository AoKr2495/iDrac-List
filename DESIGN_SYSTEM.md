# iDrac-List V1 Design System

状态：Confirmed；具体数值由用户授权代理于 2026-10-22 选定。业务交互以 SPECIFICATION.md 为准。

## 布局

monday.com 风格 Group Header + Table，ChatGPT 风格侧栏；仅 Active/History，保留三区和悬停操作。优先 1920×1080 Chrome/Edge。侧栏展开 240 px、折叠 64 px、隐藏 0；竖屏或视口宽度低于 900 px 时默认隐藏，用固定小按钮展开覆盖侧栏，桌面表格保留水平滚动，不另做移动页。
主区外边距 24 px，Group 间距 24 px；8 px 基础间距（细部可 4 px）。表头 40 px、数据行最小 48 px、Group Header 48 px；数据列 SN 最小 160、Model 112、OS 104、Status 280、Progress 260、行操作 40 px。History Completed 最小 160 px。窄宽保留列与横向滚动，不挤掉数据。

## 排版和颜色

字体 system-ui/-apple-system/BlinkMacSystemFont/Segoe UI/sans-serif；正文 14 px、行高 20 px；Group 标题 16/24、字重 600；页面标题 24/32、字重 600；时间与编号用等宽数字特性。无额外在线字体。

| Token | Light | Dark |
| --- | --- | --- |
| page | #F6F7FB | #111827 |
| surface | #FFFFFF | #1F2937 |
| sidebar | #EEF1F8 | #172033 |
| input | #FFFFFF | #253247 |
| text | #172B4D | #F1F5F9 |
| muted | #526078 | #B5C0D0 |
| border | #DCE2EB | #475569 |
| hover | #EDF3FF | #2B3B55 |
| focus/accent | #2563EB | #60A5FA |
| ing | #2563EB | #60A5FA |
| success | #15803D | #4ADE80 |
| fail | #DC2626 | #F87171 |
| warning | #92400E | #FBBF24 |
| empty progress | #E5EAF1 | #374151 |
| Not Started | #000000 | #000000（浅色底衬 #F1F5F9） |

Status 两主题均使用 #FFFFFF 表面、#172B4D 前景并单行省略；这是用户本次重申的白色输入框规则，优先于通用 input/text token。Not Started 两主题均黑字，Dark 给该文本浅色底衬，避免黑字直接落在深底。主题首次 Light，手动切换并在浏览器持久保留，不跟系统。颜色配合文字/图标辨识状态，后续实现需检查实际组合对比度，当前不宣称完成界面视觉验收。
输入/按钮高 32 px，圆角 6 px；弹窗圆角 12 px，最大宽 480 px，Status 弹窗可至 560 px；焦点 2 px accent 外框。表格使用细边框，无重阴影；浮层轻阴影。

## Progress 与反馈

连续五段各 20%，高 6 px，段间无间隙，整体圆角 3 px；当前阶段旁显示名称和状态。单层 Popover 展示所有合法选项。Not Started 空条；其余投影规则见规格。只在 NAS 成功确认后播迁移动画：绿色高亮 400 ms，移除 180 ms；右下 Toast 3 秒，错误可手动关闭。普通过渡 150 ms；减少动态效果时取消位移/闪烁，仍显示成功反馈。
离线顶部低干扰横幅与断线图标，保留只读内容，不只用颜色提示。悬停操作同时在键盘聚焦时可见；图标按钮至少 32×32 px 点击区域，可访问标签和 Tooltip。确认弹窗管理焦点并在关闭后归还触发处；更多交互规则见规格 D-06/D-12。

## Logo 与功能图标

Logo 仅 iD，无 SVG 字标。标准/深色/紧凑蓝渐变同几何，64×64 画布；单色 currentColor。展开时由 UI 单独显示 iDrac-List。来源用途见 assets/logo/README.md。
统一 Lucide Registry：表格 16、行菜单 18、导航 20、强调提示 24 px；默认描边 1.75 px，强调 2 px。颜色继承语义 token；映射见 assets/icons/LUCIDE_MAPPING.md。开发已获授权，已实现对应组件与 Registry；业务规则不变。

## 验收后配置提醒 — Confirmed

Confirm Validation 保留原确认文案，其后按配置显示通用与 Model–OS 专属提醒。提醒使用普通列表、hover 表面、边框及 8 px 圆角；无有效内容时隐藏。无需勾选，不增加 Validation 门槛。独立配置格式见 config/README.md。
