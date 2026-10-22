# iDrac-List V1 Specification

状态：用户已审核需求报告并授权 V1 本地开发；当前实现与测试结果见 IMPLEMENTATION_REPORT.md。业务规则保持 Confirmed。
来源：用户于 2026-10-22 提供的《原始需求补充与核对指令》及四份 SVG。第 1–12 节为原需求 **Confirmed**；第 13 节为本次授权代理选定的 **Confirmed** 调整，保留来源区分。原会话只能读取引用占位符，不声称已经恢复该会话中未提供的额外细节。

## 1. 项目与环境 — Confirmed

- 名称 iDrac-List；唯一项目工作目录 `/Users/macpal/Workspace/projects/Qnap_iDrac/iDrac-List`。
- 流程：Mac 本地开发测试 → GitHub 版本管理 → QNAP NAS 正式部署。
- NAS：QNAP TES-1885U，QTS 5.1.9.2954，Xeon D-1521，64 GB RAM，x86-64；兼容 Mac ARM64 开发环境。
- React + TypeScript；Python FastAPI；SQLite；HTTP API 写入 + SSE 推送。
- Docker Compose，优先单容器；默认端口 8088。根目录 config.yaml；Data/ 存数据，Logs/ 存日志。
- 数据目录可通过 config.yaml 修改，重启后生效。SQLite 数据和运行日志不得提交 GitHub。
- 优先 Chrome / Edge，1920×1080 桌面；内网 NAS IP + 端口访问，不要求公网域名或 HTTPS。

## 2. 页面结构 — Confirmed

仅 Active（当前任务）、History（历史记录）两个主要页面。左侧 ChatGPT 风格侧边栏，顶部 B1 iD Logo 与 iDrac-List 名称；支持收缩、隐藏，竖屏用小按钮展开。不为各 PKF 建独立页面。
整体为 monday.com 风格 Group Header + Table，简洁、明亮、轻量、留白充足、动画流畅；用户手动切换 Light/Dark，不跟随系统。

## 3. PKF — Confirmed

- 标准格式示例 `PKF26GR00467`；支持 `468`、`0468`、`00468`、`26gr00468` 等简写并规范化为标准编号。简写年份参考已有 PKF 上下文，无参考时初始使用 `PKF26GR`。
- 点击 `+ Add PKF` 展开输入框，Enter 或创建按钮确认。Active 已有同 PKF 时滚动定位，不重复创建。
- 三区互斥，顺序 Pinned → Normal → Bottom，各区按年份和编号升序。再次点击置顶或沉底恢复 Normal。
- 操作图标仅悬停 PKF Header 时出现。PKF 不可直接删除；无 Active Server 时自动消失。
- 空 PKF 不持久化，刷新后不保留。

## 4. Server — Confirmed

Active 列：SN、Model、OS、Status、Progress，另有行悬停操作菜单。每个 PKF 底部有 `+ Add Server` 空行；仅 SN 非空且提交后创建正式 Server，空行刷新后消失。

| 字段 | 规则（Confirmed） |
| --- | --- |
| SN | 无固定格式，不得为空；失焦或 Enter 保存；修改时同样检查唯一性 |
| Model | R250、R260、R450、R640、R660XS、SE50；选择后立即保存 |
| OS | xDome、CTD、SRA；选择后立即保存 |

Model、OS 可长期为空，不阻止 Progress 修改或 Validation。

整个系统以 PKF + SN 为唯一业务键，由数据库联合唯一约束保证；跨 Active/History 不可重复，不同 PKF 可有相同 SN。

| 冲突目标 | 行为（Confirmed） |
| --- | --- |
| Active | 拒绝保存，提示重复 |
| History | 显示 PKF、SN、Model、OS、完成时间；提供 View History、Cancel、Return to Active；不得提供 Create Anyway |

Active 行悬停 `···` 菜单允许删除，必须二次确认；删除不进入 History，永久保留完整删除快照及操作审计。

## 5. Status — Confirmed

