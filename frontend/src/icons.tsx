import {
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  ListTodo,
  Archive,
  Plus,
  Pin,
  PinOff,
  ArrowDownToLine,
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
  "sidebar.toggle": PanelLeft,
  "sidebar.hide": PanelLeftClose,
  "sidebar.open": PanelLeftOpen,
  "navigation.active": ListTodo,
  "navigation.history": Archive,
  "action.add": Plus,
  "pkf.pin": Pin,
  "pkf.unpin": PinOff,
  "pkf.bottom": ArrowDownToLine,
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
