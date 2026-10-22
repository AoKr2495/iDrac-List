# V1 逐项核对报告

日期：2026-10-22。本报告保留原规范核对历史。用户现已批准应用开发，本地实现与最新测试结果见 IMPLEMENTATION_REPORT.md；以下旧阶段“未实现”描述仅记录当时状态，不限制当前本地开发授权。

## 覆盖核对

| 本次需求章节 | 已补充位置与结果 |
| --- | --- |
| 1 项目与环境 | SPEC §1、开发计划：硬件/QTS、浏览器、访问、配置可改、GitHub 排除、双架构均纳入 |
| 2 页面 | SPEC §2、设计系统：两页、侧栏、竖屏、Group/Table、双主题纳入 |
| 3 PKF | SPEC §3：格式和四种简写、上下文、重复定位、三区互斥与升序、空组规则纳入 |
| 4 Server | SPEC §4：所有列/选项、字段保存、唯一约束、两类重复、History 三按钮、删除纳入 |
| 5 Status | SPEC §5：外观、单行弹窗、首次/后续空白、Cancel、正式历史、NAS 时间、只读纳入 |
| 6 Progress | SPEC §6：五阶段逐字名称、状态、跳转、五段、单层 Popover、确认原文、迁移反馈纳入 |
| 7 History | SPEC §7：双重降序、列、限制、确认返工、重置与保留、单主记录纳入 |
| 8 协作 | SPEC §8：HTTP/SSE、字段 LWW、独立保存、SN 草稿、删除/完成拒写、离线恢复、事务纳入 |
| 9 日志数据 | SPEC §9：变更非浏览、Timeline、完整 Delete 快照、月分割永久、预留字段、重启、NAS 备份纳入 |
| 10 UI 图标 | SPEC §10、设计系统、资源说明和映射：四 SVG、Registry、全部要求语义纳入 |
| 11 排除项 | SPEC §11、开发计划：逐项保留 |
| 12 工作要求 | SPEC §12、AGENTS：路径、Confirmed/Open Questions、仅文档资源、批准门槛纳入 |

## 对旧文件的纠正

旧文件“PKF 格式、阶段名、字段选项、审计范围等全部待恢复”已被本次明确规则取代，已确认内容没有删除。旧 GAP-01–12 的剩余未定义边界归并到 OQ-01–12；不再把已给出的阶段、唯一性、保存规则当作缺口。旧“没有 SVG”更新为四份用户附件已导入。保留原会话不可完整读取的来源限制，不声称恢复未给出的内容。

## 最新资源核验（替代原逐字节复制结论）

用户明确附件仅为参考，SVG 不使用文字。现正式源已移除字标、统一居中 64×64，前三版保留参考蓝渐变几何，单色版仅使用 currentColor。它们为参考派生版，不再与附件逐字节相同，不声称原会话图片精确复刻。
四份均通过 XML、画布、circle/rect/path 结构检查，无 text/image/script/foreignObject；单色版无渐变且只有一个前景色。

| 文件 | 结果 | 当前 SHA-256 |
| --- | --- | --- |
| b1-compact.svg | XML/无字标/画布检查通过 | `0d461b055e00c5d9164bf40efc688c2301c934fbcc1e451cfe657e86c6e107aa` |
| b1-dark.svg | XML/无字标/画布检查通过 | `a131596ebeb4f3e88b25bb8ab92da2fd04a50c0789c4da1767a0ed53fd79e4c4` |
| b1-monochrome.svg | XML/无字标/画布检查通过 | `38ebd35de93cb9ae7bf96f6efec9a607881fa0ce8e7ab4c54a411bc58dafe887` |
| b1-standard.svg | XML/无字标/画布检查通过 | `18827eb7a2e6f4a60b7a4239da9b983c005bc8daa15fc23f11e93895ed244cdf` |

未安装依赖，无应用测试，未宣称完成实际界面渲染验收。Lucide 名称已授权选定，实际包导出名在获准实现时核验。

## 文件清单

- SPECIFICATION.md
- AGENTS.md
- DESIGN_SYSTEM.md
- DEVELOPMENT_PLAN.md
- assets/logo/README.md
- assets/icons/LUCIDE_MAPPING.md
- assets/logo/b1-standard.svg
- assets/logo/b1-dark.svg
- assets/logo/b1-compact.svg
- assets/logo/b1-monochrome.svg
- REVIEW_REPORT.md（本报告）

## 本轮授权调整

来源：用户要求“图标只需使用图标部分，svg 中的文字部分无需使用。其余问题请你帮忙调整，我只是提供四份参考 svg”。此前 OQ-01–12 已由 SPECIFICATION.md D-01–12 逐一关闭，标为 Confirmed（用户授权代理选定），不冒充原会话恢复。

