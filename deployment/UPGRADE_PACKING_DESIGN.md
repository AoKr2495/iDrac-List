# Active 手动排序与 Packing 增量升级技术设计

状态：三项业务边界已由用户全部确认；增量实现进行中，默认业务数据未修改。

## 审查结论

- 本地 SQLite 文件头实际 user_version=2，当前无 WAL 文件。以只读文件头核对，未启动 Store 或迁移默认数据库。
- servers.lifecycle 受 CHECK 限定为 Active/History/Deleted，必须事务性扩展；不能仅加前端字符串。
- business_key 为排除 Deleted 的 PKF+SN 唯一索引，新增 Packing 后自然覆盖三个工作区。
- status_history 外键关联同一 Server；服务器 generation 防止跨生命周期旧请求，operations 实现请求幂等，audit/outbox 实现持久审计与月日志重放。
- SSE 广播审计 revision，客户端拉完整快照；保留此机制，排序另用独立版本避免被无关字段更新干扰。
- 当前前端排序直接使用 position 分类与编号；应移除分类、工具、样式标记，替换为后端正式顺序。现有临时空分组、草稿与完成动画需与正式顺序分离。
- 部署现有 Compose 保留 UID/GID、config.yaml、config/、Data/、Logs/挂载；镜像离线加载，不需在 NAS 联网。
- 当前未发现本机 Docker CLI。现有 GitHub Actions 可构建 Linux amd64、执行镜像内浏览器与持久化测试、导出完整 ZIP。更新相关旧生命周期测试后才能使用，不能直接沿用旧成功结论。

## 待确认业务边界

1. Packing 内同组行顺序是否按进入 Packing 时间倒序；最终 completed_at 是否在 Packing Success 时设置。
2. 唯一键冲突落在 Packing 时是否提供 View Packing/Cancel/Return to Active；Packing 备注是否与 History 一样只读。
3. 临时空分组是否排除正式排序及排序弹窗，直到首台 Server 提交成功。

以上三项用户全部采纳建议，现为Confirmed，实现依此执行。

## 数据结构方案

目标 Schema 3（源版本需运行时读取验证，拒绝未来未知版本）：

- 新增 Active 顺序表：pkf 主键／外键、唯一序位；全局版本为独立单行元数据。每个实际有 Active Server 的分组恰有一条顺序。
- 初始顺序严格按旧 Pinned/Normal/Bottom、组内编号升序；旧 position 可保留但停止参与新版排序和写操作。
- 生命周期扩展为 Active/Packing/History/Deleted，新增 packing_entered_at；最终完成时间语义等待确认。
- 迁移在一个显式事务内重建受 CHECK 约束的 servers 表，逐列复制全部字段、保留主键，重建原唯一索引并检查外键；关联的 status_history、audit、outbox、operations、deleted_snapshots 和 pkfs 不重建、不清空。
- 迁移实现需考虑 SQLite 外键与表重命名的实际行为，使用隔离旧库测试证明外键仍指向 servers，迁移失败完整回滚。版本号在所有检查成功后最后写入。
- 默认业务配置、已导出的日志、旧 History 记录保持原值。新增必要元数据不修改旧审计事件。

旧镜像只允许读取到 Schema 2，新版 Schema 3 不能直接回退给旧镜像。回退必须停新容器、恢复升级前一致性数据库备份及对应旧版本文件，再启动旧镜像；旧库恢复会丢失备份后新增业务变更，应在手册明确。

## 后端与一致性方案

沿用现有 /api/state、/api/servers/{id}/{action} 及 mutation 格式：

- 快照增加 Active 顺序及版本，包含 Packing 记录；增加独立顺序读取与保存接口。
- 排序保存提交完整 pkf 数组、基准版本与 operation_id。在 BEGIN IMMEDIATE 内先查幂等结果，再校验版本、无重复、集合完全一致，最后保存顺序与增加版本、写审计及 outbox。
- 相同顺序且版本有效：不写审计、不增加排序版本、不产生 SSE 变更。
- 创建、迁移、删除、返工均在同一业务事务中维护 Active 分组集合：首次进入追加、最后离开移除，已存在组位置不变。集合变化递增排序版本。
- 旧 position API 禁止继续改变顺序，防止缓存旧客户端调用隐性改变新排序；旧客户端不支持本次业务升级，发布要求刷新页面。
- Validation 仅 Active→Packing；新增打包完成动作仅 Packing→History；return 允许 Packing/History→Active，重置 Active 进度。同一主记录，迁移增加 generation。
- status 允许 Active/Packing，复用首次空白无写入／重复内容追加／幂等重试逻辑；跨阶段旧 generation 一律拒绝。SN/Model/OS 编辑和删除仍限定 Active。
- 所有新迁移与排序事件复用不可变 audit/outbox。涉及多个 PKF 的排序事件记录完整前后顺序及版本，server_id 为空。

## 前端方案

- Sidebar 加入 Packing；复用分组、备注展示、Status 编辑／历史、确认弹窗、行菜单、离线只读与草稿保护。
- Active 主操作区纵向排列 Add PKF 与次要 Sort PKFs，右侧对齐一致。主页面无拖拽柄和拖拽事件。
- 排序弹窗使用成熟拖拽库的指针／触屏／键盘传感器、手柄激活、垂直列表约束、滚动容器及自动滚动；标题和底部操作不随列表滚走。
- Modal 打开时取得正式顺序与版本，建立独立草稿；SSE 不改草稿，只在版本变化时提示 Reload。Reload 主动丢弃草稿并重新获取版本。
- Save 未变化或正在保存时禁用；失败保留草稿；Cancel/X/Escape 丢弃，无后端写入。拖动时 Escape 优先取消当前拖动，再次 Escape 取消 Modal，避免同一键关闭多层。
- Packing 表格 SN/Model/OS 只读，Status 复用可编辑组件，Progress 为绿色 Packing Success 操作，菜单含确认返工；没有 Active 五段条与新增行。
- Packing/History 分组按原编号倒序；Packing 行内顺序等待业务答复。Light/Dark、Lucide、HTTP UUID helper 保持一致。

## 验证与交付门槛

1. 隔离 Schema 1/2 旧库迁移到新库，保留身份、备注、历史、审计、日志、唯一索引和外键；注入迁移失败测试回滚。
2. 排序完整集合、过期版本、重试、无变化、并发保存、成员增减、返工追加、持久重启。
3. 三阶段迁移、generation 冲突、Status 全部边界、重复请求、审计及导出重放。
4. 浏览器鼠标／触屏／键盘拖动、取消／关闭／保存、失败草稿、远端提示／Reload、两客户端 SSE、主题及 HTTP IP。
5. 更新镜像旧库夹具与容器 smoke，验证 amd64、完全离线启动、原挂载／配置、重启持久化与日志。
6. 输出新镜像、完整包、SHA256、迁移说明、备份／升级验证／失败回退手册；不接触 NAS，不覆盖正式 Data/Logs。

当前进度：阶段一、二完成，三项边界Confirmed；阶段三实现已完成，阶段四/五正在验证与打包，不以旧版验收替代本次验证。
