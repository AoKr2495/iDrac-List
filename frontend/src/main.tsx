import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspace } from "./api";
import { Icon, type IconName } from "./icons";
import { ApiError, type Server, type Draft } from "./types";
import standardLogo from "../../assets/logo/b1-standard.svg";
import darkLogo from "../../assets/logo/b1-dark.svg";
import compactLogo from "../../assets/logo/b1-compact.svg";
import "./style.css";
import { SortPKFs } from "./SortPKFs";

const stages = [
  "Bios Set-up",
  "Firmware update",
  "TSR",
  "Installation",
  "Validation",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function ButtonIcon({
  name,
  label,
  onClick,
  disabled = false,
  className = "",
}: {
  name: IconName;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={"icon-button " + className}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} />
    </button>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current!;
    node.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    node.addEventListener("cancel", cancel);
    return () => {
      node.removeEventListener("cancel", cancel);
      node.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      className={
        (wide ? "wide " : "") + (title === "Sort PKFs" ? "sort-modal" : "")
      }
    >
      <div className="dialog-header">
        <h2 id="modal-title">{title}</h2>
        <ButtonIcon
          name="action.cancel"
          label="Close dialog"
          onClick={onClose}
        />
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const { data, online, failure, mutate, refresh } = useWorkspace();
  const [page, setPage] = useState<"Active" | "Packing" | "History">("Active"),
    [theme, setTheme] = useState(() =>
      localStorage.getItem("idrac-theme") === "dark" ? "dark" : "light",
    );
  const [sidebar, setSidebar] = useState<"full" | "compact" | "hidden">(() =>
    innerWidth < 900 || innerHeight > innerWidth ? "hidden" : "full",
  );
  const [temporary, setTemporary] = useState<string[]>([]),
    [adding, setAdding] = useState(false),
    [pkfInput, setPkfInput] = useState(""),
    [pkfError, setPkfError] = useState("");
  const yearRef = useRef<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState<Set<string>>(new Set());
  const busyRef = useRef(new Set<string>());
  const [noteDrafts, setNoteDrafts] = useState<
    Record<string, { value: string; base: string }>
  >({});
  const [toast, setToast] = useState(""),
    [globalError, setGlobalError] = useState("");
  const [editor, setEditor] = useState<{
      row: Server;
      text: string;
      initial: string;
    } | null>(null),
    [history, setHistory] = useState<Server | null>(null),
    [confirm, setConfirm] = useState<{
      row: Server;
      action: "validation" | "packing" | "return" | "delete";
      draftKey?: string;
    } | null>(null),
    [conflict, setConflict] = useState<Server | null>(null);
  const [sortBusy, setSortBusy] = useState(false);
  const [sortDragging, setSortDragging] = useState(false);
  const [sortDraft, setSortDraft] = useState<{
    pkfs: string[];
    version: number;
  } | null>(null);
  const conflictKey = useRef<string | null>(null);
  const [popover, setPopover] = useState<string | null>(null),
    [popupPoint, setPopupPoint] = useState({ top: 0, left: 0 }),
    [menu, setMenu] = useState<string | null>(null),
    [held, setHeld] = useState<Record<string, Server>>({}),
    [leaving, setLeaving] = useState<Record<string, string>>({});
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("idrac-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  const dirty =
    Object.values(drafts).some((d) => d.value !== d.base) ||
    Object.values(noteDrafts).some((d) => d.value !== d.base) ||
    (!!editor && editor.text !== editor.initial);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    const dismiss = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".popover-host")) {
        setPopover(null);
        setMenu(null);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopover(null);
        setMenu(null);
      }
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const date = (value: string | null) => {
    if (!value) return "—";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: data?.timezone || "Asia/Shanghai",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(value));
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
  };
  const notifyError = (e: unknown, key?: string) => {
    if (
      e instanceof ApiError &&
      ["duplicate_history", "duplicate_packing"].includes(e.code) &&
      e.record
    ) {
      conflictKey.current = key || null;
      setConflict(e.record);
    }
    const message = e instanceof Error ? e.message : "操作失败";
    if (key) setErrors((prev) => ({ ...prev, [key]: message }));
    else setGlobalError(message);
    if (
      e instanceof ApiError &&
      ["stale_lifecycle", "completed", "deleted", "already_active"].includes(
        e.code,
      )
    )
      void refresh();
  };
  async function perform(key: string, job: () => Promise<void>) {
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setBusy(new Set(busyRef.current));
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      await job();
    } catch (e) {
      notifyError(e, key);
    } finally {
      busyRef.current.delete(key);
      setBusy(new Set(busyRef.current));
    }
  }
  const write = (row: Server, action: string, extra: Record<string, unknown>) =>
    mutate(`/servers/${row.id}/${action}`, {
      generation: row.generation,
      ...extra,
    });
  const forget = (key: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const updateDraft = (key: string, value: string, pkf: string, row?: Server) =>
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        value,
        base: prev[key]?.base ?? row?.sn ?? "",
        generation: prev[key]?.generation ?? row?.generation ?? 0,
        pkf,
      },
    }));
  const saveSN = (key: string, pkf: string, row?: Server) => {
    const draft = drafts[key];
    if (!draft || draft.value === draft.base) return;
    if (!draft.value.trim()) {
      if (row) setErrors((prev) => ({ ...prev, [key]: "SN 不得为空" }));
      return;
    }
    void perform(key, async () => {
      await (row
        ? mutate(`/servers/${row.id}/edit`, {
            generation: draft.generation,
            changes: { sn: draft.value },
          })
        : mutate("/servers", { pkf, sn: draft.value }));
      forget(key);
      setTemporary((prev) => prev.filter((k) => k !== pkf));
    });
  };
  const closeEditor = () => {
    if (busy.has("status")) return;
    if (
      editor &&
      editor.text !== editor.initial &&
      !window.confirm("放弃尚未保存的 Status 修改？")
    )
      return;
    setEditor(null);
  };
  function navigate(next: "Active" | "Packing" | "History") {
    if (
      editor &&
      editor.text !== editor.initial &&
      !window.confirm("放弃尚未保存的 Status 修改？")
    )
      return;
    setEditor(null);
    setPage(next);
    setPopover(null);
    setMenu(null);
  }
  async function addPKF() {
    setPkfError("");
    try {
      if (!online) throw Error("当前离线，无法添加");
      const maximum =
        data?.servers.reduce(
          (max, p) => Math.max(max, Number(p.pkf.slice(3, 5))),
          -1,
        ) ?? -1;
      const configuredYear = Number(
        data?.pkf_default_prefix?.slice(3, 5) ?? 26,
      );
      const year = yearRef.current ?? Math.max(configuredYear, maximum);
      const r = await fetch(
        `/api/pkf/normalize?value=${encodeURIComponent(pkfInput)}&year=${year}`,
      );
      const body = await r.json();
      if (!r.ok) throw Error(body.message || "无效 PKF");
      const pkf = body.pkf as string;
      if (/GR/i.test(pkfInput)) yearRef.current = Number(pkf.slice(3, 5));
      if (
        !data?.servers.some(
          (row) => row.pkf === pkf && row.lifecycle === "Active",
        )
      )
        setTemporary((prev) => (prev.includes(pkf) ? prev : [...prev, pkf]));
      setPage("Active");
      setAdding(false);
      setPkfInput("");
      setTimeout(
        () =>
          document
            .getElementById(pkf)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        50,
      );
    } catch (e) {
      setPkfError(e instanceof Error ? e.message : "创建失败");
    }
  }
  useEffect(() => {
    if (!data) return;
    setTemporary((prev) => {
      const next = prev.filter(
        (pkf) =>
          !data.servers.some(
            (row) => row.pkf === pkf && row.lifecycle === "Active",
          ),
      );
      return next.length === prev.length ? prev : next;
    });
  }, [data]);
  const savedNote = (pkf: string) =>
    data?.pkfs.find((group) => group.pkf === pkf)?.note ?? "";
  const saveNote = (pkf: string) => {
    const draft = noteDrafts[pkf];
    if (!draft) return;
    if (draft.value.trim() === savedNote(pkf)) {
      setNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[pkf];
        return next;
      });
      return;
    }
    const value = draft.value;
    void perform("note:" + pkf, async () => {
      await mutate(`/pkfs/${pkf}/note`, { text: value });
      // Do not discard text typed after this particular request began.
      setNoteDrafts((prev) => {
        if (prev[pkf]?.value !== value) return prev;
        const next = { ...prev };
        delete next[pkf];
        return next;
      });
    });
  };
  const allActive = [
    ...(data?.servers.filter((s) => s.lifecycle === "Active") || []),
  ];
  for (const row of Object.values(held))
    if (!allActive.some((s) => s.id === row.id)) allActive.push(row);
  const rows =
    page === "Active"
      ? allActive
      : data?.servers.filter((s) => s.lifecycle === page) || [];
  const pkfs = Array.from(
    new Set([
      ...rows.map((r) => r.pkf),
      ...(page === "Active" ? temporary : []),
    ]),
  );
  pkfs.sort((a, b) =>
    page !== "Active"
      ? b.localeCompare(a)
      : (data?.active_order.indexOf(a) ?? -1) < 0
        ? (data?.active_order.indexOf(b) ?? -1) < 0
          ? temporary.indexOf(a) - temporary.indexOf(b)
          : 1
        : (data?.active_order.indexOf(b) ?? -1) < 0
          ? -1
          : data!.active_order.indexOf(a) - data!.active_order.indexOf(b),
  );
  const orphaned = Object.entries(drafts).filter(
    ([id, d]) =>
      !id.startsWith("new:") &&
      !data?.servers.some(
        (r) =>
          r.id === id &&
          r.lifecycle === "Active" &&
          r.generation === d.generation,
      ),
  );
  const validationReminders =
    confirm?.action === "validation"
      ? [
          ...(data?.validation_reminders?.default ?? []),
          ...(data?.validation_reminders?.by_model_os[
            confirm.row.model ?? ""
          ]?.[confirm.row.os ?? ""] ?? []),
        ].filter((line) => line.trim())
      : [];
  async function doConfirm() {
    if (!confirm) return;
    const { row, action, draftKey } = confirm;
    await perform("confirm", async () => {
      if (action === "validation")
        setHeld((prev) => ({ ...prev, [row.id]: row }));
      try {
        const result = await write(
          row,
          action === "validation" ? "progress" : action,
          {
            confirmed: true,
            ...(action === "validation" ? { stage: 4, state: "Success" } : {}),
          },
        );
        if (action === "validation") {
          setHeld((prev) => ({
            ...prev,
            [row.id]: { ...row, stage: 4, progress_state: "Success" },
          }));
          setLeaving((prev) => ({ ...prev, [row.id]: "highlight" }));
          setConfirm(null);
          await sleep(
            matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400,
          );
          setLeaving((prev) => ({ ...prev, [row.id]: "removing" }));
          await sleep(
            matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
          );
          setHeld((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          setLeaving((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
        } else setConfirm(null);
        setToast(
          action === "validation"
            ? "Validation 完成 · 已移入 Packing"
            : action === "packing"
              ? "Packing 完成 · 已移入 History"
              : action === "return"
                ? "已返回 Active"
                : "Server 已删除，审计已保留",
        );
        if (action === "return" && result.record) {
          if (draftKey) forget(draftKey);
          setPage("Active");
        }
      } catch (e) {
        setHeld((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        throw e;
      }
    });
  }
  function progress(row: Server) {
    return (
      <div className="popover-host progress-host">
        <button
          className="progress-button"
          aria-label={`Progress ${row.sn}`}
          disabled={!online || busy.has(row.id)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setPopupPoint({
              top: Math.max(8, Math.min(rect.bottom + 4, innerHeight - 250)),
              left: Math.max(8, Math.min(rect.left, innerWidth - 356)),
            });
            setPopover(popover === row.id ? null : row.id);
          }}
        >
          <span
            className={
              "progress-caption " + (row.stage === -1 ? "not-started" : "")
            }
            style={
              row.stage >= 0
                ? {
                    color: `var(--${row.progress_state === "Success" ? "success" : row.progress_state === "Fail" ? "fail" : "ing"})`,
                  }
                : undefined
            }
          >
            {row.stage < 0
              ? "Not Started"
              : `${stages[row.stage]} · ${row.progress_state}`}
          </span>
          <span className="progress-track">
            {stages.map((_, i) => (
              <span
                key={i}
                style={{
                  background:
                    i < row.stage
                      ? "var(--success)"
                      : i === row.stage
                        ? `var(--${row.progress_state === "Success" ? "success" : row.progress_state === "Fail" ? "fail" : "ing"})`
                        : "var(--empty-progress)",
                }}
              />
            ))}
          </span>
        </button>
        {popover === row.id && (
          <div
            className="popover progress-options"
            style={popupPoint}
            role="menu"
            aria-label="Progress options"
          >
            {stages.map((stage, i) => (
              <div key={stage}>
                <span>{stage}</span>
                <div>
                  {(i === 4 ? ["Success"] : ["ing", "Success", "Fail"]).map(
                    (state) => (
                      <button
                        key={state}
                        className={"state-option " + state.toLowerCase()}
                        onClick={() => {
                          setPopover(null);
                          if (i === 4) {
                            setErrors((prev) => ({ ...prev, confirm: "" }));
                            setConfirm({ row, action: "validation" });
                          } else
                            void perform(row.id, async () => {
                              await write(row, "progress", { stage: i, state });
                            });
                        }}
                      >
                        {state}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  function snInput(key: string, pkf: string, row?: Server) {
    const draft = drafts[key];
    const stale = row && draft && draft.generation !== row.generation;
    const remote = row && draft && draft.base !== row.sn;
    return (
      <div className="sn-editor">
        <input
          aria-label={row ? `SN ${row.sn}` : `Add Server ${pkf}`}
          disabled={!online || busy.has(key) || !!stale}
          placeholder="+ Add Server"
          value={draft?.value ?? row?.sn ?? ""}
          onChange={(e) => updateDraft(key, e.target.value, pkf, row)}
          onBlur={() => saveSN(key, pkf, row)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveSN(key, pkf, row);
            }
            if (e.key === "Escape") forget(key);
          }}
        />
        {draft && draft.value !== draft.base && (
          <small className="draft-label">
            {remote ? "远端值已更新，当前输入尚未保存" : "未提交"}
          </small>
        )}
        {errors[key] && <small className="error">{errors[key]}</small>}
      </div>
    );
  }
  return (
    <div className={"app sidebar-" + sidebar}>
      <aside>
        <div className="brand">
          <img
            alt="iDrac-List iD"
            src={
              sidebar === "compact"
                ? compactLogo
                : theme === "dark"
                  ? darkLogo
                  : standardLogo
            }
          />
          {sidebar === "full" && (
            <>
              <strong>iDrac-List</strong>
              <span className="version">V1</span>
            </>
          )}
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {(["Active", "Packing", "History"] as const).map((p) => (
            <button
              key={p}
              title={p}
              aria-label={p}
              className={page === p ? "selected" : ""}
              onClick={() => navigate(p)}
            >
              <Icon
                name={
                  p === "Active"
                    ? "navigation.active"
                    : p === "Packing"
                      ? "navigation.packing"
                      : "navigation.history"
                }
                size={20}
              />
              {sidebar === "full" && (
                <>
                  <span>{p}</span>
                  <span className="nav-count">
                    {data?.servers.filter((r) => r.lifecycle === p).length || 0}
                  </span>
                </>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <Icon name={theme === "light" ? "theme.dark" : "theme.light"} />
            {sidebar === "full" && (
              <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
            )}
          </button>
          <div className="sidebar-controls">
            <ButtonIcon
              name="sidebar.toggle"
              label="Toggle sidebar"
              onClick={() =>
                setSidebar(sidebar === "full" ? "compact" : "full")
              }
            />
            <ButtonIcon
              name="sidebar.hide"
              label="Hide sidebar"
              onClick={() => setSidebar("hidden")}
            />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            {sidebar === "hidden" && (
              <ButtonIcon
                name="sidebar.open"
                label="Open sidebar"
                onClick={() => setSidebar("full")}
              />
            )}
            <span className="breadcrumb">
              Workspace <span>/</span> <strong>{page}</strong>
            </span>
          </div>
          <span className={"connection " + (online ? "online" : "offline")}>
            <Icon
              name={online ? "connection.online" : "connection.offline"}
              size={16}
            />
            {online ? "Live · NAS" : "Offline · 只读"}
          </span>
        </header>
        {!online && (
          <div className="offline-banner" role="status">
            <Icon name="connection.offline" size={16} />
            {data
              ? "连接断开，当前数据可查看，恢复连接后自动同步。"
              : "正在连接工作区…"}
            {failure && <span>{failure}</span>}
          </div>
        )}
        <section className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">SERVER OPERATIONS</div>
              <h1>
                {page}
                <span className="heading-count">{rows.length}</span>
              </h1>
              <p>
                {page === "Active"
                  ? "每一个阶段，清晰可见。"
                  : "已完成的工作，完整保留。"}
              </p>
            </div>
            {page === "Active" && (
              <div className="page-tools">
                <button
                  className="primary"
                  disabled={!online}
                  onClick={() => setAdding(!adding)}
                >
                  <Icon name="action.add" />
                  Add PKF
                </button>
                <button
                  disabled={!online}
                  onClick={async () => {
                    try {
                      await refresh();
                      const r = await fetch("/api/pkfs/order", {
                        cache: "no-store",
                      });
                      if (!r.ok) throw Error("无法获取排序");
                      setSortDraft(await r.json());
                    } catch (e) {
                      setGlobalError(String(e));
                    }
                  }}
                >
                  <Icon name="action.sort" />
                  Sort PKFs
                </button>
              </div>
            )}
          </div>
          {adding && (
            <form
              className="add-pkf"
              onSubmit={(e) => {
                e.preventDefault();
                void addPKF();
              }}
            >
              <label htmlFor="pkf-input">PKF number</label>
              <input
                id="pkf-input"
                autoFocus
                placeholder={`468 or ${data?.pkf_default_prefix ?? "PKF26GR"}00468`}
                value={pkfInput}
                onChange={(e) => setPkfInput(e.target.value)}
                disabled={!online}
              />
              <button className="primary" disabled={!online}>
                Create
              </button>
              <button type="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
              {pkfError && <span className="error">{pkfError}</span>}
            </form>
          )}
          {globalError && (
            <div className="error-banner" role="alert">
              {globalError}
              <ButtonIcon
                name="action.cancel"
                label="Dismiss error"
                onClick={() => setGlobalError("")}
              />
            </div>
          )}
          {orphaned.length > 0 && (
            <div className="orphan-drafts">
              <strong>以下 SN 草稿未提交：原记录已删除或生命周期已变化</strong>
              {orphaned.map(([id, d]) => (
                <div key={id}>
                  <span>{d.pkf}</span>
                  <input
                    aria-label="Detached SN draft"
                    readOnly
                    value={d.value}
                  />
                  <button onClick={() => forget(id)}>Discard</button>
                </div>
              ))}
            </div>
          )}
          {Object.entries(noteDrafts)
            .filter(
              ([pkf, draft]) =>
                draft.value !== draft.base &&
                !data?.servers.some(
                  (row) => row.pkf === pkf && row.lifecycle === "Active",
                ),
            )
            .map(([pkf, draft]) => (
              <div className="orphan-drafts" key={pkf}>
                <strong>{pkf} 的备注尚未保存：该 PKF 已无 Active Server</strong>
                <div>
                  <input
                    aria-label={`Unsaved PKF note ${pkf}`}
                    readOnly
                    value={draft.value}
                  />
                  <button
                    onClick={() =>
                      setNoteDrafts((prev) => {
                        const next = { ...prev };
                        delete next[pkf];
                        return next;
                      })
                    }
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          {!pkfs.length && (
            <div className="empty">
              <div className="empty-icon">
                <Icon
                  name={
                    page === "Active"
                      ? "navigation.active"
                      : "navigation.history"
                  }
                  size={32}
                />
              </div>
              <h2>
                {page === "Active"
                  ? "Ready for the next server"
                  : page === "Packing"
                    ? "No servers awaiting packing"
                    : "No completed servers yet"}
              </h2>
              <p>
                {page === "Active"
                  ? "添加 PKF，开始管理 Server 工作进度。"
                  : page === "Packing"
                    ? "完成 Validation 后，Server 将出现在这里。"
                    : "完成 Packing 后，Server 将出现在这里。"}
              </p>
              {page === "Active" && (
                <button
                  className="primary"
                  disabled={!online}
                  onClick={() => setAdding(true)}
                >
                  <Icon name="action.add" />
                  Add your first PKF
                </button>
              )}
            </div>
          )}
          {pkfs.map((pkf, index) => {
            const group = rows
              .filter((r) => r.pkf === pkf)
              .sort(
                (a, b) =>
                  (page === "Active"
                    ? a.created_at.localeCompare(b.created_at)
                    : (page === "Packing"
                        ? b.packing_entered_at || ""
                        : b.completed_at || ""
                      ).localeCompare(
                        page === "Packing"
                          ? a.packing_entered_at || ""
                          : a.completed_at || "",
                      )) || a.id.localeCompare(b.id),
              );
            return (
              <React.Fragment key={pkf}>
                <section className="pkf-group" id={pkf}>
                  <div className="group-header">
                    <div className="group-name">
                      <span className="group-dot" />
                      <h2>{pkf}</h2>
                      <span className="group-count">
                        {group.length}{" "}
                        {group.length === 1 ? "server" : "servers"}
                      </span>
                    </div>
                    <div className="pkf-note-field">
                      <input
                        className="pkf-note-input"
                        aria-label={`PKF note ${pkf}`}
                        title={
                          page !== "Active"
                            ? savedNote(pkf)
                            : (noteDrafts[pkf]?.value ?? savedNote(pkf))
                        }
                        placeholder={
                          group.length
                            ? "填写 PKF 备注…"
                            : "添加 Server 后可填写备注"
                        }
                        value={
                          page !== "Active"
                            ? savedNote(pkf)
                            : (noteDrafts[pkf]?.value ?? savedNote(pkf))
                        }
                        readOnly={page !== "Active"}
                        disabled={
                          page === "Active" &&
                          (!online || !group.length || busy.has("note:" + pkf))
                        }
                        onChange={(e) => {
                          const value = e.target.value.replace(/[\r\n]+/g, " ");
                          setNoteDrafts((prev) => {
                            const base = prev[pkf]?.base ?? savedNote(pkf);
                            if (value === base) {
                              const next = { ...prev };
                              delete next[pkf];
                              return next;
                            }
                            return { ...prev, [pkf]: { value, base } };
                          });
                        }}
                        onBlur={() => {
                          if (page === "Active") saveNote(pkf);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && page === "Active") {
                            e.preventDefault();
                            saveNote(pkf);
                          }
                          if (e.key === "Escape")
                            setNoteDrafts((prev) => {
                              const next = { ...prev };
                              delete next[pkf];
                              return next;
                            });
                        }}
                      />
                      <span
                        className="pkf-note-indicator"
                        role={errors["note:" + pkf] ? "alert" : "status"}
                        title={
                          errors["note:" + pkf] ||
                          (noteDrafts[pkf]?.base !== undefined &&
                          noteDrafts[pkf].base !== savedNote(pkf)
                            ? "远端备注已更新，当前输入尚未保存"
                            : "")
                        }
                      >
                        {errors["note:" + pkf]
                          ? "保存失败"
                          : busy.has("note:" + pkf)
                            ? "保存中"
                            : page === "Active" &&
                                noteDrafts[pkf]?.value !== undefined &&
                                noteDrafts[pkf].value.trim() !== savedNote(pkf)
                              ? "未保存"
                              : ""}
                      </span>
                    </div>
                  </div>
                  {errors[pkf] && <p className="error">{errors[pkf]}</p>}
                  <div className="table-scroll">
                    <table>
                      <colgroup>
                        <col className="sn-col" />
                        <col className="model-col" />
                        <col className="os-col" />
                        <col className="status-col" />
                        <col className="progress-col" />
                        <col className="action-col" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>SN</th>
                          <th>Model</th>
                          <th>OS</th>
                          <th>
                            {page !== "History" ? "Status" : "Status History"}
                          </th>
                          <th>
                            {page !== "History" ? "Progress" : "Completed"}
                          </th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((row) => (
                          <tr
                            key={row.id}
                            data-server-id={row.id}
                            className={leaving[row.id] || ""}
                          >
                            <td>
                              {page === "Active" ? (
                                snInput(row.id, pkf, row)
                              ) : (
                                <span className="sn-value">{row.sn}</span>
                              )}
                            </td>
                            <td>
                              {page === "Active" ? (
                                <select
                                  aria-label={`Model ${row.sn}`}
                                  value={row.model || ""}
                                  disabled={!online || busy.has(row.id)}
                                  onChange={(e) =>
                                    void perform(row.id, async () => {
                                      await write(row, "edit", {
                                        changes: {
                                          model: e.target.value || null,
                                        },
                                      });
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {data?.models.map((m) => (
                                    <option key={m}>{m}</option>
                                  ))}
                                </select>
                              ) : (
                                row.model || "—"
                              )}
                            </td>
                            <td>
                              {page === "Active" ? (
                                <select
                                  aria-label={`OS ${row.sn}`}
                                  value={row.os || ""}
                                  disabled={!online || busy.has(row.id)}
                                  onChange={(e) =>
                                    void perform(row.id, async () => {
                                      await write(row, "edit", {
                                        changes: { os: e.target.value || null },
                                      });
                                    })
                                  }
                                >
                                  <option value="">—</option>
                                  {data?.systems.map((m) => (
                                    <option key={m}>{m}</option>
                                  ))}
                                </select>
                              ) : (
                                row.os || "—"
                              )}
                            </td>
                            <td>
                              {page !== "History" ? (
                                <div className="status-input">
                                  <button
                                    className="status-text"
                                    aria-label={`Edit Status ${row.sn}`}
                                    disabled={!online}
                                    onClick={() => {
                                      setErrors((prev) => ({
                                        ...prev,
                                        status: "",
                                      }));
                                      setEditor({
                                        row,
                                        text: row.status,
                                        initial: row.status,
                                      });
                                    }}
                                    title={row.status}
                                  >
                                    {row.status || (
                                      <span className="status-placeholder">
                                        Add a status…
                                      </span>
                                    )}
                                  </button>
                                  <ButtonIcon
                                    name="status.history"
                                    label={`Status History ${row.sn}`}
                                    onClick={() => setHistory(row)}
                                  />
                                </div>
                              ) : (
                                <ButtonIcon
                                  name="status.history"
                                  label={`Status History ${row.sn}`}
                                  onClick={() => setHistory(row)}
                                />
                              )}
                            </td>
                            <td>
                              {page === "Active" ? (
                                progress(row)
                              ) : page === "Packing" ? (
                                <button
                                  className="packing-success"
                                  disabled={!online}
                                  onClick={() => {
                                    setErrors((p) => ({ ...p, confirm: "" }));
                                    setConfirm({ row, action: "packing" });
                                  }}
                                >
                                  <Icon name="state.success" size={16} />
                                  Packing Success
                                </button>
                              ) : (
                                <span className="completed">
                                  <Icon name="state.success" size={16} />
                                  {date(row.completed_at)}
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="popover-host row-actions">
                                <ButtonIcon
                                  name="action.more"
                                  label={`Actions ${row.sn}`}
                                  disabled={!online}
                                  onClick={(e) => {
                                    const rect =
                                      e.currentTarget.getBoundingClientRect();
                                    setPopupPoint({
                                      top: Math.max(
                                        8,
                                        Math.min(
                                          rect.bottom + 4,
                                          innerHeight - 80,
                                        ),
                                      ),
                                      left: Math.max(
                                        8,
                                        Math.min(
                                          rect.right - 190,
                                          innerWidth - 206,
                                        ),
                                      ),
                                    });
                                    setMenu(menu === row.id ? null : row.id);
                                  }}
                                />
                                {menu === row.id && (
                                  <div
                                    className="popover action-menu"
                                    style={popupPoint}
                                  >
                                    <button
                                      onClick={() => {
                                        setMenu(null);
                                        setErrors((prev) => ({
                                          ...prev,
                                          confirm: "",
                                        }));
                                        setConfirm({
                                          row,
                                          action:
                                            page === "Active"
                                              ? "delete"
                                              : "return",
                                        });
                                      }}
                                    >
                                      <Icon
                                        name={
                                          page === "Active"
                                            ? "action.delete"
                                            : "action.return"
                                        }
                                      />
                                      {page === "Active"
                                        ? "Delete Server"
                                        : "Return to Active"}
                                    </button>
                                  </div>
                                )}
                              </div>
                              {errors[row.id] && (
                                <span className="sr-only" role="alert">
                                  {errors[row.id]}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {page === "Active" && (
                          <tr className="add-server">
                            <td>{snInput("new:" + pkf, pkf)}</td>
                            <td colSpan={5}>
                              {busy.has("new:" + pkf)
                                ? "Saving…"
                                : "Enter SN to add a server"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </React.Fragment>
            );
          })}
          <footer className="workspace-footer">
            <span>iDrac-List · V1</span>
            <span>
              {data
                ? `${data.servers.length} servers · NAS ${data.timezone}`
                : "Waiting for connection"}
            </span>
          </footer>
        </section>
      </main>
      {editor && (
        <Modal title="Edit Status" wide onClose={closeEditor}>
          <p className="dialog-meta">
            {editor.row.pkf}
            <span>SN · {editor.row.sn}</span>
          </p>
          <label className="field-label" htmlFor="status-editor">
            Current status
          </label>
          <input
            id="status-editor"
            autoFocus
            value={editor.text}
            disabled={busy.has("status") || !online}
            onChange={(e) =>
              setEditor({
                ...editor,
                text: e.target.value.replace(/[\r\n]+/g, " "),
              })
            }
          />
          {errors.status && (
            <p className="error" role="alert">
              {errors.status}
            </p>
          )}
          <p className="help-text">
            只有 Save 会保存；每次有效保存均保留历史记录。
          </p>
          <div className="dialog-actions">
            <button disabled={busy.has("status")} onClick={closeEditor}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={!online || busy.has("status")}
              onClick={() =>
                void perform("status", async () => {
                  await write(editor.row, "status", { text: editor.text });
                  setEditor(null);
                })
              }
            >
              {busy.has("status") ? "Saving…" : "Save"}
            </button>
          </div>
        </Modal>
      )}
      {history && (
        <Modal title="Status History" wide onClose={() => setHistory(null)}>
          <p className="dialog-meta">
            {history.pkf}
            <span>SN · {history.sn}</span>
          </p>
          <div className="timeline">
            {(
              data?.servers.find((s) => s.id === history.id)?.status_history ||
              history.status_history
            ).map((h) => (
              <div className="timeline-item" key={h.id}>
                <span className="timeline-dot" />
                <time>{date(h.saved_at)}</time>
                <p>{h.text || "—"}</p>
              </div>
            ))}
            {!history.status_history.length && (
              <p className="help-text">No status history yet.</p>
            )}
          </div>
          <div className="dialog-actions">
            <button onClick={() => setHistory(null)}>Close</button>
          </div>
        </Modal>
      )}
      {sortDraft && (
        <Modal
          title="Sort PKFs"
          wide
          onClose={() => {
            if (!sortBusy && !sortDragging) setSortDraft(null);
          }}
        >
          <SortPKFs
            onBusy={setSortBusy}
            onDragging={setSortDragging}
            initial={sortDraft.pkfs}
            version={sortDraft.version}
            remoteVersion={data?.order_version ?? sortDraft.version}
            notes={Object.fromEntries(
              (data?.pkfs || []).map((p) => [p.pkf, p.note]),
            )}
            online={online}
            close={() => setSortDraft(null)}
            save={(pkfs, base_version) =>
              mutate("/pkfs/order", { pkfs, base_version })
            }
            reload={async () => {
              const r = await fetch("/api/pkfs/order", { cache: "no-store" });
              if (!r.ok) throw Error("无法获取最新顺序");
              return r.json();
            }}
          />
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === "validation"
              ? "Confirm Validation"
              : confirm.action === "packing"
                ? "Confirm Packing Success"
                : confirm.action === "delete"
                  ? "Delete Server"
                  : "Return to Active"
          }
          onClose={() => {
            if (!busy.has("confirm")) setConfirm(null);
          }}
        >
          <p className="dialog-meta">
            {confirm.row.pkf}
            <span>SN · {confirm.row.sn}</span>
          </p>
          <p className="confirm-copy">
            {confirm.action === "validation"
              ? "请确认该 Server 的所有工作均已完成。确认后，该 Server 将从当前任务中移除并进入 Packing。"
              : confirm.action === "packing"
                ? "确认打包完成？该 Server 将进入 History，Status History 完整保留。"
                : confirm.action === "delete"
                  ? "确认删除该 Server？删除不会进入 History，完整快照和操作审计将永久保留。"
                  : "确认返工？该 Server 将回到原 PKF，Progress 重置为 Not Started，Status History 完整保留。"}
          </p>
          {validationReminders.length > 0 && (
            <section
              className="validation-reminders"
              aria-label="Validation reminders"
            >
              <strong>
                检查提醒 · {confirm.row.model || "—"} / {confirm.row.os || "—"}
              </strong>
              <ul>
                {validationReminders.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </section>
          )}
          {errors.confirm && (
            <p className="error" role="alert">
              {errors.confirm}
            </p>
          )}
          <div className="dialog-actions">
            <button
              disabled={busy.has("confirm")}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className={confirm.action === "delete" ? "danger" : "primary"}
              disabled={!online || busy.has("confirm")}
              onClick={() => void doConfirm()}
            >
              {busy.has("confirm") ? "Saving…" : "Confirm"}
            </button>
          </div>
        </Modal>
      )}
      {conflict && (
        <Modal
          title={`Server already in ${conflict.lifecycle}`}
          onClose={() => setConflict(null)}
        >
          <dl className="record-detail">
            <dt>PKF</dt>
            <dd>{conflict.pkf}</dd>
            <dt>SN</dt>
            <dd>{conflict.sn}</dd>
            <dt>Model</dt>
            <dd>{conflict.model || "—"}</dd>
            <dt>OS</dt>
            <dd>{conflict.os || "—"}</dd>
            <dt>
              {conflict.lifecycle === "Packing"
                ? "Entered Packing"
                : "Completed"}
            </dt>
            <dd>
              {date(
                conflict.lifecycle === "Packing"
                  ? conflict.packing_entered_at
                  : conflict.completed_at,
              )}
            </dd>
          </dl>
          <div className="dialog-actions">
            <button onClick={() => setConflict(null)}>Cancel</button>
            <button
              onClick={() => {
                setPage(
                  conflict.lifecycle === "Packing" ? "Packing" : "History",
                );
                setConflict(null);
                setTimeout(
                  () => document.getElementById(conflict.pkf)?.scrollIntoView(),
                  50,
                );
              }}
            >
              View {conflict.lifecycle}
            </button>
            <button
              className="primary"
              disabled={!online}
              onClick={() => {
                setErrors((prev) => ({ ...prev, confirm: "" }));
                setConfirm({
                  row: conflict,
                  action: "return",
                  draftKey: conflictKey.current || undefined,
                });
                conflictKey.current = null;
                setConflict(null);
              }}
            >
              Return to Active
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="state.success" />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
