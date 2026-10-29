import {
  Package,
  ListOrdered,
  GripVertical,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  ListTodo,
  Archive,
  Plus,
  Ellipsis,
  Trash2,
  RotateCcw,
  Save,
  X,
  Check,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  type LucideProps,
} from "lucide-react";
const registry = {
  "navigation.packing": Package,
  "action.sort": ListOrdered,
  "action.drag": GripVertical,
  "sidebar.toggle": PanelLeft,
  "sidebar.hide": PanelLeftClose,
  "sidebar.open": PanelLeftOpen,
  "navigation.active": ListTodo,
  "navigation.history": Archive,
  "action.add": Plus,
  "action.more": Ellipsis,
  "status.history": Ellipsis,
  "action.delete": Trash2,
  "action.return": RotateCcw,
  "action.save": Save,
  "action.cancel": X,
  "action.confirm": Check,
  "state.success": CircleCheck,
  "state.failure": CircleX,
  "state.warning": TriangleAlert,
  "connection.online": Wifi,
  "connection.offline": WifiOff,
  "theme.light": Sun,
  "theme.dark": Moon,
};
export type IconName = keyof typeof registry;
export function Icon({
  name,
  size = 18,
  ...props
}: LucideProps & { name: IconName }) {
  const Component = registry[name];
  return (
    <Component size={size} strokeWidth={1.75} aria-hidden="true" {...props} />
  );
}