| 原问题 | 选定结果 |
| --- | --- |
| OQ-01 | 输入范围、标签年份上下文、已有最大年份和 26 回退 |
| OQ-02 | SN 去首尾空白且大小写敏感；Status 纯空白转空；删除审计不占业务键 |
| OQ-03 | 正式 PKF 保留排序偏好，空 Group 隐藏，并列按不可变 ID |
| OQ-04 | History 只读，返工清完成时间；迁移审计保留，生命周期代次拒绝旧请求 |
| OQ-05 | 标签内保护 SN 草稿，重连先拉最新数据再附有效草稿，无离线提交队列 |
| OQ-06 | 同文 Save 仍追加，操作 ID 防重；明确取消、Escape、切页规则 |
| OQ-07 | NAS 权威 UTC 时间，默认上海时区显示，匿名审计不冒充账号 |
| OQ-08 | SQLite 内业务和审计事务，日志待输出事件重试；SSE 心跳重连、请求幂等 |
| OQ-09 | 配置键/目录定义；改路径只切换，不自动迁移，新空目录须显式初始化 |
| OQ-10 | 移除字标，方形居中，严格单色，导航独立显示项目名称 |
| OQ-11 | 首次 Light，手动本地持久化，两主题保留白色 Status/黑色 Not Started；Dark 初始文字加浅底衬 |
| OQ-12 | 设计 token、密度、动画、Lucide 和错误/取消行为定稿 |

六份原文件、四份 SVG 及本报告已同步。原确认业务规则保留，Dark 颜色已按本次重申恢复白色 Status/黑色 Not Started，文字对比通过浅底衬处理。所有文件写入均在指定项目目录内。
目前无须用户裁定的规范缺口；NAS 挂载路径、UID/GID、仓库及依赖版本属于后续环境核验输入。仍待用户授权启动应用实现，不再要求逐条批准已委托调整事项。未安装依赖、实现应用、部署或推送 GitHub。


## 最新完整清单复核

对用户本次再次提供的 12 节原始需求完成复核，覆盖位置仍见首表。本轮没有新增业务行为默认值；此前用户“其余问题帮忙调整”的授权来源保留，不把代理选定值冒充原始对话原文。
发现并纠正一处明确冲突：上一版 D-11 将 Dark Status 改深底、Not Started 改浅字，与本次重申的白色输入框/黑色初始文字不一致。现规格和设计系统统一两主题白色 Status、黑色 Not Started，Dark 初始文字用浅色底衬保证可读。其他已确认规则保留。
Logo 仍执行用户更具体的“只用图标、不要 SVG 文字”指令，四版 SVG 不改回字标。无新 Open Questions；未来发现未定义事项须列入问题清单，不自动采用默认值。
复核六份文档、四份 SVG 和本报告；SVG XML/无文字/64×64 画布检查通过。未安装依赖、实现应用、部署或推送 GitHub。


## 应用开发授权与交付更新

用户已审核本报告并明确批准完整 V1 本地开发。已完成后端、前端、SSE 与本地测试；最新文件清单、测试和限制见 IMPLEMENTATION_REPORT.md。此前“仅文档”门槛已满足；仍未推送 GitHub 或部署 NAS。


## 整体验收后：两项配置维护扩展

用户已确认整体功能验收通过，并要求 PKF 默认补全与 Model–OS Validation 提醒独立维护，现已实现。

- 新增 config/pkf.json：default_prefix 默认 PKF26GR，未来改 PKF27GR；编号仍为五位补零。旧编号和明确带年份/大小写简写均兼容。配置年份与已有业务最大年份共同决定无标签上下文时的补全年份，旧 26 年数据不会覆盖新 27 配置。
- 新增 config/validation_reminders.json：通用数组和 6×3 精确映射，18 个空组合；Validation 原文之后显示提醒，无需勾选，不阻塞无 Model/OS 的完成，不增加 Checklist 数据。
- 新增 config/README.md：完整编辑例子、匹配规则、生效方式；根 config.yaml 增加 business.config_dir。Dockerfile 复制 config/，Compose 增加整个目录的只读挂载。
- 配置启动校验并加载，修改后重启服务和刷新浏览器生效，不必构建前端；缺失/格式错误明确拒绝启动。文本按普通字符串渲染，不执行脚本或 HTML。
- 同时修复长页面滚动事件过早关闭进度菜单的问题；仍可点外部或 Escape 关闭。

验证：35 项后端测试、8 项 Chromium 端到端测试全部通过；TypeScript 与生产构建通过。新增配置 UI 测试使用替换的 state 配置验证前端；后端另用真实临时配置文件验证读取、27 年补全、26 年兼容、提醒与空字段 Validation，以及非法配置和重启生效。

8088 服务已重启，业务 Server/PKF 偏好/业务版本的重启前后摘要一致；正式提醒配置仍为空，未填任何业务检查内容。测试服务/数据与正式工作区分离。没有推送 GitHub 或部署 NAS；Docker 仍不可用，挂载配置未在 Docker 中实际运行。
