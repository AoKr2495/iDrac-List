# iDrac-List V1 Development Plan

## 当前阶段 — Confirmed

用户已审核规范核对报告并批准完整 V1 开发及 Mac 本地运行测试。本地实现已完成，运行入口 http://localhost:8088；测试数据在 .cache/ 隔离目录，默认 Data/ 不含测试样本。GitHub 推送与 NAS 部署仍未授权。

## 阶段进度

| 阶段 | 状态 | 结果 / 下一步 |
| --- | --- | --- |
| 需求与资源核对 | 已完成 | 六份文档、四 SVG、授权调整记录；新业务歧义须先询问 |
| 基础架构与数据一致性 | 已完成 | FastAPI、SQLite 联合唯一约束、事务审计、生命周期代次、幂等与日志 outbox |
| 前端与实时协作 | 已完成 | React/TypeScript、两页、字段编辑、单层 Progress、确认流程、手动主题、Lucide、SSE 与草稿保护 |
| Mac 本地验证 | 已完成 | 25 后端测试、7 Chromium 端到端测试、类型检查与生产构建、实际进程重启持久化 |
| 用户本地验收 | 已通过 | 用户确认整体功能完全正常；追加两项配置维护需求已实现 |
| GitHub 交付 | 待另行批准 | 排除数据与日志，仓库/分支届时确定，不提前推送 |
| QNAP 部署 | 待另行批准 | Dockerfile/Compose 已备妥，Docker 不可用故未构建镜像；目标 x86-64 依赖包下载检查通过，NAS 实机尚未验收 |

## 后续验收矩阵（计划，不是已执行测试）

| 范围 | 必测场景 |
| --- | --- |
| PKF | 四种简写、上下文年份、重复滚动、三区升序与切换、空 Group 不持久化 |
| Server | 空行与提交、SN 失焦/Enter、空 Model/OS、所有选项、SN 编辑冲突、跨生命周期联合唯一 |
| History 冲突 | 明细及三按钮、无 Create Anyway、确认返工、主记录身份不变 |
| Status | 首次空白不写、后续空白追加、Cancel、倒序 NAS 时间与空白显示、只读历史、同字段并发独立记录 |
| Progress | 五阶段所有合法状态、跳阶段及前序 Fail 覆盖、Validation 确认及取消、事务迁移与完成时间、动画/Toast |
| 返工与删除 | 原 PKF 重现、Not Started、保留 Status History、确认删除、不入 History、完整永久快照 |
| 协作 | Last Write Wins、未提交 SN、删除后拒写、完成后拒旧 Status、离线只读及重连全量取新 |
| 持久化日志 | NAS/Docker 重启恢复业务/历史/排序，修改目录重启生效，月日志前后值、删除快照、无浏览日志 |
| UI 与部署 | 两页列结构/排序、侧栏收缩隐藏及竖屏、双主题不跟系统、SVG 源、Chrome/Edge、8088 内网访问 |
| 排除项 | 不引入登录、权限、搜索筛选、导入导出、额外历史、Checklist、Presence、直接删 History/PKF、应用备份、移动专页 |


## 测试证据与交付

详见 IMPLEMENTATION_REPORT.md；README.md 提供安装、启动、测试和迁移方法。当前没有新增业务规则未决项。不能将本地通过等同于 Docker 或 NAS 验收通过。

## 验收后配置维护扩展

已增加 config/pkf.json 与 config/validation_reminders.json，以及对应读取校验、前端提醒区和容器只读目录挂载。35 后端测试通过，8 项浏览器端到端测试全部通过（含新增配置 UI）。默认提醒均留空；配置改后重启并刷新生效。不推送 GitHub、不部署 NAS。

## PKF 同行备注扩展

本地实现和迁移完成：44 后端、9 浏览器测试通过，生产构建通过，8088 已运行新版。下一步用户验收 Header 同行布局；再按发布流程提交并制作新镜像包，原离线包不包含此功能。
