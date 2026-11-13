import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type BroadcastRole = "director" | "presentation" | "translation" | "translation-display";
type ParticipantRole = Exclude<BroadcastRole, "director">;
type RoomMessage = {
  action?: "hello" | "ready" | "left" | "offer" | "answer" | "candidate" | "caption" | "stage-peers" | "stage-connect" | "layout";
  from?: string;
  to?: string;
  role?: BroadcastRole;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  text?: string;
  peers?: Array<{ id: string; role: ParticipantRole }>;
  layout?: BroadcastLayout;
};
type Participant = { id: string; role: ParticipantRole; stream?: MediaStream };
export type BroadcastLayout = {
  layer: "presentation" | "translation";
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  fontScale: number;
  fitPreview: boolean;
};

export function useBroadcastSession(roomId: string) {
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
  const handshakeTimerRef = useRef<number | null>(null);
  const remoteStationsRef = useRef(new Map<string, ParticipantRole>());
  const stageScreensRef = useRef(new Set<string>());
  const layoutRef = useRef<BroadcastLayout | null>(null);

  const broadcast = useCallback((message: RoomMessage) => {
    const channel = channelRef.current;
    if (channel) void channel.send({ type: "broadcast", event: "room", payload: message });
  }, []);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (handshakeTimerRef.current !== null) {
      window.clearInterval(handshakeTimerRef.current);
      handshakeTimerRef.current = null;
    }
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
    if (channel) void supabase.removeChannel(channel);
    setParticipants([]);
    setConnected(false);
  }, [broadcast]);

  const sendCaption = useCallback((text: string) => {
    setCaption(text);
    broadcast({ action: "caption", from: selfIdRef.current, text });
  }, [broadcast]);

  const sendLayout = useCallback((next: BroadcastLayout) => {
    layoutRef.current = next;
    broadcast({ action: "layout", from: selfIdRef.current, layout: next });
  }, [broadcast]);

  const start = useCallback(async (role: BroadcastRole, stream?: MediaStream) => {
    if (activeRef.current) return;
    setError("");
    roleRef.current = role;
    selfIdRef.current = crypto.randomUUID();
    streamRef.current = stream ?? null;
    activeRef.current = true;

    const channel = supabase.channel(`broadcast-room-${roomId}`, {
      config: { broadcast: { self: false, ack: true } },
    });
    channelRef.current = channel;

    const sendSignal = (message: RoomMessage) => {
      if (channelRef.current) void channel.send({ type: "broadcast", event: "room", payload: message });
    };

    const createPeer = async (remoteId: string, remoteRole: ParticipantRole) => {
      const existing = connectionsRef.current.get(remoteId);
      if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") return existing;
      if (existing) connectionsRef.current.delete(remoteId);
      const connection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      connectionsRef.current.set(remoteId, connection);
      stream?.getTracks().forEach((track) => connection.addTrack(track, stream));
      if (role === "director" || role === "translation-display") connection.addTransceiver("video", { direction: "recvonly" });
      connection.onicecandidate = (event) => {
        if (event.candidate) sendSignal({ action: "candidate", from: selfIdRef.current, to: remoteId, candidate: event.candidate.toJSON() });
      };
      connection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        if (!remoteStream) return;
        setParticipants((current) => {
          const others = current.filter((participant) => participant.id !== remoteId);
          return [...others, { id: remoteId, role: remoteRole, stream: remoteStream }];
        });
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "closed") {
          connection.close();
          connectionsRef.current.delete(remoteId);
          setParticipants((current) => current.map((participant) => {
            if (participant.id !== remoteId) return participant;
            const { stream: _stream, ...rest } = participant;
            return rest;
          }));
        }
      };
      return connection;
    };

    channel.on("broadcast", { event: "room" }, ({ payload }) => {
      const message = payload as RoomMessage;
      const selfId = selfIdRef.current;
      if (!message.action || message.from === selfId || !activeRef.current) return;

      if (message.action === "caption" && typeof message.text === "string") {
        setCaption(message.text.slice(0, 500));
        return;
      }
      if (message.action === "layout" && role === "translation-display" && message.layout) {
        setLayout(message.layout);
        return;
      }
      if (message.action === "hello" && role === "translation-display") {
        sendSignal({ action: "ready", from: selfId, role });
        return;
      }
      if (message.action === "hello" && (role === "presentation" || role === "translation")) {
        sendSignal({ action: "ready", from: selfId, role });
        return;
      }
      if (message.action === "hello" && role === "translation-display") {
        sendSignal({ action: "ready", from: selfId, role });
        return;
      }
      if (message.action === "stage-peers" && role === "translation-display" && message.to === selfId) {
        for (const peer of message.peers ?? []) {
          sendSignal({ action: "stage-connect", from: selfId, to: peer.id, role });
        }
        return;
      }
      if (message.action === "stage-connect" && (role === "presentation" || role === "translation") && message.to === selfId && message.from) {
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
      if (message.action === "ready" && role === "translation-display" && message.from &&
          (message.role === "presentation" || message.role === "translation")) {
        const remoteId = message.from;
        const remoteRole = message.role;
        setParticipants((current) => current.some((participant) => participant.id === remoteId)
          ? current.map((participant) => participant.id === remoteId ? { ...participant, role: remoteRole } : participant)
          : [...current, { id: remoteId, role: remoteRole }]);
        void (async () => {
          const connection = await createPeer(remoteId, remoteRole);
          if (connection.signalingState === "have-remote-offer" || connection.signalingState === "have-local-offer") return;
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          sendSignal({ action: "offer", from: selfId, to: remoteId, role, sdp: offer });
        })().catch(() => setError("จอฉายเชื่อมต่อแหล่งภาพไม่สำเร็จ กรุณาลองใหม่"));
        return;
      }
      if (message.action === "ready" && role === "director" && message.from &&
          (message.role === "presentation" || message.role === "translation")) {
        const remoteId = message.from;
        const remoteRole = message.role;
        remoteStationsRef.current.set(remoteId, remoteRole);
        for (const stageId of stageScreensRef.current) {
          sendSignal({
            action: "stage-peers",
            from: selfId,
            to: stageId,
            peers: [...remoteStationsRef.current].map(([id, stationRole]) => ({ id, role: stationRole })),
          });
          if (layoutRef.current) sendSignal({ action: "layout", from: selfId, to: stageId, layout: layoutRef.current });
        }
        setParticipants((current) => current.some((participant) => participant.id === message.from)
          ? current.map((participant) => participant.id === remoteId ? { ...participant, role: remoteRole } : participant)
          : [...current, { id: remoteId, role: remoteRole }]);
        void (async () => {
          const connection = await createPeer(remoteId, remoteRole);
          if (connection.signalingState !== "stable" || connection.localDescription) return;
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          sendSignal({ action: "offer", from: selfId, to: remoteId, role, sdp: offer });
        })().catch(() => setError("เชื่อมต่อไม่สำเร็จ ลองออกจากห้องแล้วเริ่มแชร์ใหม่"));
        return;
      }
      if (message.action === "ready" && role === "director" && message.from && message.role === "translation-display") {
        stageScreensRef.current.add(message.from);
        sendSignal({
          action: "stage-peers",
          from: selfId,
          to: message.from,
          peers: [...remoteStationsRef.current].map(([id, stationRole]) => ({ id, role: stationRole })),
        });
        if (layoutRef.current) sendSignal({ action: "layout", from: selfId, to: message.from, layout: layoutRef.current });
        return;
      }
      if (message.action === "ready" && (role === "presentation" || role === "translation") && message.from && message.role === "translation-display") {
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

      if (message.action === "offer" && (role === "presentation" || role === "translation" || role === "translation-display") && message.sdp) {
        const description = message.sdp;
        void (async () => {
          const remoteRole: ParticipantRole = message.role === "presentation" ? "presentation" : message.role === "translation" ? "translation" : "translation-display";
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
          if (queue.length < 64) candidateQueueRef.current.set(remoteId, [...queue, message.candidate]);
        }
        return;
      }
      if (message.action === "left" && message.from) {
        connectionsRef.current.get(message.from)?.close();
        connectionsRef.current.delete(message.from);
        remoteStationsRef.current.delete(message.from);
        stageScreensRef.current.delete(message.from);
        setParticipants((current) => current.filter((participant) => participant.id !== message.from));
      }
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        const action = role === "director" ? "hello" : "ready";
        sendSignal({ action, from: selfIdRef.current, role });
        if (handshakeTimerRef.current !== null) window.clearInterval(handshakeTimerRef.current);
        let attempts = 0;
        handshakeTimerRef.current = window.setInterval(() => {
          attempts += 1;
          if (!activeRef.current || attempts >= 20) {
            if (handshakeTimerRef.current !== null) {
              window.clearInterval(handshakeTimerRef.current);
              handshakeTimerRef.current = null;
            }
          } else {
            sendSignal({ action, from: selfIdRef.current, role });
          }
          if (!activeRef.current && handshakeTimerRef.current !== null) {
            window.clearInterval(handshakeTimerRef.current);
            handshakeTimerRef.current = null;
          }
        }, 1400);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnected(false);
        setError("เชื่อมต่อห้องไม่ได้ กรุณาตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่");
      }
    });

    if (stream) {
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", () => stop());
      }
    }
  }, [roomId, stop]);

  useEffect(() => () => stop(), [stop]);

  return { participants, connected, error, caption, layout, start, stop, sendCaption, sendLayout, clearError: () => setError("") };
}