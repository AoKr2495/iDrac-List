# Lucide Icon Registry 映射

## Confirmed

Lucide 为统一功能图标库；统一 Icon Registry 支持全局尺寸、线宽、颜色。下表覆盖用户要求的语义，具体名称由本次用户授权代理选定，为 **Confirmed（授权调整）**；已安装 lucide-react 0.577.0（锁文件固定），映射已通过 TypeScript 编译核验。

| Registry 语义键 | 用途 | Lucide 名称（授权选定） |
| --- | --- | --- |
| sidebar.toggle | 展开/收缩 | PanelLeft |
| sidebar.hide | 隐藏侧栏 | PanelLeftClose |
| sidebar.open | 竖屏展开按钮 | PanelLeftOpen |
| navigation.active | Active | ListTodo |
| navigation.history | History | Archive |
| action.add | Add PKF / Add Server | Plus |
| pkf.pin | Pinned | Pin |
| pkf.unpin | 恢复 Normal | PinOff |
| pkf.bottom | Bottom / 再次点击恢复 Normal | ArrowDownToLine |
| action.more | 行菜单、Status 末端 | Ellipsis |
| status.history | Status History 语义；列仍仅省略号 | Ellipsis |
| action.delete | 删除 | Trash2 |
| action.return | Return to Active | RotateCcw |
| action.save | Save | Save |
| action.cancel | Cancel | X |
| action.confirm | 确认 | Check |
| state.success | Success | CircleCheck |
| state.failure | Fail | CircleX |
| state.warning | 警告 | TriangleAlert |
| connection.online | 连接 | Wifi |
| connection.offline | 断线 | WifiOff |
| theme.light | Light | Sun |
| theme.dark | Dark | Moon |

## Confirmed：Registry 规范

使用语义键集中映射组件；尺寸为表格 16、行菜单 18、导航 20、提示 24 px，默认描边 1.75 px、强调 2 px，颜色由语义 token 传入，不逐页硬编码。图标不单独决定业务状态或创造入口。仅图标按钮提供可访问名称；Status History 列按已确认规则只显示 `···`，不可擅自换成时钟。
统一 Registry 已实现在 frontend/src/icons.tsx；图标选择、尺寸与线宽按授权定稿，已通过构建检查。

## 1.1.0 映射更新

navigation.packing → Package；action.sort → ListOrdered；action.drag → GripVertical。旧pkf.pin/pkf.unpin/pkf.bottom已从Registry与UI移除，不再提供置顶/沉底入口。
