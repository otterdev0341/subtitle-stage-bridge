import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { roomRealtime, workerInterval } from "./realtime-room";
import { normalizeLayout, type StageLayout } from "@/lib/stage-layout";
import { isSourceId, type SourceId } from "./sources";
import { isShowCommand, type ShowCommand } from "./show-controls";

const PEER_DISCONNECT_GRACE_MS = 10_000;

export type BroadcastRole = "director" | SourceId | "translation-display";
type ParticipantRole = Exclude<BroadcastRole, "director">;
type RoomMessage = {
  action?:
    | "hello"
    | "ready"
    | "left"
    | "offer"
    | "answer"
    | "candidate"
    | "caption"
    | "stage-peers"
    | "stage-connect"
    | "layout"
    | "command"
    | "command-ack";
  command?: ShowCommand;
  requestId?: string;
  from?: string;
  to?: string;
  role?: BroadcastRole;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  text?: string;
  peers?: Array<{ id: string; role: ParticipantRole }>;
  layout?: BroadcastLayout;
  layoutSequence?: number;
};
type Participant = { id: string; role: ParticipantRole; stream?: MediaStream };
export type BroadcastLayout = StageLayout;

export function useBroadcastSession(
  roomId: string,
  onCommand?: (command: ShowCommand) => StageLayout,
) {
  const commandHandler = useRef(onCommand);
  commandHandler.current = onCommand;
  const pendingCommands = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const handledCommands = useRef(new Set<string>());
  const [commandPending, setCommandPending] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");
  const [layout, setLayout] = useState<BroadcastLayout | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const candidateQueueRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const selfIdRef = useRef("");
  const roleRef = useRef<BroadcastRole>("director");
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const handshakeTimerRef = useRef<(() => void) | null>(null);
  const remoteStationsRef = useRef(new Map<string, ParticipantRole>());
  const stageScreensRef = useRef(new Set<string>());
  const layoutRef = useRef<BroadcastLayout | null>(null);
  const layoutSequence = useRef(0);
  const receivedSequence = useRef(-1);
  const directorId = useRef("");
  const directorSeenAt = useRef(0);

  const broadcast = useCallback((message: RoomMessage) => {
    const channel = channelRef.current;
    if (channel) void channel.send({ type: "broadcast", event: "room", payload: message });
  }, []);

  const stop = useCallback(() => {
    pendingCommands.current.forEach(clearTimeout);
    pendingCommands.current.clear();
    handledCommands.current.clear();
    setCommandPending(false);
    if (!activeRef.current) return;
    activeRef.current = false;
    handshakeTimerRef.current?.();
    handshakeTimerRef.current = null;
    broadcast({ action: "left", from: selfIdRef.current, role: roleRef.current });
    for (const connection of connectionsRef.current.values()) connection.close();
    connectionsRef.current.clear();
    candidateQueueRef.current.clear();
    remoteStationsRef.current.clear();
    stageScreensRef.current.clear();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) void roomRealtime().removeChannel(channel);
    setParticipants([]);
    setConnected(false);
  }, [broadcast]);

  const sendCaption = useCallback(
    (text: string) => {
      setCaption(text);
      broadcast({ action: "caption", from: selfIdRef.current, text });
    },
    [broadcast],
  );

  const sendLayout = useCallback(
    (next: BroadcastLayout) => {
      layoutRef.current = normalizeLayout(next);
      layoutSequence.current += 1;
      broadcast({
        action: "layout",
        from: selfIdRef.current,
        layout: layoutRef.current,
        layoutSequence: layoutSequence.current,
      });
    },
    [broadcast],
  );

  const sendCommand = useCallback(
    (command: ShowCommand) => {
      if (!activeRef.current || !channelRef.current) {
        setError("ยังไม่เชื่อมต่อห้อง");
        return;
      }
      const requestId = crypto.randomUUID();
      setError("");
      setCommandPending(true);
      pendingCommands.current.set(
        requestId,
        setTimeout(() => {
          pendingCommands.current.delete(requestId);
          setCommandPending(pendingCommands.current.size > 0);
          setError("หน้าควบคุมไม่ตอบรับคำสั่ง กรุณาตรวจว่าเปิดหน้าควบคุมอยู่แล้วลองใหม่");
        }, 4000),
      );
      broadcast({
        action: "command",
        from: selfIdRef.current,
        role: roleRef.current,
        command,
        requestId,
      });
    },
    [broadcast],
  );

  const start = useCallback(
    async (role: BroadcastRole, stream?: MediaStream) => {
      if (activeRef.current) return;
      setError("");
      roleRef.current = role;
      receivedSequence.current = -1;
      directorId.current = "";
      selfIdRef.current = crypto.randomUUID();
      streamRef.current = stream ?? null;
      activeRef.current = true;

      const channel = roomRealtime().channel(`broadcast-room-${roomId}`, {
        config: { broadcast: { self: false, ack: true } },
      });
      channelRef.current = channel;

      const sendSignal = (message: RoomMessage) => {
        if (channelRef.current)
          void channel.send({ type: "broadcast", event: "room", payload: message });
      };

      const createPeer = async (remoteId: string, remoteRole: ParticipantRole) => {
        const existing = connectionsRef.current.get(remoteId);
        if (
          existing &&
          existing.connectionState !== "closed" &&
          existing.connectionState !== "failed"
        )
          return existing;
        if (existing) connectionsRef.current.delete(remoteId);
        const connection = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        connectionsRef.current.set(remoteId, connection);
        stream?.getTracks().forEach((track) => connection.addTrack(track, stream));
        if (role === "director" || role === "translation-display")
          connection.addTransceiver("video", { direction: "recvonly" });
        connection.onicecandidate = (event) => {
          if (event.candidate)
            sendSignal({
              action: "candidate",
              from: selfIdRef.current,
              to: remoteId,
              candidate: event.candidate.toJSON(),
            });
        };
        connection.ontrack = (event) => {
          const remoteStream = event.streams[0];
          if (!remoteStream) return;
          setParticipants((current) => {
            const others = current.filter((participant) => participant.id !== remoteId);
            return [...others, { id: remoteId, role: remoteRole, stream: remoteStream }];
          });
        };
        let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
        connection.onconnectionstatechange = () => {
          clearTimeout(disconnectTimer);
          // "disconnected" often heals by itself; if it does not, drop the peer so the
          // next hello/ready handshake builds a fresh connection instead of a frozen one.
          if (connection.connectionState === "disconnected") {
            disconnectTimer = setTimeout(() => {
              if (connection.connectionState !== "disconnected") return;
              connection.close();
              if (connectionsRef.current.get(remoteId) === connection) {
                connectionsRef.current.delete(remoteId);
                setParticipants((current) =>
                  current.map((participant) => {
                    if (participant.id !== remoteId) return participant;
                    const { stream: _stream, ...rest } = participant;
                    return rest;
                  }),
                );
              }
            }, PEER_DISCONNECT_GRACE_MS);
            return;
          }
          if (connection.connectionState === "failed" || connection.connectionState === "closed") {
            connection.close();
            connectionsRef.current.delete(remoteId);
            setParticipants((current) =>
              current.map((participant) => {
                if (participant.id !== remoteId) return participant;
                const { stream: _stream, ...rest } = participant;
                return rest;
              }),
            );
          }
        };
        return connection;
      };

      channel
        .on("broadcast", { event: "room" }, ({ payload }) => {
          const message = payload as RoomMessage;
          const selfId = selfIdRef.current;
          if (!message.action || message.from === selfId || !activeRef.current) return;

          if (
            message.action === "command" &&
            role === "director" &&
            message.from &&
            stageScreensRef.current.has(message.from) &&
            isShowCommand(message.command) &&
            typeof message.requestId === "string"
          ) {
            if (!handledCommands.current.has(message.requestId)) {
              if (handledCommands.current.size >= 128)
                handledCommands.current.delete(handledCommands.current.values().next().value!);
              handledCommands.current.add(message.requestId);
              const next = commandHandler.current?.(message.command);
              if (next) {
                layoutRef.current = next;
                layoutSequence.current += 1;
                sendSignal({
                  action: "layout",
                  from: selfId,
                  layout: next,
                  layoutSequence: layoutSequence.current,
                });
              }
            }
            sendSignal({
              action: "command-ack",
              from: selfId,
              to: message.from,
              requestId: message.requestId,
              ...(layoutRef.current
                ? { layout: layoutRef.current, layoutSequence: layoutSequence.current }
                : {}),
            });
            return;
          }
          if (message.action === "command-ack" && message.to === selfId && message.requestId) {
            if (!pendingCommands.current.has(message.requestId)) return;
            if (directorId.current && directorId.current !== message.from) return;
            if (
              message.layout &&
              (!directorId.current || directorId.current === message.from) &&
              (message.layoutSequence ?? 0) >= receivedSequence.current
            ) {
              directorId.current = message.from ?? "";
              receivedSequence.current = message.layoutSequence ?? 0;
              setLayout(normalizeLayout(message.layout));
            }
            clearTimeout(pendingCommands.current.get(message.requestId));
            pendingCommands.current.delete(message.requestId);
            setCommandPending(pendingCommands.current.size > 0);
            return;
          }

          if (message.action === "caption" && typeof message.text === "string") {
            setCaption(message.text.slice(0, 500));
            return;
          }
          if (message.action === "layout" && role === "translation-display" && message.layout) {
            if (message.to && message.to !== selfId) return;
            if (directorId.current && directorId.current !== message.from) return;
            if ((message.layoutSequence ?? 0) < receivedSequence.current) return;
            directorId.current = message.from ?? "";
            directorSeenAt.current = Date.now();
            receivedSequence.current = message.layoutSequence ?? 0;
            setLayout(normalizeLayout(message.layout));
            return;
          }
          if (
            message.action === "hello" &&
            message.role === "director" &&
            role === "translation-display"
          ) {
            // A browser refresh may lose its final 'left' packet. Accept the next
            // director after the old heartbeat expires, resetting its sequence epoch.
            if (
              !directorId.current ||
              directorId.current === message.from ||
              Date.now() - directorSeenAt.current > 12_000
            ) {
              if (directorId.current !== message.from) receivedSequence.current = -1;
              directorId.current = message.from ?? "";
              directorSeenAt.current = Date.now();
            }
            sendSignal({ action: "ready", from: selfId, role });
            return;
          }
          if (message.action === "hello" && isSourceId(role)) {
            sendSignal({ action: "ready", from: selfId, role });
            return;
          }
          if (
            message.action === "stage-peers" &&
            role === "translation-display" &&
            message.to === selfId
          ) {
            for (const peer of message.peers ?? []) {
              sendSignal({ action: "stage-connect", from: selfId, to: peer.id, role });
            }
            return;
          }
          if (
            message.action === "stage-connect" &&
            isSourceId(role) &&
            message.to === selfId &&
            message.from
          ) {
            const stageId = message.from;
            void (async () => {
              const connection = await createPeer(stageId, "translation-display");
              if (connection.signalingState !== "stable" || connection.localDescription) return;
              const offer = await connection.createOffer();
              await connection.setLocalDescription(offer);
              sendSignal({ action: "offer", from: selfId, to: stageId, role, sdp: offer });
            })().catch(() => setError("ส่งภาพไปยังจอฉายไม่สำเร็จ กรุณาลองเชื่อมต่ออีกครั้ง"));
            return;
          }
          if (
            message.action === "ready" &&
            role === "director" &&
            message.from &&
            isSourceId(message.role)
          ) {
            const remoteId = message.from;
            const remoteRole = message.role;
            remoteStationsRef.current.set(remoteId, remoteRole);
            for (const stageId of stageScreensRef.current) {
              sendSignal({
                action: "stage-peers",
                from: selfId,
                to: stageId,
                peers: [...remoteStationsRef.current].map(([id, stationRole]) => ({
                  id,
                  role: stationRole,
                })),
              });
              if (layoutRef.current)
                sendSignal({
                  action: "layout",
                  from: selfId,
                  to: stageId,
                  layout: layoutRef.current,
                  layoutSequence: layoutSequence.current,
                });
            }
            setParticipants((current) =>
              current.some((participant) => participant.id === message.from)
                ? current.map((participant) =>
                    participant.id === remoteId
                      ? { ...participant, role: remoteRole }
                      : participant,
                  )
                : [...current, { id: remoteId, role: remoteRole }],
            );
            void (async () => {
              const connection = await createPeer(remoteId, remoteRole);
              if (connection.signalingState !== "stable" || connection.localDescription) return;
              const offer = await connection.createOffer();
              await connection.setLocalDescription(offer);
              sendSignal({ action: "offer", from: selfId, to: remoteId, role, sdp: offer });
            })().catch(() => setError("เชื่อมต่อไม่สำเร็จ ลองออกจากห้องแล้วเริ่มแชร์ใหม่"));
            return;
          }
          if (
            message.action === "ready" &&
            role === "director" &&
            message.from &&
            message.role === "translation-display"
          ) {
            stageScreensRef.current.add(message.from);
            sendSignal({
              action: "stage-peers",
              from: selfId,
              to: message.from,
              peers: [...remoteStationsRef.current].map(([id, stationRole]) => ({
                id,
                role: stationRole,
              })),
            });
            if (layoutRef.current)
              sendSignal({
                action: "layout",
                from: selfId,
                to: message.from,
                layout: layoutRef.current,
                layoutSequence: layoutSequence.current,
              });
            return;
          }
          if (
            message.action === "ready" &&
            isSourceId(role) &&
            message.from &&
            message.role === "translation-display"
          ) {
            const stageId = message.from;
            void (async () => {
              const connection = await createPeer(stageId, "translation-display");
              if (connection.signalingState !== "stable" || connection.localDescription) return;
              const offer = await connection.createOffer();
              await connection.setLocalDescription(offer);
              sendSignal({ action: "offer", from: selfId, to: stageId, role, sdp: offer });
            })().catch(() => setError("ส่งภาพไปยังจอฉายไม่สำเร็จ กรุณาลองใหม่"));
            return;
          }
          if (message.to !== selfId || !message.from) return;
          const remoteId = message.from;

          if (
            message.action === "offer" &&
            (isSourceId(role) || role === "translation-display") &&
            message.sdp
          ) {
            const description = message.sdp;
            void (async () => {
              const remoteRole: ParticipantRole = isSourceId(message.role)
                ? message.role
                : "translation-display";
              const connection = await createPeer(remoteId, remoteRole);
              await connection.setRemoteDescription(description);
              const pending = candidateQueueRef.current.get(remoteId) ?? [];
              candidateQueueRef.current.delete(remoteId);
              await Promise.all(pending.map((candidate) => connection.addIceCandidate(candidate)));
              const answer = await connection.createAnswer();
              await connection.setLocalDescription(answer);
              sendSignal({ action: "answer", from: selfId, to: remoteId, role, sdp: answer });
            })().catch(() => setError("เปิดการเชื่อมต่อจอไม่สำเร็จ กรุณาเริ่มแชร์อีกครั้ง"));
            return;
          }
          if (message.action === "answer" && message.sdp) {
            void (async () => {
              const connection = connectionsRef.current.get(remoteId);
              if (!connection || connection.signalingState !== "have-local-offer") return;
              await connection.setRemoteDescription(message.sdp as RTCSessionDescriptionInit);
              const pending = candidateQueueRef.current.get(remoteId) ?? [];
              candidateQueueRef.current.delete(remoteId);
              await Promise.all(pending.map((candidate) => connection.addIceCandidate(candidate)));
            })().catch(() => setError("รับภาพจากอีกเครื่องไม่สำเร็จ ลองเชื่อมต่ออีกครั้ง"));
            return;
          }
          if (message.action === "candidate" && message.candidate) {
            const connection = connectionsRef.current.get(remoteId);
            if (connection?.remoteDescription) {
              void connection.addIceCandidate(message.candidate).catch(() => undefined);
            } else {
              const queue = candidateQueueRef.current.get(remoteId) ?? [];
              if (queue.length < 64)
                candidateQueueRef.current.set(remoteId, [...queue, message.candidate]);
            }
            return;
          }
          if (message.action === "left" && message.from) {
            if (message.from === directorId.current) {
              directorId.current = "";
              receivedSequence.current = -1;
            }
            connectionsRef.current.get(message.from)?.close();
            connectionsRef.current.delete(message.from);
            remoteStationsRef.current.delete(message.from);
            stageScreensRef.current.delete(message.from);
            setParticipants((current) =>
              current.filter((participant) => participant.id !== message.from),
            );
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnected(true);
            setError("");
            const action = role === "director" ? "hello" : "ready";
            sendSignal({ action, from: selfIdRef.current, role });
            handshakeTimerRef.current?.();
            // Worker-timed so a hidden Control Room keeps announcing itself on time.
            handshakeTimerRef.current = workerInterval(() => {
              if (!activeRef.current) {
                handshakeTimerRef.current?.();
                handshakeTimerRef.current = null;
                return;
              }
              sendSignal({ action, from: selfIdRef.current, role });
            }, 5000);
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnected(false);
            // Realtime rejoins on its own; SUBSCRIBED clears this message again.
            if (activeRef.current) setError("การเชื่อมต่อห้องหลุด กำลังเชื่อมต่อใหม่อัตโนมัติ…");
          }
        });

      if (stream) {
        for (const track of stream.getTracks()) {
          track.addEventListener("ended", () => stop());
        }
      }
    },
    [roomId, stop],
  );

  useEffect(() => () => stop(), [stop]);

  return {
    participants,
    connected,
    error,
    caption,
    layout,
    start,
    stop,
    sendCaption,
    sendLayout,
    sendCommand,
    commandPending,
    clearError: () => setError(""),
  };
}
