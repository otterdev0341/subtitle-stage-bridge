import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLayout, type StageLayout } from "./stage-layout";
import { isShowCommand, type ShowCommand } from "./show-controls";
import { isSourceId, sourceInfo, type SourceId } from "./sources";

export type BroadcastRole = "director" | SourceId | "translation-display" | "presenter";
export type Participant = { id: string; role: BroadcastRole; stream?: MediaStream };
export type SourceCandidate = { id: string; role: SourceId };
export type BroadcastLayout = StageLayout;
type Message = {
  action?: string;
  from?: string;
  to?: string;
  role?: BroadcastRole;
  requestId?: string;
  command?: ShowCommand;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  text?: string;
  layout?: StageLayout;
};
const isOutput = (role: BroadcastRole | undefined) =>
  role === "translation-display" || role === "presenter";
export function useBroadcastSession(
  roomId: string,
  onCommand?: (command: ShowCommand) => StageLayout,
) {
  const handler = useRef(onCommand);
  handler.current = onCommand;
  const [participants, setParticipants] = useState<Participant[]>([]),
    [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [caption, setCaption] = useState("");
  const [layout, setLayout] = useState<StageLayout | null>(null),
    [commandPending, setCommandPending] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null),
    active = useRef(false),
    self = useRef("");
  const roleRef = useRef<BroadcastRole>("director"),
    raw = useRef<MediaStream | null>(null),
    program = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>()),
    roles = useRef(new Map<string, BroadcastRole>());
  const ice = useRef(new Map<string, RTCIceCandidateInit[]>()),
    slots = useRef(new Map<SourceId, string>());
  const pendingSources = useRef(new Map<string, SourceId>()),
    lastSeen = useRef(new Map<string, number>()),
    controls = useRef(new Set<string>());
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>()),
    handled = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null),
    savedLayout = useRef<StageLayout | null>(null);
  const acceptRef = useRef<(id: string) => void>(() => {});
  const broadcast = useCallback((message: Message) => {
    if (channel.current)
      void channel.current.send({ type: "broadcast", event: "room", payload: message });
  }, []);
  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    pending.current.forEach(clearTimeout);
    pending.current.clear();
    setCommandPending(false);
    if (!active.current) return;
    broadcast({ action: "left", from: self.current, role: roleRef.current });
    active.current = false;
    peers.current.forEach((pc) => {
      pc.onconnectionstatechange = null;
      pc.close();
    });
    peers.current.clear();
    roles.current.clear();
    ice.current.clear();
    slots.current.clear();
    controls.current.clear();
    pendingSources.current.clear();
    lastSeen.current.clear();
    handled.current.clear();
    raw.current?.getTracks().forEach((t) => t.stop());
    raw.current = null;
    if (channel.current) void supabase.removeChannel(channel.current);
    channel.current = null;
    setParticipants([]);
    setCandidates([]);
    setConnected(false);
  }, [broadcast]);
  const sendLayout = useCallback(
    (next: StageLayout) => {
      savedLayout.current = next;
      broadcast({ action: "layout", from: self.current, role: roleRef.current, layout: next });
    },
    [broadcast],
  );
  const sendCaption = useCallback(
    (text: string) => {
      setCaption(text);
      broadcast({ action: "caption", from: self.current, text });
    },
    [broadcast],
  );
  const publishProgram = useCallback(
    (stream: MediaStream | null) => {
      program.current = stream;
      for (const [id, pc] of peers.current)
        if (isOutput(roles.current.get(id))) {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) void sender.replaceTrack(stream?.getVideoTracks()[0] ?? null).catch(() => {});
        }
      if (active.current && roleRef.current === "director")
        broadcast({ action: "hello", from: self.current, role: "director" });
    },
    [broadcast],
  );
  const sendCommand = useCallback(
    (command: ShowCommand) => {
      if (roleRef.current !== "translation-display") return;
      if (!active.current || !channel.current) {
        setError("ยังไม่เชื่อมต่อห้อง");
        return;
      }
      const requestId = crypto.randomUUID();
      setError("");
      setCommandPending(true);
      pending.current.set(
        requestId,
        setTimeout(() => {
          pending.current.delete(requestId);
          setCommandPending(pending.current.size > 0);
          setError("หน้าควบคุมไม่ตอบรับคำสั่ง กรุณาตรวจว่าเปิดหน้าควบคุมอยู่แล้วลองใหม่");
        }, 4000),
      );
      broadcast({
        action: "command",
        from: self.current,
        role: roleRef.current,
        command,
        requestId,
      });
    },
    [broadcast],
  );
  const acceptSource = useCallback((id: string) => acceptRef.current(id), []);
  const start = useCallback(
    async (role: BroadcastRole, stream?: MediaStream) => {
      if (active.current) return;
      active.current = true;
      self.current = crypto.randomUUID();
      roleRef.current = role;
      raw.current = stream ?? null;
      setError("");
      const ownId = self.current;
      const signal = (message: Message) => {
        if (active.current && self.current === ownId) broadcast({ from: ownId, role, ...message });
      };
      const drop = (id: string) => {
        const pc = peers.current.get(id);
        if (pc) {
          pc.onconnectionstatechange = null;
          pc.close();
        }
        peers.current.delete(id);
        roles.current.delete(id);
        ice.current.delete(id);
        controls.current.delete(id);
        pendingSources.current.delete(id);
        lastSeen.current.delete(id);
        for (const [slot, peer] of slots.current) if (peer === id) slots.current.delete(slot);
        setCandidates((list) => list.filter((p) => p.id !== id));
        setParticipants((list) => list.filter((p) => p.id !== id));
      };
      const createPeer = (id: string, remoteRole: BroadcastRole) => {
        const existing = peers.current.get(id);
        if (existing && !["failed", "closed", "disconnected"].includes(existing.connectionState))
          return existing;
        if (existing) {
          existing.onconnectionstatechange = null;
          existing.close();
        }
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        peers.current.set(id, pc);
        roles.current.set(id, remoteRole);
        if (isSourceId(role)) raw.current?.getTracks().forEach((t) => pc.addTrack(t, raw.current!));
        else if (role === "director" && isOutput(remoteRole))
          program.current?.getTracks().forEach((t) => pc.addTrack(t, program.current!));
        else pc.addTransceiver("video", { direction: "recvonly" });
        pc.onicecandidate = (e) => {
          if (e.candidate) signal({ action: "candidate", to: id, candidate: e.candidate.toJSON() });
        };
        pc.ontrack = (e) => {
          const received = e.streams[0];
          if (!received || !active.current || self.current !== ownId) return;
          setParticipants((list) => [
            ...list.filter((p) => p.id !== id),
            { id, role: remoteRole, stream: received },
          ]);
        };
        pc.onconnectionstatechange = () => {
          if (
            peers.current.get(id) === pc &&
            ["failed", "closed", "disconnected"].includes(pc.connectionState)
          )
            setParticipants((list) =>
              list.map((p) => (p.id === id ? { id: p.id, role: p.role } : p)),
            );
        };
        return pc;
      };
      const offering = new Set<string>(),
        replaced = new Set<string>();
      const offer = async (id: string, remoteRole: BroadcastRole) => {
        if (offering.has(id)) return;
        offering.add(id);
        try {
          const pc = createPeer(id, remoteRole);
          if (pc.signalingState !== "stable" || pc.localDescription) return;
          const sdp = await pc.createOffer();
          if (!active.current || self.current !== ownId || peers.current.get(id) !== pc) return;
          await pc.setLocalDescription(sdp);
          signal({ action: "offer", to: id, sdp });
        } catch {
          const pc = peers.current.get(id);
          if (pc) {
            pc.onconnectionstatechange = null;
            pc.close();
            peers.current.delete(id);
          }
          setError("เชื่อมต่อภาพไม่สำเร็จ ระบบจะลองเชื่อมต่อใหม่");
        } finally {
          offering.delete(id);
        }
      };
      const admit = (id: string, source: SourceId) => {
        replaced.delete(id);
        slots.current.set(source, id);
        pendingSources.current.delete(id);
        setCandidates((list) => list.filter((p) => p.id !== id));
        setParticipants((list) =>
          list.some((p) => p.id === id) ? list : [...list, { id, role: source }],
        );
        signal({ action: "source-accepted", to: id });
        void offer(id, source);
      };
      acceptRef.current = (id) => {
        const source = pendingSources.current.get(id);
        if (!source) return;
        const previous = slots.current.get(source);
        if (previous && previous !== id) {
          signal({ action: "source-busy", to: previous });
          drop(previous);
          replaced.add(previous);
        }
        admit(id, source);
      };
      const roomChannel = supabase.channel(`broadcast-room-${roomId}`, {
        config: { broadcast: { self: false, ack: true } },
      });
      channel.current = roomChannel;
      roomChannel
        .on("broadcast", { event: "room" }, ({ payload }) => {
          const m = payload as Message;
          if (!active.current || self.current !== ownId || !m.action || !m.from || m.from === ownId)
            return;
          lastSeen.current.set(m.from, Date.now());
          if (m.action === "left") {
            drop(m.from);
            return;
          }
          if (m.action === "hello" && role !== "director") {
            signal({ action: "ready" });
            return;
          }
          if (m.action === "ready" && role === "director" && m.role) {
            if (isSourceId(m.role)) {
              const existing = slots.current.get(m.role);
              if (
                (!existing && !pendingSources.current.has(m.from) && !replaced.has(m.from)) ||
                existing === m.from
              )
                admit(m.from, m.role);
              else {
                pendingSources.current.set(m.from, m.role);
                setCandidates((list) =>
                  list.some((p) => p.id === m.from)
                    ? list
                    : [...list, { id: m.from!, role: m.role as SourceId }],
                );
                signal({ action: "source-busy", to: m.from });
              }
            } else if (isOutput(m.role)) {
              roles.current.set(m.from, m.role);
              if (m.role === "translation-display") controls.current.add(m.from);
              if (savedLayout.current && m.role === "translation-display")
                signal({ action: "layout", to: m.from, layout: savedLayout.current });
              if (program.current) void offer(m.from, m.role);
            }
            return;
          }
          if (
            m.action === "command" &&
            role === "director" &&
            controls.current.has(m.from) &&
            isShowCommand(m.command) &&
            m.requestId
          ) {
            if (!handled.current.has(m.requestId)) {
              if (handled.current.size >= 128)
                handled.current.delete(handled.current.values().next().value!);
              handled.current.add(m.requestId);
              const next = handler.current?.(m.command);
              if (next) {
                savedLayout.current = next;
                signal({ action: "layout", layout: next });
              }
            }
            signal({
              action: "command-ack",
              to: m.from,
              requestId: m.requestId,
              ...(savedLayout.current ? { layout: savedLayout.current } : {}),
            });
            return;
          }
          if (m.action === "layout" && role === "translation-display" && m.layout) {
            setLayout(normalizeLayout(m.layout));
            return;
          }
          if (
            m.action === "caption" &&
            role === "director" &&
            m.from === slots.current.get("translation") &&
            typeof m.text === "string"
          ) {
            setCaption(m.text.slice(0, 500));
            return;
          }
          if (m.to !== ownId) return;
          if (
            m.action === "command-ack" &&
            role === "translation-display" &&
            m.requestId &&
            pending.current.has(m.requestId)
          ) {
            if (m.layout) setLayout(normalizeLayout(m.layout));
            clearTimeout(pending.current.get(m.requestId));
            pending.current.delete(m.requestId);
            setCommandPending(pending.current.size > 0);
            return;
          }
          if (m.action === "source-busy" && isSourceId(role)) {
            for (const [id, remoteRole] of roles.current) if (remoteRole === "director") drop(id);
            setError(`ช่อง ${sourceInfo(role).letter} มีเครื่องส่งภาพอยู่แล้ว รอผู้ควบคุมเลือกใช้เครื่องนี้แทน`);
            return;
          }
          if (m.action === "source-accepted" && isSourceId(role)) {
            setError("");
            return;
          }
          if (m.action === "offer" && m.sdp && m.role === "director" && role !== "director") {
            void (async () => {
              const pc = createPeer(m.from!, "director");
              await pc.setRemoteDescription(m.sdp!);
              const queue = ice.current.get(m.from!) ?? [];
              ice.current.delete(m.from!);
              await Promise.all(queue.map((c) => pc.addIceCandidate(c)));
              const sdp = await pc.createAnswer();
              await pc.setLocalDescription(sdp);
              signal({ action: "answer", to: m.from!, sdp });
            })().catch(() => setError("รับการเชื่อมต่อไม่ได้ ระบบจะลองใหม่"));
            return;
          }
          if (m.action === "answer" && m.sdp) {
            const pc = peers.current.get(m.from);
            if (!pc || pc.signalingState !== "have-local-offer") return;
            void (async () => {
              await pc.setRemoteDescription(m.sdp!);
              const queue = ice.current.get(m.from!) ?? [];
              ice.current.delete(m.from!);
              await Promise.all(queue.map((c) => pc.addIceCandidate(c)));
            })().catch(() => setError("รับภาพไม่สำเร็จ ระบบจะลองใหม่"));
            return;
          }
          if (m.action === "candidate" && m.candidate) {
            const pc = peers.current.get(m.from);
            if (pc?.remoteDescription) void pc.addIceCandidate(m.candidate).catch(() => {});
            else {
              const queue = ice.current.get(m.from) ?? [];
              if (queue.length < 64) ice.current.set(m.from, [...queue, m.candidate]);
            }
          }
        })
        .subscribe((status) => {
          if (!active.current || self.current !== ownId) return;
          if (status === "SUBSCRIBED") {
            setConnected(true);
            setError("");
            signal({ action: role === "director" ? "hello" : "ready" });
            if (timer.current) clearInterval(timer.current);
            timer.current = setInterval(() => {
              signal({ action: role === "director" ? "hello" : "ready" });
              for (const [id, seen] of lastSeen.current) if (Date.now() - seen > 12000) drop(id);
            }, 3000);
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            setConnected(false);
            setError("สัญญาณห้องขาด กำลังรอเชื่อมต่อใหม่");
          }
        });
    },
    [roomId, broadcast],
  );
  useEffect(() => () => stop(), [stop]);
  return {
    participants,
    candidates,
    connected,
    error,
    caption,
    layout,
    commandPending,
    programStream: participants.find((p) => p.role === "director" && p.stream)?.stream ?? null,
    start,
    stop,
    sendLayout,
    sendCaption,
    sendCommand,
    publishProgram,
    acceptSource,
    clearError: () => setError(""),
  };
}
