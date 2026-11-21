export function RoomStatus({ open }: { open: boolean }) {
  return <span className={`room-status${open ? " is-open" : ""}`} role="status">
    <span className="room-status-light" />{open ? "เปิดรับภาพ" : "ปิดห้อง"}
  </span>;
}