- 单元格统一白色输入框外观，显示最新文本及末端 `···`；长文本单行省略，不多行显示。
- 点击文本区打开单行编辑弹窗，展示 PKF、SN、当前文本和 Save/Cancel；仅点击 Save 保存，Cancel 不保存。
- 首次无历史记录且空白 Save：仅关闭，无数据修改、无历史记录。
- 已有至少一条历史记录后，空白 Save 合法，必须追加空白历史记录。
- 每次有效 Save 保留独立 Status History。它是正式业务数据，不能仅存日志。
- Status History 保存时间倒序；每条文本及 NAS 时间，格式 `DD.MM.YYYY HH:mm`；空白显示 `—`。
- History 页面 Status 列只有 `···`，打开只读 Status History，不可编辑。

## 6. Progress — Confirmed

初始 Not Started，条为空，文本黑色。顺序固定：

| 阶段 | 可选状态 |
| --- | --- |
| 1. Bios Set-up | ing（蓝）、Success（绿）、Fail（红） |
| 2. Firmware update | ing（蓝）、Success（绿）、Fail（红） |
| 3. TSR | ing（蓝）、Success（绿）、Fail（红） |
| 4. Installation | ing（蓝）、Success（绿）、Fail（红） |
| 5. Validation | 仅 Success，必须确认 |

连续五段条，各 20%。此前阶段视为 Success，当前阶段按状态上色，之后为空；可直接选任意阶段/状态，无需顺序完成；此前曾 Fail 也在跳到后续阶段后显示 Success。单层 Popover 展示全部阶段及状态，不用多级选择。仅存当前阶段与状态，不保留独立 Progress History。

Validation 确认弹窗原文：

> 标题：Confirm Validation
>
> 请确认该 Server 的所有工作均已完成。确认后，该 Server 将从当前任务中移除并进入 History。

确认后立即迁移，记录 NAS 完成时间，显示绿色进度、短暂高亮、平滑移除动画及右下角小 Toast。按 Model/OS 区分的 Validation Checklist 不在 V1。

## 7. History — Confirmed

PKF 按年份和编号降序；同 PKF 内按 Server 完成时间降序。列为 SN、Model、OS、Status History、Completed、行操作；Status History 只有 `···`。
不显示 Progress，不允许直接删除 Server，不支持 PKF 置顶/沉底。
Return to Active 必须确认；同一条 Server 移回原 PKF 的 Active，Progress 重置 Not Started，完整保留 Status History；原 Active PKF 不存在则重新显示 Group。
Active/History 使用同一 Server 主记录，以生命周期状态区分，不复制两套数据。

## 8. 实时协作 — Confirmed

- 所有客户端 HTTP API 修改，NAS 统一保存并 SSE 广播；采用 Last Write Wins，同字段最后成功提交者生效。
- 每次有效 Status Save 独立追加记录。其他客户端更新不得丢失用户尚未提交的 SN 输入。
- Server 已被其他客户端删除：拒绝后续编辑，不得重新创建。
- Server 已入 History：拒绝旧 Status 弹窗 Save，提示 Server 已完成。
- 不做在线 Presence、编辑者提示。
- 断线显示低干扰离线状态，禁止修改，可查看已加载数据。恢复连接自动重取 NAS 最新数据覆盖旧视图，再恢复编辑。
- 所有关键变更通过后端事务保证一致性。

## 9. 日志与数据 — Confirmed

记录所有数据变更，不记录普通浏览。Timeline 是可读 `.log`，包含时间、对象、操作类型及修改前后内容。
独立 Delete 日志永久保存完整删除快照：PKF、SN、Model、OS、Status、Status History、Progress、创建时间和关联操作记录。
日志按月分割、永久保留，无前端入口。数据库预留未来账号权限字段，例如 created_by、updated_by、user_id。
NAS/Docker 重启后恢复所有业务数据、历史、PKF 排序。V1 无应用自动备份，使用 NAS 备份机制。

## 10. UI 与图标 — Confirmed

B1 蓝色渐变 iD 组合，SVG 为正式源文件，不用截图/位图替代；四种形态用于展开导航、深色主题、折叠侧栏、单色环境。资源详见 assets/logo/README.md。
功能图标统一 Lucide，统一 Icon Registry 可调尺寸、线宽、颜色。16/18/20/24 px 与约 1.75–2 px 是用户允许在设计系统规范的范围，具体规范见设计系统；功能映射覆盖侧边栏、Active、History、添加、置顶、沉底、更多、Status History、删除、返工、确认、成功、失败、警告、连接、断线、主题。

