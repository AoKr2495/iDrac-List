# iDrac-List 1.1.0 测试与变更报告

## 变更摘要

- Active全局手动排序替代三区：独立dnd-kit Modal，鼠标/触屏/键盘手柄排序，仅Save提交，Cancel/X/Esc丢弃；独立版本、全量集合校验、SSE提示与Reload、防重复和失败草稿保留。
- Active→Packing→History；Packing Status完全复用Active保存/历史规则，打包完成确认、返工重置进度，字段/身份/备注/历史/审计保留。
- Schema3事务升级，原排序初始化，Packing时间与最终完成时间分开，跨三个阶段唯一约束、generation校验、排序集合与业务变更同事务。
- 手动Light/Dark、图标Registry、局域网HTTP UUID兼容保持；NAS配置/挂载不变。

## 本地实测

2026-10-29，Mac隔离测试目录，不使用默认Data/Logs。

- 后端：50 passed。包括原业务回归、真实Schema1/2迁移、主键/外键/Status/备注/审计保留、迁移失败回滚、并发排序冲突、集合变化、无变化/幂等、业务事务失败回滚、Packing状态流转与并发迁移、日志、真实进程重启持久化。
- 浏览器：16 passed（Chromium自动化）。覆盖HTTP非安全IP且randomUUID不存在、10000个UUID、原UI/SSE/离线/草稿/主题/竖屏、鼠标/触屏/键盘排序、Cancel/Esc/X、Save、失败草稿、远端版本提示/Reload、排序不影响Packing/History、三阶段流转/返工、Packing Status和双客户端同步。
- TypeScript类型检查通过，Vite生产构建通过，git diff空白检查通过。
- 现有一条Starlette TestClient/httpx弃用警告，不影响用例；本次未改依赖栈以免扩大范围。

## Linux amd64交付门槛

最终离线包必须由对应提交的成功CI产生。CI强制执行后端测试、amd64镜像构建、原Schema2数据库升级检查、容器HTTP与Status/生命周期/审计/排序/重启测试、全部浏览器回归、network none完全断网容器健康与重启持久化，然后才导出镜像与完整ZIP。不得把未通过的源码包称为已验证离线镜像。确切提交、镜像ID、包校验和CI结果随交付文件提供。

## 修改文件清单

- 后端：backend/store.py、backend/app.py。
- 前端：frontend/src/main.tsx、SortPKFs.tsx（新增）、types.ts、icons.tsx、style.css；frontend/package.json、pnpm-lock.yaml。
- 测试：tests/test_packing_order.py（新增）、fixtures/schema_v2.sql（新增）、test_core.py、test_pkf_notes.py、test_restart.py、test_business_config.py；frontend/e2e/packing-sort.spec.ts（新增）、workspace.spec.ts。
- 构建/部署：.github/workflows/offline-release.yml、scripts/prepare_upgrade_fixture.py、scripts/container_smoke.py、VERSION、deployment/UPDATE_1.1.0.md（新增）、UPGRADE_PACKING_DESIGN.md（新增）、本报告、NAS_DEPLOYMENT.md、CHECKLIST.md。
- 规范：AGENTS.md、SPECIFICATION.md、DESIGN_SYSTEM.md、DEVELOPMENT_PLAN.md、REVIEW_REPORT.md、assets/icons/LUCIDE_MAPPING.md，明确本次已确认规格覆盖旧冲突条款。

## 风险与限制

- Schema3不支持旧镜像直接读取；回退必须恢复停机前完整数据库备份，备份之后产生的新数据不会自动合并。完整步骤见UPDATE_1.1.0.md。
- 旧客户端缓存不认识Packing，升级要求所有浏览器硬刷新。旧position API明确拒绝，防止旧页面误操作。
- 自动化使用Chromium；未在实际NAS、真实触屏硬件或独立Edge安装上验证。本机无Docker，最终镜像测试在Linux CI执行，不能混称Mac本地Docker实测。
- 未连接或操作NAS；默认Mac业务库未迁移。所有新测试数据均隔离在.cache/，未清空或迁移正式Data/Logs，业务配置未修改。
- 三项用户确认已全部纳入，没有待定业务规则。NAS部署仍由用户按手册执行。
