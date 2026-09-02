import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, date } from "@/components/student/portal-page";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { countPendingMakeups } from "@/lib/student-attendance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/student/classes")({ component: Classes });

const sb = supabase as any;
const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const CALENDAR_STATUS_CLASSES = {
  present:
    "[&>button]:border [&>button]:border-emerald-300 [&>button]:bg-emerald-50 [&>button]:text-emerald-950",
  absent:
    "[&>button]:border [&>button]:border-rose-300 [&>button]:bg-rose-50 [&>button]:text-rose-950",
  makeup:
    "[&>button]:border [&>button]:border-amber-300 [&>button]:bg-amber-50 [&>button]:text-amber-950",
};

type AttendanceRow = {
  id: string;
  session_date: string;
  session_time?: string | null;
  status: "present" | "absent" | "justified";
  record_type?: "class" | "makeup" | null;
  generates_makeup?: boolean | null;
  makeup_completed?: boolean | null;
  comments?: string | null;
};

function Classes() {
  const { data: access } = useStudentPortalAccess();
  const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date>();
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery<AttendanceRow[]>({
    queryKey: ["student-classes", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const result = await sb.rpc("student_portal_attendance", {
        _student_id: access!.is_preview ? access!.student_id : null,
      });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });

  const present = rows.filter((row) => row.status === "present").length;
  const absent = rows.filter((row) => row.status === "absent").length;
  const makeups = countPendingMakeups(rows);
  const today = new Date().toISOString().slice(0, 10);
  const future = rows.filter((row) => row.session_date >= today).length;
  const latestMonth = rows[0] ? parseDate(rows[0].session_date) : new Date();
  const displayedMonth = calendarMonth ?? latestMonth;
  const selectedYear = displayedMonth.getFullYear();
  const availableYears = useMemo(() => {
    const years = new Set(rows.map((row) => parseDate(row.session_date).getFullYear()));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [rows]);

  const recordsByDay = useMemo(() => {
    const grouped = new Map<string, AttendanceRow[]>();
    for (const row of rows) {
      const current = grouped.get(row.session_date) ?? [];
      current.push(row);
      grouped.set(row.session_date, current);
    }
    return grouped;
  }, [rows]);

  const monthRows = useMemo(
    () =>
      rows.filter((row) => {
        const rowDate = parseDate(row.session_date);
        return (
          rowDate.getMonth() === displayedMonth.getMonth() &&
          rowDate.getFullYear() === displayedMonth.getFullYear()
        );
      }),
    [displayedMonth, rows],
  );

  const dayGroups = useMemo(() => {
    const groups = { present: [] as Date[], absent: [] as Date[], makeup: [] as Date[] };
    for (const [day, dayRows] of recordsByDay) {
      const dayDate = parseDate(day);
      if (dayRows.some((row) => row.record_type === "makeup")) groups.makeup.push(dayDate);
      else if (dayRows.some((row) => row.status === "absent")) groups.absent.push(dayDate);
      else groups.present.push(dayDate);
    }
    return groups;
  }, [recordsByDay]);

  const selectedRows = selectedDay ? (recordsByDay.get(dateKey(selectedDay)) ?? []) : [];

  return (
    <PortalPage title="Minhas aulas">
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Aulas previstas", value: future, icon: CalendarDays },
          { label: "Presenças", value: present, icon: CheckCircle2 },
          { label: "Faltas", value: absent, icon: XCircle },
          { label: "Reposições pendentes", value: makeups, icon: RefreshCw },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
              </div>
              <Icon className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando calendário…</p>}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível carregar o histórico de aulas. Atualize a página e tente novamente.
        </p>
      )}

      {!isLoading && !error && rows.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={viewMode === "month" ? "default" : "outline"}
                onClick={() => setViewMode("month")}
              >
                Ver por mês
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "year" ? "default" : "outline"}
                onClick={() => {
                  setViewMode("year");
                  setSelectedDay(undefined);
                }}
              >
                Ver ano inteiro
              </Button>
            </div>
            <div className="flex gap-2">
              {viewMode === "month" && (
                <select
                  aria-label="Selecionar mês"
                  className="h-9 min-w-32 rounded-md border bg-background px-3 text-sm"
                  value={displayedMonth.getMonth()}
                  onChange={(event) => {
                    setCalendarMonth(new Date(selectedYear, Number(event.target.value), 1));
                    setSelectedDay(undefined);
                  }}
                >
                  {MONTH_NAMES.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Selecionar ano"
                className="h-9 min-w-24 rounded-md border bg-background px-3 text-sm"
                value={selectedYear}
                onChange={(event) => {
                  setCalendarMonth(
                    new Date(Number(event.target.value), displayedMonth.getMonth(), 1),
                  );
                  setSelectedDay(undefined);
                }}
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {viewMode === "month" ? (
            <MonthView
              displayedMonth={displayedMonth}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              setCalendarMonth={setCalendarMonth}
              dayGroups={dayGroups}
              selectedRows={selectedRows}
              monthRows={monthRows}
            />
          ) : (
            <YearView
              year={selectedYear}
              dayGroups={dayGroups}
              onOpenMonth={(month) => {
                setCalendarMonth(month);
                setSelectedDay(undefined);
                setViewMode("month");
              }}
            />
          )}
        </>
      )}

      {!isLoading && !error && !rows.length && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma aula registrada.
          </CardContent>
        </Card>
      )}
    </PortalPage>
  );
}