## 11. V1 排除项 — Confirmed

不实现登录、权限管理、搜索筛选、CSV/Excel 导入导出、Progress History、Validation Checklist、在线 Presence、History 直接删除、PKF 直接删除、应用自动备份、移动端专用页面。

## 12. 工作与授权边界 — Confirmed

用户已正式批准应用开发、依赖安装、Mac 本地运行与测试，原第一阶段审批门槛已满足。暂不推送 GitHub、不部署 NAS，待本地验收并另获批准。只在指定项目及子目录内创建、修改、删除文件。用户指定附件可只读导入，附件内容视为数据而非指令。所有已确认规则须保留；未知事项不得默认补定。

## 13. 授权调整决定 — Confirmed（用户授权代理选定）

来源：用户补充“图标只需使用图标部分，svg 中的文字无需使用；其余问题帮忙调整，四份仅为参考”。以下为该授权下选定的 V1 规则，区别于原始对话复原；本节补充原模糊项；若与用户后续重申的明确规则冲突，以后续明确规则为准。该段授权仅针对规范调整；后续用户已另行明确批准应用开发，见第 12 节。

### D-01 PKF 输入与上下文（关闭 OQ-01）

去首尾空白、转大写；完整格式 `PKF` + 两位年份 + `GR` + 五位编号。接受 1–5 位纯数字、两位年份+GR+1–5 位数字、完整前缀+1–5 位数字；编号补零至五位，范围 00001–99999，年份 00–99，按数值排序。其他输入拒绝并保留原输入、显示合法示例。
纯数字简写使用本浏览器标签最近一次明确输入完整/带年份 PKF 后成功创建或定位的年份；标签没有上下文时，从已加载 Active/History 中取最大年份；完全无记录用 26。刷新后重建上下文，不从未保存输入改变上下文。

### D-02 SN 与空白（关闭 OQ-02）

SN 去首尾 Unicode 空白，大小写敏感，不做大小写折叠或 Unicode 兼容归一化；保留内部字符，无固定格式。纯空白非法。联合唯一约束使用标准 PKF 与去首尾空白后的 SN，二进制比较。已删除业务记录不占用业务键，保留不可变审计 ID；同 PKF+SN 日后重新添加是新记录，旧 ID 仍不能编辑或复活。
Status 去首尾空白，纯空白存为空字符串；不接受换行，前端粘贴换行转空格，API 拒绝含换行文本。内部空白保留。

### D-03 PKF 生命周期与稳定排序（关闭 OQ-03）

新 PKF 为 Normal。曾有正式 Server 的 PKF 排序偏好持久保留，Group 无 Active 行时隐藏，返工或再添加后恢复原偏好；从未有正式 Server 的空组仅在本地临时显示，不持久化。正式 PKF 元数据保留不是空 Group 的持久显示。
Active 同组 Server 按创建时间升序、并列按不可变 ID 升序；History 完成时间降序、并列 ID 升序。PKF 三区区内年份/编号升序，History 不分三区。

### D-04 History 与返工（关闭 OQ-04）

History 全行只读，唯一修改入口为确认 Return to Active。返工清空主记录 completed_at，重置 Progress，其余业务字段和 Status History 保留。历次完成/返工的时间、前后值保留操作审计，不增设 Progress History 或额外页面。再次完成使用新 NAS 完成时间。
旧请求必须携带稳定 Server ID 与生命周期代次；完成/返工递增代次。旧弹窗即使在完成后又返工，也不得借新 Active 状态提交。生命周期校验是 LWW 的前置条件，同生命周期同字段仍采用最后成功提交生效。

### D-05 草稿、离线与并发（关闭 OQ-05）

