import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, LayoutGrid, List, Monitor, Pencil, Plus, Power, RadioTower, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountMenu } from "@/components/AccountMenu";
import { RoomStatus } from "@/components/RoomStatus";
import { CloseRoomDialog } from "@/components/CloseRoomDialog";
import { setRoomOpen } from "@/lib/room-access";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({ meta: [
    { title: "ห้องของฉัน — Live Relay" },
    { name: "description", content: "จัดการห้องถ่ายทอดสด เปิดหรือหยุดรับภาพ และเลือกดูห้องแบบการ์ดหรือตาราง" },
    { property: "og:title", content: "ห้องของฉัน — Live Relay" },
    { property: "og:description", content: "จัดการสถานะและห้องถ่ายทอดสดของคุณ" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MyRooms,
});

type RoomRow = { id: string; name: string; updated_at: string; is_open: boolean };

function MyRooms() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [view, setView] = useState<"card" | "table">("card");
  const [closingRoom, setClosingRoom] = useState<RoomRow | null>(null);
  useEffect(() => {
    try { setView(localStorage.getItem(`relay-rooms-view-${user.id}`) === "table" ? "table" : "card"); } catch { /* optional preference */ }
  }, [user.id]);
  const changeView = (next: "card" | "table") => {
    setView(next);
    try { localStorage.setItem(`relay-rooms-view-${user.id}`, next); } catch { /* optional preference */ }
  };
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["rooms"] }),
      qc.invalidateQueries({ queryKey: ["room-access"] }),
    ]);
  };
  const rooms = useQuery({
    queryKey: ["rooms", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("id, name, updated_at, is_open").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("rooms").insert({ owner_id: user.id, name: name.trim() || "ห้องใหม่" }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => void navigate({ to: "/room/$roomId", params: { roomId: id }, search: { view: "director" } }),
    onError: () => toast.error("สร้างห้องไม่สำเร็จ"),
  });
  const rename = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase.from("rooms").update({ name: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setEditing(null); void refresh(); },
    onError: () => toast.error("เปลี่ยนชื่อไม่สำเร็จ"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("ลบห้องไม่สำเร็จ"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, open }: { id: string; open: boolean }) => setRoomOpen(id, open),
    onSuccess: refresh,
    onError: () => toast.error("เปลี่ยนสถานะห้องไม่สำเร็จ"),
  });
  const controls = (room: RoomRow) => <div className="rooms-item-actions">
    <Button size="sm" variant={room.is_open ? "outline" : "default"} disabled={toggle.isPending} onClick={() => {
      if (room.is_open) setClosingRoom(room);
      else toggle.mutate({ id: room.id, open: true });
    }}><Power size={14} />{room.is_open ? "ปิดห้อง" : "เปิดห้อง"}</Button>
    <Button size="icon" variant="ghost" title="เปลี่ยนชื่อ" aria-label={`เปลี่ยนชื่อ ${room.name}`} onClick={() => { setEditing(room.id); setEditName(room.name); }}><Pencil size={15} /></Button>
    <Button size="icon" variant="ghost" title="ลบห้อง" aria-label={`ลบห้อง ${room.name}`} disabled={remove.isPending} onClick={() => window.confirm(`ลบห้อง "${room.name}"?`) && remove.mutate(room.id)}><Trash2 size={15} /></Button>
    <Button asChild size="icon" variant="outline" title="เข้าห้องควบคุม" aria-label={`เข้าห้อง ${room.name}`}><Link to="/room/$roomId" params={{ roomId: room.id }} search={{ view: "director" }}><ArrowUpRight size={15} /></Link></Button>
  </div>;
  const roomName = (room: RoomRow) => editing === room.id ? <form className="rooms-rename" onSubmit={(e) => {
    e.preventDefault();
    if (editName.trim()) rename.mutate({ id: room.id, value: editName.trim() });
  }}>
    <Input aria-label="ชื่อห้องใหม่" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} />
    <div><Button type="submit" size="sm" disabled={rename.isPending}>บันทึก</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button></div>
  </form> : <Link className="rooms-item-name" to="/room/$roomId" params={{ roomId: room.id }} search={{ view: "director" }}>{room.name}</Link>;
  const updated = (room: RoomRow) => new Date(room.updated_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

  return <main className="relay-home min-h-screen px-5 py-6 sm:px-10 sm:py-9">
    <div className="mx-auto max-w-6xl">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="relay-brand"><span className="relay-brand-mark"><RadioTower size={18} /></span><span>live<span className="relay-brand-light">{" relay"}</span></span></Link>
        <AccountMenu />
      </header>
      <section className="relay-rooms">
        <div className="rooms-heading"><div><span className="rooms-eyebrow">WORKSPACE</span><h1>ห้องของฉัน</h1></div>
          <span className="rooms-count">{rooms.data?.length ?? 0} ห้อง · เปิด {rooms.data?.filter((r) => r.is_open).length ?? 0}</span>
        </div>
        <form className="relay-rooms-create" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Input aria-label="ชื่องาน" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่องาน เช่น สัมมนาประจำปี" maxLength={80} />
          <Button type="submit" disabled={create.isPending}><Plus size={16} /> สร้างห้อง</Button>
        </form>
        <div className="rooms-list-heading"><h2>ห้องทั้งหมด</h2><div className="rooms-view-switch" role="group" aria-label="มุมมองรายการห้อง">
          <Button size="icon" variant={view === "card" ? "secondary" : "ghost"} aria-label="มุมมองการ์ด" title="การ์ด" aria-pressed={view === "card"} onClick={() => changeView("card")}><LayoutGrid size={16} /></Button>
          <Button size="icon" variant={view === "table" ? "secondary" : "ghost"} aria-label="มุมมองตาราง" title="ตาราง" aria-pressed={view === "table"} onClick={() => changeView("table")}><List size={16} /></Button>
        </div></div>
        {rooms.isLoading ? <p className="relay-rooms-empty">กำลังโหลด…</p> : rooms.isError ? <div className="relay-rooms-empty">โหลดห้องไม่สำเร็จ <Button variant="outline" size="sm" onClick={() => void rooms.refetch()}>ลองอีกครั้ง</Button></div> : !rooms.data?.length ? <div className="rooms-empty"><RadioTower size={32} /><p>ยังไม่มีห้อง</p></div> : view === "card" ?
          <ul className="rooms-card-grid">{rooms.data.map((room) => <li className="rooms-card" key={room.id}>
            <div className="rooms-card-top"><span className="rooms-card-icon"><Monitor size={22} /></span><RoomStatus open={room.is_open} /></div>
            {roomName(room)}
            <span className="rooms-item-id">ROOM {room.id.slice(0, 8).toUpperCase()}</span>
            <p className="rooms-item-date">แก้ไข {updated(room)}</p>
            {controls(room)}
          </li>)}</ul> : <div className="rooms-table-scroll"><table className="rooms-table"><thead><tr><th scope="col">ชื่อห้อง</th><th scope="col">สถานะ</th><th scope="col">แก้ไขล่าสุด</th><th scope="col">จัดการ</th></tr></thead><tbody>
            {rooms.data.map((room) => <tr key={room.id}><td>{roomName(room)}<span className="rooms-item-id">{room.id.slice(0, 8).toUpperCase()}</span></td><td><RoomStatus open={room.is_open} /></td><td className="rooms-item-date">{updated(room)}</td><td>{controls(room)}</td></tr>)}
          </tbody></table></div>}
      </section>
      <CloseRoomDialog open={closingRoom !== null} onOpenChange={(open) => { if (!open) setClosingRoom(null); }}
        roomName={closingRoom?.name ?? ""} pending={toggle.isPending}
        onConfirm={async () => { if (closingRoom) await toggle.mutateAsync({ id: closingRoom.id, open: false }); }} />
    </div>
  </main>;
}
