import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type Snapshot } from "./types";
const client = localStorage.getItem("idrac-client") || crypto.randomUUID();
localStorage.setItem("idrac-client", client);
const pending = new Map<string, string>();
export function useWorkspace() {
  const [data, setData] = useState<Snapshot | null>(null),
    [online, setOnline] = useState(false),
    [failure, setFailure] = useState("");
  const allowed = useRef(false),
    refreshRef = useRef<() => Promise<void>>(async () => {}),
    disconnectRef = useRef<() => void>(() => {});
  useEffect(() => {
    let dead = false,
      source: EventSource | null = null,
      timer: ReturnType<typeof setTimeout> | undefined,
      attempt = 0,
      last = 0,
      connected = false,
      running = false,
      dirty = false;
    const setConnection = (yes: boolean) => {
      allowed.current = yes;
      if (!dead) setOnline(yes);
    };
    async function sync() {
      dirty = true;
      if (running) return;
      running = true;
      try {
        while (dirty && !dead) {
          dirty = false;
          const r = await fetch("/api/state", {
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          });
          if (!r.ok) throw Error("无法获取最新数据");
          const next = (await r.json()) as Snapshot;
          if (dead) return;
          setData((prev) =>
            !prev || next.revision >= prev.revision ? next : prev,
          );
        }
        if (connected) {
          setConnection(true);
          setFailure("");
          attempt = 0;
        }
      } catch (e) {
        if (!dead) {
          setFailure(e instanceof Error ? e.message : "连接失败");
          disconnect();
        }
      } finally {
        running = false;
      }
    }
    function disconnect() {
      connected = false;
      setConnection(false);
      source?.close();
      clearTimeout(timer);
      if (!dead)
        timer = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** attempt++) * (0.9 + Math.random() * 0.2),
        );
    }
    function connect() {
      if (dead) return;
      source = new EventSource("/api/events");
      source.addEventListener("state", () => {
        connected = true;
        last = Date.now();
        void sync();
      });
      source.onerror = () => {
        setFailure("连接已断开");
        disconnect();
      };
    }
    disconnectRef.current = disconnect;
    refreshRef.current = sync;
    connect();
    const heartbeat = setInterval(() => {
      if (connected && Date.now() - last > 45000) disconnect();
    }, 3000);
    const down = () => disconnect();
    window.addEventListener("offline", down);
    return () => {
      dead = true;
      source?.close();
      clearTimeout(timer);
      clearInterval(heartbeat);
      window.removeEventListener("offline", down);
      allowed.current = false;
    };
  }, []);
  const mutate = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!allowed.current)
        throw new ApiError("offline", "当前离线，请连接恢复后再保存");
      const key = path + JSON.stringify(body);
      const operation = pending.get(key) || crypto.randomUUID();
      pending.set(key, operation);
      let response: Response;
      try {
        response = await fetch("/api" + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-ID": client,
            "X-Request-ID": crypto.randomUUID(),
          },
          body: JSON.stringify({ ...body, operation_id: operation }),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        disconnectRef.current();
        throw new ApiError(
          "network",
          "未确认保存结果。连接恢复后可重试，系统会防止重复保存。",
        );
      }
      const result = await response
        .json()
        .catch(() => ({
          code: "server_error",
          message: "服务暂时无法处理请求，请连接恢复后重试",
        }));
      if (!response.ok) {
        if (response.status < 500) pending.delete(key);
        else disconnectRef.current();
        throw new ApiError(
          result.code || "request_failed",
          result.message || "操作失败，请重试",
          result.record,
        );
      }
      pending.delete(key);
      await refreshRef.current();
      return result;
    },
    [],
  );
  return { data, online, failure, mutate, refresh: () => refreshRef.current() };
}