function MonthView({
  displayedMonth,
  selectedDay,
  setSelectedDay,
  setCalendarMonth,
  dayGroups,
  selectedRows,
  monthRows,
}: {
  displayedMonth: Date;
  selectedDay?: Date;
  setSelectedDay: (day?: Date) => void;
  setCalendarMonth: (month: Date) => void;
  dayGroups: Record<string, Date[]>;
  selectedRows: AttendanceRow[];
  monthRows: AttendanceRow[];
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden">
        <CardContent className="p-3 sm:p-5">
          <Calendar
            mode="single"
            month={displayedMonth}
            selected={selectedDay}
            onSelect={setSelectedDay}
            onMonthChange={(month) => {
              setCalendarMonth(month);
              setSelectedDay(undefined);
            }}
            showOutsideDays={false}
            modifiers={dayGroups}
            modifiersClassNames={CALENDAR_STATUS_CLASSES}
            formatters={{
              formatCaption: (month) =>
                new Intl.DateTimeFormat("pt-BR", {
                  month: "long",
                  year: "numeric",
                }).format(month),
              formatWeekdayName,
            }}
            className="w-full p-0 [--cell-size:clamp(2.5rem,9vw,4.75rem)]"
            classNames={{ root: "w-full", months: "w-full", month: "w-full" }}
          />
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
            <Legend color="bg-emerald-400" label="Presença" />
            <Legend color="bg-rose-400" label="Falta" />
            <Legend color="bg-amber-400" label="Reposição" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold">
              {selectedDay ? date(dateKey(selectedDay)) : formatMonth(displayedMonth)}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selectedDay ? "Detalhes do dia selecionado" : "Aulas e reposições do mês"}
            </p>
          </div>
          <div className="space-y-2">
            {(selectedDay ? selectedRows : monthRows).map((row) => (
              <button
                type="button"
                key={row.id}
                onClick={() => setSelectedDay(parseDate(row.session_date))}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/60",
                  selectedDay && dateKey(selectedDay) === row.session_date && "border-primary/40",
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {date(row.session_date)}
                    {row.session_time ? ` · ${row.session_time}` : ""}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{recordLabel(row)}</div>
                </div>
                <StatusBadge row={row} />
              </button>
            ))}
            {(selectedDay ? selectedRows : monthRows).length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma aula neste período.
              </div>
            )}
          </div>
          {selectedDay && (
            <button
              type="button"
              className="mt-4 text-xs font-medium text-primary hover:underline"
              onClick={() => setSelectedDay(undefined)}
            >
              Ver todas as atividades do mês
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function YearView({
  year,
  dayGroups,
  onOpenMonth,
}: {
  year: number;
  dayGroups: Record<string, Date[]>;
  onOpenMonth: (month: Date) => void;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MONTH_NAMES.map((monthName, monthIndex) => (
            <div
              key={monthName}
              role="button"
              tabIndex={0}
              className="rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
              onClick={() => onOpenMonth(new Date(year, monthIndex, 1))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenMonth(new Date(year, monthIndex, 1));
                }
              }}
            >
              <div className="mb-2 font-display font-semibold">{monthName}</div>
              <Calendar
                mode="single"
                month={new Date(year, monthIndex, 1)}
                hideNavigation
                showOutsideDays={false}
                modifiers={dayGroups}
                modifiersClassNames={CALENDAR_STATUS_CLASSES}
                formatters={{ formatWeekdayName }}
                className="pointer-events-none w-full p-0 [--cell-size:1.75rem]"
                classNames={{
                  root: "w-full",
                  months: "w-full",
                  month: "w-full gap-2",
                  month_caption: "hidden",
                  week: "mt-1 flex w-full",
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
          <Legend color="bg-emerald-400" label="Presença" />
          <Legend color="bg-rose-400" label="Falta" />
          <Legend color="bg-amber-400" label="Reposição" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ row }: { row: AttendanceRow }) {
  if (row.record_type === "makeup") {
    return <Badge className="shrink-0 bg-amber-100 text-amber-900">Reposição</Badge>;
  }
  if (row.status === "present") {
    return <Badge className="shrink-0 bg-emerald-100 text-emerald-900">Presença</Badge>;
  }
  if (row.status === "absent") {
    return <Badge className="shrink-0 bg-rose-100 text-rose-900">Falta</Badge>;
  }
  return <Badge variant="secondary">Justificada</Badge>;
}

function recordLabel(row: AttendanceRow) {
  if (row.record_type === "makeup") {
    return row.makeup_completed ? "Reposição realizada" : "Reposição";
  }
  return row.generates_makeup ? "Aula regular · gera reposição" : "Aula regular";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </span>
  );
}

function parseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatMonth(value: Date) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(value);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatWeekdayName(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(value).replace(".", "");
}
