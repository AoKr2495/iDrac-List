# iDrac-List 工作约束

以下工作约束均为 **Confirmed**。

## 路径与当前授权

唯一项目目录 `/Users/macpal/Workspace/projects/Qnap_iDrac/iDrac-List`。所有项目操作显式使用该目录；仅在其内及子目录创建、修改、删除。不得因会话所属目录扩大权限。用户明确提供的四个 Downloads SVG 可只读导入，不修改来源附件。
当前已获用户正式批准实现完整 V1、安装依赖、运行和测试 Mac 本地应用。尚未授权推送 GitHub 或部署 NAS；这些操作必须在本地验收后另获批准。规范和资源仍需随开发进度保持一致。

## 需求依据

SPECIFICATION.md 第 1–12 节为原始 Confirmed，第 13 节为用户明确授权代理调整后的 Confirmed 决定。用户此前授权处理 OQ-01–12，保留其授权来源；后续新发现的未定义行为列为 Open Questions，不再自行补定。用户最新明确规则优先于此前授权代理的调整。来源是用户 2026-10-22 完整补充及附件，取代此前“全部细节待恢复”的陈旧描述；原会话引用占位符不是完整原文。新规则需逐项核对并保留来源，不得删去已确认规则。未经授权的建议不得升级成 Confirmed；本轮具体设计由用户授权代理选定并留有来源。

## 开发必须保留的不变量

- 跨 Active/History 的 PKF+SN 数据库联合唯一约束；不同 PKF 可同 SN。
- 单一 Server 主记录以生命周期区分；返工不复制，保留 Status History。
- 首次空白 Save 无写入；已有历史后空白 Save 追加正式业务记录。
- 后端事务、同字段最后成功提交生效、独立 Status 保存记录；拒绝已删除行编辑和已完成行的旧 Status 保存。
- 离线只读、重连重新取 NAS 数据；保护未提交 SN，未定义边界见 Open Questions。
- 删除二次确认，不入 History，完整快照及审计永久保留；日志按月，无前端入口。
- SQLite、日志不提交 GitHub；NAS 重启恢复业务、历史、排序；注意 ARM64/x86-64。
- 手动双主题，不跟系统；不得增加 V1 排除功能。

## 资源与验收

SVG 为源文件。四份附件仅为参考，正式 SVG 只使用 iD 图形、移除文字、统一画布，单色版为 currentColor；不声称原对话图片精确复刻。Lucide 统一 Registry，按映射文档使用。
运行适当的业务、并发、恢复和浏览器测试；测试数据仅写项目内隔离测试目录，不混入默认 Data/。提交阶段报告，新增业务歧义先询问用户，不能自行改变已确认规则。

## 开发授权更新 — Confirmed

用户已审核报告并明确批准完整 V1 应用开发、依赖安装、Mac 本地运行和测试；以上旧的“仅文档”阶段限制已解除。仍禁止推送 GitHub、部署 NAS，必须在本地验收后另获批准。业务规则不变，新增需求歧义先询问用户；所有项目操作仍限本目录。

## 验收后扩展 — Confirmed

用户已确认整体业务验收通过，并批准将默认 PKF 补全与 Model–OS Validation 文字提醒独立到 config/。配置说明见 config/README.md；仅展示提示，不新增 Checklist 门槛。旧 PKF 数据不可改写，简写和大小写兼容必须保留。配置错误不得静默回退，改后重启生效。

## 仓库与离线部署交付授权 — Confirmed

用户已再次验收通过，明确授权提交到 https://github.com/AoKr2495/iDrac-List.git，并制作 NAS 部署文件/步骤。NAS 无法连接 GitHub，使用完整离线文件夹压缩包。用户已选择全新空工作区，仅复制程序和配置，不迁移 Mac 现有业务数据/审计/日志。允许源码提交及联网侧构建/验证发布包；不连接或实际修改 NAS，部署由用户按手册执行。不得上传 Data/Logs/.cache/.venv/node_modules、镜像 tar/发布 ZIP，发布产物通过 Actions artifact 交付。

## PKF 备注扩展 — Confirmed

用户要求备注框放 PKF 单号右侧、同行，不增加卡片行或高度；Active 单行失焦/Enter 保存，History 只读，返工保留。备注是共享 PKF 元数据，需事务审计、SSE 与草稿保护。旧数据库增加字段而不重建/清空数据；测试隔离于 .cache/。新功能当前按本地开发验收，不把此前发布的离线包宣称为已含新功能。

## 1.0.1 合并发布授权

用户明确要求 HTTP UUID 修复与最新 PKF 改动一同打包并 push GitHub。允许提交 main 并通过 CI 构建验证 amd64 离线包；不得直接部署或操作 NAS Data/Logs。新版包含 PKF 字段的兼容性添加，必须在更新说明明示；不得混淆为目录搬迁或清空数据。

## 1.1.0 升级规格优先级 — Confirmed

2026-10-29 用户完整升级任务及三项答复优先于旧版冲突条款：取消 Pinned/Normal/Bottom，Active 使用带独立版本的全局手动顺序；正式分组仅包含有 Active Server 的 PKF，临时空卡片不参与排序。新增 Packing，正常流程 Active→Validation Success→Packing→Packing Success→History，单一身份、唯一键和审计不变。Packing 行按进入时间倒序；最终完成时间在打包完成时设置；Status 可编辑，其他原字段和备注只读。Packing 重复冲突提供 View Packing/Cancel/Return to Active。返工重置进度，缺失的 Active 分组追加到底部。迁移/测试只用隔离数据，不运行默认 Data 的新版本，不操作 NAS。完整技术设计与升级手册见 deployment/UPGRADE_PACKING_DESIGN.md、deployment/UPDATE_1.1.0.md。
