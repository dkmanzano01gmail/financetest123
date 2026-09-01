type AttendanceRecord = {
  generates_makeup?: boolean | null;
  makeup_completed?: boolean | null;
  record_type?: string | null;
  status?: string | null;
};

export function countPendingMakeups(rows: AttendanceRecord[]) {
  const generated = rows.filter((row) => row.generates_makeup).length;
  const completed = rows.filter(
    (row) => row.record_type === "makeup" && (row.makeup_completed || row.status === "present"),
  ).length;

  return Math.max(0, generated - completed);
}