未提交 SN 以行 ID 保存在标签内存，新增行以临时 ID 保存；普通 SSE 更新不覆盖草稿。离线停止写入、无离线提交队列。重连先拉 NAS 全量快照，仅仍 Active 且代次未变的行重新附着草稿，显式标为未提交；底层已提交值来自最新快照。
同字段已被别人更改时显示“远端值已更新，当前输入尚未保存”，手动保存按 LWW；删除/完成/代次变化时草稿脱离业务行，提供可复制文本提示，不自动保存、不复活、不复建。刷新或关闭标签不持久保留草稿，存在草稿时提示离开可能丢失。
修改请求仅发送目标字段，不用整行快照覆盖其他字段。

### D-06 Status Save 与关闭（关闭 OQ-06）

除首次空白外，每次明确点击 Save 都算有效，即使文本未变；各追加一条历史。Save 请求使用唯一操作 ID，网络重试复用该 ID，不重复追加；另一次主动 Save 使用新 ID。前端保存中禁用重复点击。
Escape 等同 Cancel；点遮罩不关闭；切页/关闭带修改的弹窗时确认放弃，取消则继续编辑；未修改可直接关闭。不自动保存草稿。SN Enter 与随后失焦共用一次提交，不双写。

### D-07 时间与身份（关闭 OQ-07）

所有时间由 NAS 后端生成，数据库以 UTC 保存，配置 timezone 默认 Asia/Shanghai，仅控制显示与日志月边界。Status/Completed 显示 `DD.MM.YYYY HH:mm`；日志为含时区偏移及毫秒的 ISO 8601。客户端不提供权威时间。
V1 无账号，user_id/created_by/updated_by 可空，不假冒用户身份；审计记录匿名 client_id、request_id 和操作 ID，client_id 只用于追踪不是认证凭据。

### D-08 事务、审计与连接（关闭 OQ-08）

业务变更、Status 记录、不可变删除快照、操作审计及待输出日志事件在同一 SQLite 事务写入；失败全部回滚。后台将已提交事件写为月度 Timeline/Delete 文件，事件 ID 可去重；重启继续输出，文件失败保留待输出事件、记录后端错误并重试，不回滚已提交业务、不丢弃快照。文件日志与 SQLite 不是跨介质原子提交，不声称同时落盘。
提交成功后广播带单调变更序号的 SSE 失效通知，客户端重新拉快照；拉取与订阅交接用序号检测遗漏。SSE 每 15 秒心跳，45 秒无消息或明确网络错误进入离线；写 API 网络失败立即只读。重连退避 1/2/4/8/16/30 秒，上限 30 秒并带少量抖动。任何断线恢复均全量拉取成功后才允许写入。
后端成功响应即业务提交成功；响应丢失复用操作 ID 重试并取原结果。所有写入进行生命周期/唯一性校验，重复完成、返工、删除不重复产生业务事件；明确返回已变更状态并刷新。

### D-09 配置、目录与迁移（关闭 OQ-09）

配置结构定为 server.host=0.0.0.0、server.port=8088、storage.data_dir=./Data、storage.logs_dir=./Logs、display.timezone=Asia/Shanghai。相对路径以 config.yaml 所在目录解析，容器中映射到宿主持久目录；当前开发授权下已生成对应配置与 Compose 文件；实际部署仍需另外批准。
数据库位于 data_dir/idrac-list.sqlite3，含审计/日志待输出数据；日志 logs_dir/Timeline/YYYY-MM.log、logs_dir/Delete/YYYY-MM.log，按显示时区分月。SQLite 辅助文件与数据库同持久目录。数据目录整体和日志目录整体均从 Git 排除，即使改路径也须排除，不能只排除默认文件名。
改 data_dir 仅切换位置，不自动复制/迁移。启动前校验配置、可写目录和既有数据库；默认 Data/ 首次可初始化，改到无数据库的新目录须显式启动参数 --initialize-empty-data 才允许初始化，避免误读为空数据。人工迁移须停服、整体复制数据目录及核验后重启，禁止在线复制正在写入的 SQLite 文件作为完整迁移。
容器非 root 运行，UID/GID 在部署时匹配 NAS 挂载目录写权限；不开放全员可写权限。使用 NAS 备份，备份/恢复前停容器确保一致性；具体 NAS 共享目录、UID/GID、GitHub 仓库属于部署输入，部署时填写，不是本阶段阻塞问题。

### D-10 Logo 与图标（关闭 OQ-10）

四份附件仅为参考；保留 iD 图形几何，移除全部文字，居中至 64×64 透明画布。标准/深色/紧凑版共用同一蓝色渐变和几何，以使用位置和尺寸区分，不为凑版本改变造型。单色版使用 currentColor，严格一个前景色。导航名称 iDrac-List 由独立 UI 文本显示，折叠时只显示图标。资源为参考派生版，不声称精确复原原会话图片。

### D-11 主题（关闭 OQ-11）

初次使用 Light；用户切换后存本浏览器 localStorage，跨刷新保留，不同步用户/设备、不跟随系统。用户本次再次明确白色 Status 输入框与黑色 Not Started，故两种主题均保留这两个字面颜色：Status 白底深色字；Dark 中 Not Started 使用浅色文字底衬以承载黑字，周围页面仍采用深色主题。此处取代上一版 Dark 将二者改为深底/浅字的适配决定。

### D-12 视觉、交互和错误（关闭 OQ-12）

具体 token、密度、动画、Icon Registry 采用 DESIGN_SYSTEM.md 与 assets/icons/LUCIDE_MAPPING.md 的授权选定值。
字段错误就地显示并保留输入；网络/后端失败保留草稿、解除保存中状态，提示失败，不用成功 Toast 冒充保存。确认弹窗 Cancel/Escape 关闭且无修改，点遮罩不确认也不关闭。Validation/删除/返工按钮提交期间禁用。冲突拒绝后展示最新状态；History 冲突中的 Return to Active 仅操作已有记录，放弃拟创建或修改的 SN，不顺带重命名其他 Server。
未确认移除前不隐藏业务行，服务器确认后才播放迁移动画；失败保持行。尊重减少动态效果偏好，缩减动画不影响业务结果。

## Open Questions

此前 OQ-01–12 已由本次用户授权代理调整关闭，详见 D-01–12。本轮未新增未确认默认值。现有授权调整继续保留，并服从用户本次重申的明确规则；当前无新增必须用户裁定的规范缺口；具体部署环境参数和依赖版本在后续授权阶段核验。该结论仅覆盖当前已提供需求，不声称恢复不可读取的原会话内容。

## 14. 验收后两项配置扩展 — Confirmed

用户已完成整体功能验收，要求默认 PKF 补全和 Model–OS Validation 提醒可独立维护。

- config/pkf.json 的 default_prefix 默认 PKF26GR，可改 PKF27GR；五位编号补零仍是格式规则，不把 00 当成前缀。原单号、显式年份、大小写简写、唯一性和排序不变。
- 数字简写仍优先使用标签明确年份上下文；无标签上下文时采用配置年份与已有业务记录最大年份两者较大值，替代 D-01 中硬编码的 26 回退。修改配置并刷新后，旧 26 年记录不会压过新配置 27 年。
- config/validation_reminders.json 使用 default 数组 + by_model_os 嵌套映射，预留全部 18 组合。通用与匹配组合提醒按顺序显示在 Confirm Validation 原确认文案之后；默认留空，不显示空区域。
- 提醒只是普通文字，不执行 HTML，也不增加勾选、门槛、记录表或 Checklist 功能。缺 Model/OS 仍可确认 Validation。原 V1 排除的 Validation Checklist 保持排除。
- 配置在启动时校验/加载，重启服务并刷新生效，无需构建前端。错误配置明确拒绝启动；根 config.yaml 保留基础设施配置，business.config_dir 指向独立配置目录。

## 15. 验收后的发布授权 — Confirmed

用户已验收 V1，授权提交 AoKr2495/iDrac-List 仓库，并提供 NAS 全离线镜像文件夹包和部署手册。用户确认 NAS 为全新空工作区，Mac 当前业务数据和审计/日志不迁移、不上传。使用已构建 linux/amd64 镜像 tar + 离线 Compose，NAS 不构建/不拉取。GitHub Actions 构建及容器验证作为发布准备；实际 NAS 部署由用户执行，未授权远程连接修改 NAS。
