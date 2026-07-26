export type MoneyFlowType = "income" | "expense";

export type OrnaTransaction = {
  id: string;
  date: string;
  type: MoneyFlowType;
  amount: number | string;
  description?: string | null;
  category_id?: string | null;
  counterparty?: string | null;
  status?: string | null;
  categories?: { name?: string | null; color?: string | null } | null;
};

export type CashFlowEntry = {
  id: string;
  entry_date: string;
  type: MoneyFlowType;
  description: string;
  amount: number | string;
  recurrence?: "none" | "weekly" | "monthly" | "yearly" | string | null;
  status?: "projected" | "realized" | string | null;
  is_active?: boolean | null;
  day_of_month?: number | null;
  specific_date?: string | null;
  category_id?: string | null;
  notes?: string | null;
  categories?: { name?: string | null } | null;
};

export type CashFlowEvent = {
  id: string;
  date: string;
  type: MoneyFlowType;
  amount: number;
  description: string;
  category: string;
  source: "projected" | "actual";
  recurrence?: string;
};

export type CashFlowDay = {
  date: string;
  dayLabel: string;
  projectedIncome: number;
  projectedExpense: number;
  projectedNet: number;
  projectedBalance: number;
  actualIncome: number;
  actualExpense: number;
  actualNet: number;
  actualBalance: number | null;
  actualForecastBalance: number | null;
  actualMode: "actual" | "forecastAfterActual" | "future";
  projectedEvents: CashFlowEvent[];
  actualEvents: CashFlowEvent[];
};

export const ORNA_KILN_DEFAULTS = {
  resistanceCost: 2000,
  kwhCost: 1,
  powerKw: 9.85,
  ovenDiameter: 57,
  areaAdjustment: 1.0825,
  finalBuffer: 0.1,
  customerMarginPercent: 100,
  profiles: {
    biscuit: { cone: "Biscoito", resistanceBurns: 275, hours: 9, utilization: 0.65 },
    cone6: { cone: "6", resistanceBurns: 175, hours: 10.5, utilization: 0.75 },
    cone7: { cone: "7", resistanceBurns: 150, hours: 11, utilization: 0.78 },
    cone10: { cone: "10", resistanceBurns: 110, hours: 12, utilization: 0.9 },
  },
} as const;

export type FiringSettingsLike = {
  oven_diameter_cm?: number | string | null;
  area_adjustment?: number | string | null;
  resistance_cost?: number | string | null;
  power_kw?: number | string | null;
  kwh_cost?: number | string | null;
  final_buffer?: number | string | null;
  customer_margin_percent?: number | string | null;
  resistance_burns?: number | string | null;
  utilization?: number | string | null;
  biscuit_hours?: number | string | null;
  glaze_hours?: number | string | null;
  biscuit_resistance_burns?: number | string | null;
  biscuit_utilization?: number | string | null;
  glaze6_resistance_burns?: number | string | null;
  glaze6_hours?: number | string | null;
  glaze6_utilization?: number | string | null;
  glaze7_resistance_burns?: number | string | null;
  glaze7_hours?: number | string | null;
  glaze7_utilization?: number | string | null;
  glaze10_resistance_burns?: number | string | null;
  glaze10_hours?: number | string | null;
  glaze10_utilization?: number | string | null;
};

export function resolveFiringProfile(
  settings: FiringSettingsLike | null | undefined,
  firingType: string,
  cone?: string | null,
) {
  const type = String(firingType || "biscuit").toLowerCase();
  const normalizedCone = String(cone || (type === "biscuit" ? "Biscoito" : "6"))
    .toLowerCase()
    .replace(/cone\s*/g, "")
    .trim();
  const defaults = ORNA_KILN_DEFAULTS;
  const common = {
    ovenDiameter: numberValue(settings?.oven_diameter_cm ?? defaults.ovenDiameter),
    areaAdjustment: numberValue(settings?.area_adjustment ?? defaults.areaAdjustment),
    resistanceCost: numberValue(settings?.resistance_cost ?? defaults.resistanceCost),
    powerKw: numberValue(settings?.power_kw ?? defaults.powerKw),
    kwhCost: numberValue(settings?.kwh_cost ?? defaults.kwhCost),
    finalBuffer: numberValue(settings?.final_buffer ?? defaults.finalBuffer),
    customerMarginPercent: numberValue(
      settings?.customer_margin_percent ?? defaults.customerMarginPercent,
    ),
  };
  if (type === "biscuit" || normalizedCone === "biscoito") {
    return {
      ...common,
      cone: "Biscoito",
      resistanceBurns: numberValue(
        settings?.biscuit_resistance_burns ??
          settings?.resistance_burns ??
          defaults.profiles.biscuit.resistanceBurns,
      ),
      hours: numberValue(settings?.biscuit_hours ?? defaults.profiles.biscuit.hours),
      utilization: numberValue(
        settings?.biscuit_utilization ??
          settings?.utilization ??
          defaults.profiles.biscuit.utilization,
      ),
    };
  }
  if (normalizedCone === "10") {
    return {
      ...common,
      cone: "10",
      resistanceBurns: numberValue(
        settings?.glaze10_resistance_burns ?? defaults.profiles.cone10.resistanceBurns,
      ),
      hours: numberValue(settings?.glaze10_hours ?? defaults.profiles.cone10.hours),
      utilization: numberValue(
        settings?.glaze10_utilization ?? defaults.profiles.cone10.utilization,
      ),
    };
  }
  if (normalizedCone === "7") {
    return {
      ...common,
      cone: "7",
      resistanceBurns: numberValue(
        settings?.glaze7_resistance_burns ?? defaults.profiles.cone7.resistanceBurns,
      ),
      hours: numberValue(settings?.glaze7_hours ?? defaults.profiles.cone7.hours),
      utilization: numberValue(
        settings?.glaze7_utilization ?? defaults.profiles.cone7.utilization,
      ),
    };
  }
  return {
    ...common,
    cone: "6",
    resistanceBurns: numberValue(
      settings?.glaze6_resistance_burns ??
        settings?.resistance_burns ??
        defaults.profiles.cone6.resistanceBurns,
    ),
    hours: numberValue(
      settings?.glaze6_hours ?? settings?.glaze_hours ?? defaults.profiles.cone6.hours,
    ),
    utilization: numberValue(
      settings?.glaze6_utilization ??
        settings?.utilization ??
        defaults.profiles.cone6.utilization,
    ),
  };
}

function numberValue(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function parseDateKey(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function monthEnd(year: number, zeroBasedMonth: number): Date {
  return new Date(year, zeroBasedMonth + 1, 0, 12);
}

export function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  result.setDate(Math.min(day, monthEnd(result.getFullYear(), result.getMonth()).getDate()));
  return result;
}

function daysBetween(start: Date, end: Date): Date[] {
  const rows: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) rows.push(new Date(d));
  return rows;
}

function isIgnored(status?: string | null): boolean {
  const normalized = String(status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized === "ignorado" || normalized === "ignored" || normalized === "cancelled";
}

export function dashboardSummary(
  transactions: OrnaTransaction[],
  selectedMonth: number,
  selectedYear: number,
) {
  const active = transactions.filter((tx) => !isIgnored(tx.status));
  const current = active.filter((tx) => {
    const d = parseDateKey(tx.date);
    return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear;
  });
  const previousDate = new Date(selectedYear, selectedMonth - 2, 1, 12);
  const previous = active.filter((tx) => {
    const d = parseDateKey(tx.date);
    return d.getMonth() === previousDate.getMonth() && d.getFullYear() === previousDate.getFullYear();
  });

  const summarize = (rows: OrnaTransaction[]) => {
    let income = 0;
    let expense = 0;
    const incomeCategories = new Map<string, { name: string; color: string; value: number }>();
    const expenseCategories = new Map<string, { name: string; color: string; value: number }>();
    for (const tx of rows) {
      const value = Math.abs(numberValue(tx.amount));
      const category = tx.categories?.name || "Sem categoria";
      const color = tx.categories?.color || (tx.type === "income" ? "#6E7A57" : "#A03A2A");
      const map = tx.type === "income" ? incomeCategories : expenseCategories;
      const previous = map.get(category);
      if (previous) previous.value += value;
      else map.set(category, { name: category, color, value });
      if (tx.type === "income") income += value;
      else expense += value;
    }
    return {
      income,
      expense,
      balance: income - expense,
      incomeCategories: [...incomeCategories.values()].sort((a, b) => b.value - a.value),
      expenseCategories: [...expenseCategories.values()].sort((a, b) => b.value - a.value),
      count: rows.length,
    };
  };

  const currentSummary = summarize(current);
  const previousSummary = summarize(previous);
  const categoryBenchmarks = (type: MoneyFlowType) => {
    const currentMap = new Map<string, number>();
    const historyMap = new Map<string, number>();
    const months = new Set<number>();
    for (const transaction of current) {
      if (transaction.type !== type) continue;
      const category = transaction.categories?.name || "Sem categoria";
      currentMap.set(category, (currentMap.get(category) || 0) + Math.abs(numberValue(transaction.amount)));
    }
    for (const transaction of active) {
      const date = parseDateKey(transaction.date);
      if (
        transaction.type !== type ||
        date.getFullYear() !== selectedYear ||
        date.getMonth() + 1 === selectedMonth
      ) continue;
      months.add(date.getMonth() + 1);
      const category = transaction.categories?.name || "Sem categoria";
      historyMap.set(category, (historyMap.get(category) || 0) + Math.abs(numberValue(transaction.amount)));
    }
    const divisor = months.size || 1;
    const categories = new Set([...currentMap.keys(), ...historyMap.keys()]);
    return [...categories]
      .map((name) => {
        const currentValue = currentMap.get(name) || 0;
        const average = (historyMap.get(name) || 0) / divisor;
        return {
          name,
          current: currentValue,
          average,
          difference: currentValue - average,
          differencePct: average ? (currentValue - average) / Math.abs(average) : currentValue ? 1 : 0,
        };
      })
      .sort((a, b) => Math.max(b.current, b.average) - Math.max(a.current, a.average));
  };
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const summary = summarize(
      active.filter((tx) => {
        const d = parseDateKey(tx.date);
        return d.getFullYear() === selectedYear && d.getMonth() === index;
      }),
    );
    return { month: index + 1, ...summary };
  });
  const activeMonths = monthly.filter((m) => m.income || m.expense);
  const divisor = activeMonths.length || 1;
  const pct = (currentValue: number, previousValue: number) =>
    previousValue ? (currentValue - previousValue) / Math.abs(previousValue) : currentValue ? 1 : 0;

  return {
    ...currentSummary,
    current,
    previous: previousSummary,
    monthly,
    metrics: {
      netMargin: currentSummary.income ? currentSummary.balance / currentSummary.income : 0,
      expenseRatio: currentSummary.income ? currentSummary.expense / currentSummary.income : null,
      averageTransaction: currentSummary.count
        ? (currentSummary.income + currentSummary.expense) / currentSummary.count
        : 0,
      averageMonthlyIncome: activeMonths.reduce((sum, m) => sum + m.income, 0) / divisor,
      averageMonthlyExpense: activeMonths.reduce((sum, m) => sum + m.expense, 0) / divisor,
      averageMonthlyBalance: activeMonths.reduce((sum, m) => sum + m.balance, 0) / divisor,
      incomeDelta: currentSummary.income - previousSummary.income,
      incomeDeltaPct: pct(currentSummary.income, previousSummary.income),
      expenseDelta: currentSummary.expense - previousSummary.expense,
      expenseDeltaPct: pct(currentSummary.expense, previousSummary.expense),
      balanceDelta: currentSummary.balance - previousSummary.balance,
      balanceDeltaPct: pct(currentSummary.balance, previousSummary.balance),
    },
    incomeBenchmarks: categoryBenchmarks("income"),
    expenseBenchmarks: categoryBenchmarks("expense"),
    topIncome: [...current]
      .filter((tx) => tx.type === "income")
      .sort((a, b) => numberValue(b.amount) - numberValue(a.amount))
      .slice(0, 5),
    topExpense: [...current]
      .filter((tx) => tx.type === "expense")
      .sort((a, b) => numberValue(b.amount) - numberValue(a.amount))
      .slice(0, 5),
  };
}

function cashFlowEntryDate(entry: CashFlowEntry): Date {
  return parseDateKey(entry.specific_date || entry.entry_date);
}

export function expandCashFlowEntries(
  entries: CashFlowEntry[],
  startDate: Date,
  endDate: Date,
): CashFlowEvent[] {
  const events: CashFlowEvent[] = [];
  for (const entry of entries) {
    if (entry.is_active === false || entry.status === "realized" || !numberValue(entry.amount)) continue;
    const recurrence = entry.recurrence || "none";
    const amount = Math.abs(numberValue(entry.amount));
    const category = entry.categories?.name || "Sem categoria";
    const push = (date: Date) => {
      if (date < startDate || date > endDate) return;
      events.push({
        id: `${entry.id}:${dateKey(date)}`,
        date: dateKey(date),
        type: entry.type,
        amount,
        description: entry.description,
        category,
        source: "projected",
        recurrence,
      });
    };

    if (recurrence === "none") {
      push(cashFlowEntryDate(entry));
      continue;
    }
    if (recurrence === "weekly") {
      const seed = cashFlowEntryDate(entry);
      const current = new Date(seed);
      while (current < startDate) current.setDate(current.getDate() + 7);
      while (current <= endDate) {
        push(new Date(current));
        current.setDate(current.getDate() + 7);
      }
      continue;
    }
    if (recurrence === "yearly") {
      const seed = cashFlowEntryDate(entry);
      for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year += 1) {
        const day = Math.min(seed.getDate(), monthEnd(year, seed.getMonth()).getDate());
        push(new Date(year, seed.getMonth(), day, 12));
      }
      continue;
    }

    // Apps Script v25/v64: monthly entries repeat in every month in the horizon,
    // clamping day 29-31 to the last day of shorter months.
    for (
      let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 12);
      cursor <= endDate;
      cursor.setMonth(cursor.getMonth() + 1)
    ) {
      const last = monthEnd(cursor.getFullYear(), cursor.getMonth()).getDate();
      const day = Math.max(1, Math.min(Number(entry.day_of_month) || cashFlowEntryDate(entry).getDate() || 1, last));
      push(new Date(cursor.getFullYear(), cursor.getMonth(), day, 12));
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export function actualCashFlowEvents(
  transactions: OrnaTransaction[],
  startDate: Date,
  endDate: Date,
): CashFlowEvent[] {
  return transactions
    .filter((tx) => !isIgnored(tx.status))
    .map((tx) => ({ tx, date: parseDateKey(tx.date) }))
    .filter(({ date }) => date >= startDate && date <= endDate)
    .map(({ tx }) => ({
      id: tx.id,
      date: tx.date.slice(0, 10),
      type: tx.type,
      amount: Math.abs(numberValue(tx.amount)),
      description: tx.description || "Transação realizada",
      category: tx.categories?.name || "Sem categoria",
      source: "actual" as const,
      recurrence: "realized",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildCashFlowProjection(args: {
  entries: CashFlowEntry[];
  transactions: OrnaTransaction[];
  month: number;
  year: number;
  monthsCount: number;
  startingCash: number;
  today?: Date;
}) {
  const horizon = Math.max(1, Math.min(12, Math.trunc(args.monthsCount || 1)));
  const startDate = new Date(args.year, args.month - 1, 1, 12);
  const endDate = monthEnd(args.year, args.month - 2 + horizon);
  const projectedEvents = expandCashFlowEntries(args.entries, startDate, endDate);
  const actualEvents = actualCashFlowEvents(args.transactions, startDate, endDate);
  const projectedByDate = new Map<string, CashFlowEvent[]>();
  const actualByDate = new Map<string, CashFlowEvent[]>();
  for (const event of projectedEvents)
    projectedByDate.set(event.date, [...(projectedByDate.get(event.date) || []), event]);
  for (const event of actualEvents)
    actualByDate.set(event.date, [...(actualByDate.get(event.date) || []), event]);

  const today = args.today ? parseDateKey(args.today) : parseDateKey(new Date());
  const cutoff = today < startDate ? null : today > endDate ? endDate : today;
  let projectedBalance = numberValue(args.startingCash);
  let actualBalance = numberValue(args.startingCash);
  let actualForecastBalance = numberValue(args.startingCash);
  let actualForecastStarted = today < startDate;
  let minCash = projectedBalance;
  let minCashDate = dateKey(startDate);
  let firstNegativeDate: string | null = null;
  let firstNegativeBalance: number | null = null;
  let totalProjectedIncome = 0;
  let totalProjectedExpense = 0;
  let totalActualIncome = 0;
  let totalActualExpense = 0;

  const daily: CashFlowDay[] = daysBetween(startDate, endDate).map((current) => {
    const key = dateKey(current);
    const projected = projectedByDate.get(key) || [];
    const actual = actualByDate.get(key) || [];
    const projectedIncome = projected
      .filter((event) => event.type === "income")
      .reduce((sum, event) => sum + event.amount, 0);
    const projectedExpense = projected
      .filter((event) => event.type === "expense")
      .reduce((sum, event) => sum + event.amount, 0);
    const projectedNet = projectedIncome - projectedExpense;
    projectedBalance += projectedNet;
    totalProjectedIncome += projectedIncome;
    totalProjectedExpense += projectedExpense;

    const actualIncome = actual
      .filter((event) => event.type === "income")
      .reduce((sum, event) => sum + event.amount, 0);
    const actualExpense = actual
      .filter((event) => event.type === "expense")
      .reduce((sum, event) => sum + event.amount, 0);
    const actualNet = actualIncome - actualExpense;
    let actualBalanceForDay: number | null = null;
    let actualForecastBalanceForDay: number | null = null;
    let actualMode: CashFlowDay["actualMode"] = "future";

    if (cutoff && current <= cutoff) {
      actualBalance += actualNet;
      actualForecastBalance = actualBalance;
      actualForecastStarted = true;
      actualBalanceForDay = actualBalance;
      actualForecastBalanceForDay = actualBalance;
      actualMode = "actual";
      totalActualIncome += actualIncome;
      totalActualExpense += actualExpense;
    } else if (actualForecastStarted) {
      actualForecastBalance += projectedNet;
      actualForecastBalanceForDay = actualForecastBalance;
      actualMode = "forecastAfterActual";
    }

    if (projectedBalance < minCash) {
      minCash = projectedBalance;
      minCashDate = key;
    }
    if (projectedBalance < 0 && !firstNegativeDate) {
      firstNegativeDate = key;
      firstNegativeBalance = projectedBalance;
    }

    return {
      date: key,
      dayLabel: current.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      projectedIncome,
      projectedExpense,
      projectedNet,
      projectedBalance,
      actualIncome,
      actualExpense,
      actualNet,
      actualBalance: actualBalanceForDay,
      actualForecastBalance: actualForecastBalanceForDay,
      actualMode,
      projectedEvents: projected,
      actualEvents: actual,
    };
  });

  return {
    startDate: dateKey(startDate),
    endDate: dateKey(endDate),
    monthsCount: horizon,
    startingCash: numberValue(args.startingCash),
    endingCash: projectedBalance,
    endingActualForecast:
      [...daily].reverse().find((day) => day.actualForecastBalance != null)?.actualForecastBalance ??
      numberValue(args.startingCash),
    minCash,
    minCashDate,
    firstNegativeDate,
    firstNegativeBalance,
    cashNeedAmount: minCash < 0 ? Math.abs(minCash) : 0,
    totalProjectedIncome,
    totalProjectedExpense,
    projectedNet: totalProjectedIncome - totalProjectedExpense,
    totalActualIncome,
    totalActualExpense,
    actualNet: totalActualIncome - totalActualExpense,
    projectedEvents,
    actualEvents,
    daily,
  };
}

export type AttendanceRow = {
  student_name: string;
  class_name?: string | null;
  record_type?: string | null;
  status?: string | null;
  generates_makeup?: boolean | null;
  makeup_completed?: boolean | null;
};

export function attendanceSummary(rows: AttendanceRow[], studentNames: string[] = []) {
  const map = new Map<
    string,
    {
      studentName: string;
      className: string;
      records: number;
      classes: number;
      makeups: number;
      present: number;
      absent: number;
      absencesWithMakeup: number;
      usedMakeups: number;
      availableMakeups: number;
      pendingMakeups: number;
    }
  >();
  const get = (name: string) => {
    const existing = map.get(name);
    if (existing) return existing;
    const created = {
      studentName: name,
      className: "",
      records: 0,
      classes: 0,
      makeups: 0,
      present: 0,
      absent: 0,
      absencesWithMakeup: 0,
      usedMakeups: 0,
      availableMakeups: 2,
      pendingMakeups: 0,
    };
    map.set(name, created);
    return created;
  };
  studentNames.forEach(get);
  for (const row of rows) {
    const item = get(row.student_name);
    item.className ||= row.class_name || "";
    const type = String(row.record_type || "class").toLowerCase();
    const status = String(row.status || "present").toLowerCase();
    const makeup = type.includes("makeup") || type.includes("repos");
    const absent = status === "absent" || status === "ausente";
    item.records += 1;
    if (makeup) item.makeups += 1;
    else item.classes += 1;
    if (absent) item.absent += 1;
    else item.present += 1;
    if (absent && row.generates_makeup) item.absencesWithMakeup += 1;
    if (makeup && (row.makeup_completed || !absent)) item.usedMakeups += 1;
  }
  for (const item of map.values()) {
    item.availableMakeups = Math.max(0, 2 - item.usedMakeups);
    item.pendingMakeups = Math.max(0, item.absencesWithMakeup - item.usedMakeups);
  }
  return [...map.values()].sort((a, b) => a.studentName.localeCompare(b.studentName, "pt-BR"));
}

export function renovationSummary(
  rows: Array<{
    budget_amount?: number | string | null;
    actual_amount?: number | string | null;
    payment_status?: string | null;
    status?: string | null;
    category?: string | null;
  }>,
) {
  const byCategory = new Map<string, number>();
  let budgeted = 0;
  let actual = 0;
  let paid = 0;
  let pending = 0;
  for (const row of rows) {
    const budget = numberValue(row.budget_amount);
    const realized = numberValue(row.actual_amount);
    const base = realized || budget;
    budgeted += budget;
    actual += realized;
    const paidStatus = ["paid", "pago", "done", "concluido", "concluído"].includes(
      String(row.payment_status || row.status || "").toLowerCase(),
    );
    if (paidStatus) paid += realized;
    else pending += base;
    const category = row.category || "Sem categoria";
    byCategory.set(category, (byCategory.get(category) || 0) + base);
  }
  return {
    count: rows.length,
    budgeted,
    actual,
    variance: actual - budgeted,
    paid,
    pending,
    byCategory: [...byCategory].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };
}

export function calculateKilnCost(args: {
  lengthCm: number;
  depthCm: number;
  bufferLength?: number;
  bufferDepth?: number;
  ovenDiameter?: number;
  areaAdjustment?: number;
  resistanceCost?: number;
  resistanceBurns?: number;
  powerKw?: number;
  hours?: number;
  utilization?: number;
  kwhCost?: number;
  finalBuffer?: number;
}) {
  const length = numberValue(args.lengthCm);
  const depth = numberValue(args.depthCm);
  const pieceArea =
    Math.PI * ((length + 2 * numberValue(args.bufferLength ?? 1)) / 2) *
    ((depth + 2 * numberValue(args.bufferDepth ?? 1)) / 2);
  const ovenArea =
    Math.PI * Math.pow(numberValue(args.ovenDiameter ?? 45) / 2, 2) /
    Math.max(numberValue(args.areaAdjustment ?? 1), 0.0001);
  const usePercent = ovenArea ? pieceArea / ovenArea : 0;
  const resistanceUnit =
    numberValue(args.resistanceCost ?? 1200) / Math.max(numberValue(args.resistanceBurns ?? 100), 1);
  const energyTotal =
    numberValue(args.powerKw ?? 7.5) *
    numberValue(args.hours ?? 8) *
    numberValue(args.utilization ?? 0.7) *
    numberValue(args.kwhCost ?? 1);
  const energyCost = energyTotal * usePercent;
  const resistanceCost = resistanceUnit * usePercent;
  const bufferCost = (energyCost + resistanceCost) * numberValue(args.finalBuffer ?? 0.1);
  return {
    pieceArea,
    ovenArea,
    usePercent,
    energyCost,
    resistanceCost,
    bufferCost,
    unitCost: energyCost + resistanceCost + bufferCost,
    estimatedPiecesFullKiln: usePercent > 0 ? Math.floor(1 / usePercent) : 0,
  };
}

export function calculatePiecePrice(args: {
  clayWeightKg: number;
  clay10kgPrice?: number;
  glazeGrams: number;
  glazeCostPerGram?: number;
  bisqueCost: number;
  glazeFiringCost: number;
  kilnFiringProfitRate?: number;
  laborCost?: number;
  packagingCost?: number;
  otherDirectCosts?: number;
  customizationCost?: number;
  fixedAllocation?: number;
  lossRate?: number;
  desiredProfitRate?: number;
  paymentFeeRate?: number;
  taxRate?: number;
  expectedDiscountRate?: number;
  quantity?: number;
}) {
  const quantity = Math.max(1, numberValue(args.quantity ?? 1));
  const clayCost = numberValue(args.clayWeightKg) * (numberValue(args.clay10kgPrice ?? 77) / 10);
  const glazeCost = numberValue(args.glazeGrams) * numberValue(args.glazeCostPerGram ?? 1);
  const bisqueInternalCost = numberValue(args.bisqueCost);
  const glazeFiringInternalCost = numberValue(args.glazeFiringCost);
  const kilnProfitRate = Math.max(0, numberValue(args.kilnFiringProfitRate ?? 1));
  const bisqueFiringProfitValue = bisqueInternalCost * kilnProfitRate;
  const glazeFiringProfitValue = glazeFiringInternalCost * kilnProfitRate;
  const bisqueBillingCost = bisqueInternalCost + bisqueFiringProfitValue;
  const glazeFiringBillingCost = glazeFiringInternalCost + glazeFiringProfitValue;
  const laborCost = numberValue(args.laborCost);

  // Apps Script v55/v8: losses and desired profit apply only to production,
  // while labor is added afterwards and is not part of the desired-profit base.
  const productionBase =
    clayCost +
    glazeCost +
    bisqueBillingCost +
    glazeFiringBillingCost +
    numberValue(args.packagingCost) +
    numberValue(args.otherDirectCosts) +
    numberValue(args.customizationCost) +
    numberValue(args.fixedAllocation);
  const lossesCost = productionBase * Math.max(0, numberValue(args.lossRate));
  const productionCost = productionBase + lossesCost;
  const totalCostBeforeProfit = productionCost + laborCost;
  const desiredProfitValue = productionCost * Math.max(0, numberValue(args.desiredProfitRate));
  const subtotalBeforeFees = totalCostBeforeProfit + desiredProfitValue;
  const paymentFeeRate = Math.max(0, numberValue(args.paymentFeeRate));
  const taxRate = Math.max(0, numberValue(args.taxRate));
  const expectedDiscountRate = Math.max(0, numberValue(args.expectedDiscountRate));
  const denominator = 1 - paymentFeeRate - taxRate - expectedDiscountRate;
  const unitPrice = denominator > 0 ? subtotalBeforeFees / denominator : subtotalBeforeFees;
  const paymentFeeValue = unitPrice * paymentFeeRate;
  const taxValue = unitPrice * taxRate;
  const discountValue = unitPrice * expectedDiscountRate;
  const profitPerUnit =
    unitPrice - totalCostBeforeProfit - paymentFeeValue - taxValue - discountValue;

  return {
    clayCost,
    glazeCost,
    bisqueInternalCost,
    glazeFiringInternalCost,
    bisqueFiringProfitValue,
    glazeFiringProfitValue,
    bisqueBillingCost,
    glazeFiringBillingCost,
    firingBase: bisqueInternalCost + glazeFiringInternalCost,
    firingCharge: bisqueBillingCost + glazeFiringBillingCost,
    productionBase,
    lossesCost,
    productionCost,
    laborCost,
    directCost: totalCostBeforeProfit,
    lossAdjustedCost: totalCostBeforeProfit,
    desiredProfitValue,
    subtotalBeforeFees,
    paymentFeeValue,
    taxValue,
    discountValue,
    suggestedUnitPrice: unitPrice,
    suggestedTotalPrice: unitPrice * quantity,
    profitPerUnit,
    netMargin: unitPrice ? profitPerUnit / unitPrice : 0,
  };
}

export function calculateClassPieceCost(args: {
  quantity: number;
  clayWeightKg: number;
  clayUnitCost: number;
  glazeAmount: number;
  glazeUnitCost: number;
  lengthCm: number;
  depthCm: number;
  glazeCone?: string | null;
  firingSettings?: FiringSettingsLike | null;
  chargeBisque?: boolean;
  chargeGlaze?: boolean;
  kilnFiringProfitRate?: number;
  otherCosts?: number;
  marginRate?: number;
}) {
  const quantity = Math.max(1, Math.trunc(numberValue(args.quantity || 1)));
  const bisqueProfile = resolveFiringProfile(args.firingSettings, "biscuit", "Biscoito");
  const glazeProfile = resolveFiringProfile(args.firingSettings, "glaze", args.glazeCone || "6");
  const common = {
    lengthCm: numberValue(args.lengthCm),
    depthCm: numberValue(args.depthCm),
  };
  const bisque = calculateKilnCost({
    ...common,
    ovenDiameter: bisqueProfile.ovenDiameter,
    areaAdjustment: bisqueProfile.areaAdjustment,
    resistanceCost: bisqueProfile.resistanceCost,
    resistanceBurns: bisqueProfile.resistanceBurns,
    powerKw: bisqueProfile.powerKw,
    hours: bisqueProfile.hours,
    utilization: bisqueProfile.utilization,
    kwhCost: bisqueProfile.kwhCost,
    finalBuffer: bisqueProfile.finalBuffer,
  });
  const glaze = calculateKilnCost({
    ...common,
    ovenDiameter: glazeProfile.ovenDiameter,
    areaAdjustment: glazeProfile.areaAdjustment,
    resistanceCost: glazeProfile.resistanceCost,
    resistanceBurns: glazeProfile.resistanceBurns,
    powerKw: glazeProfile.powerKw,
    hours: glazeProfile.hours,
    utilization: glazeProfile.utilization,
    kwhCost: glazeProfile.kwhCost,
    finalBuffer: glazeProfile.finalBuffer,
  });
  const kilnProfit = Math.max(0, numberValue(args.kilnFiringProfitRate ?? 1));
  const bisqueBillingCost = args.chargeBisque === false ? 0 : bisque.unitCost * (1 + kilnProfit);
  const glazeBillingCost = args.chargeGlaze === false ? 0 : glaze.unitCost * (1 + kilnProfit);
  const clayCost = Math.max(0, numberValue(args.clayWeightKg)) * Math.max(0, numberValue(args.clayUnitCost));
  const glazeCost = Math.max(0, numberValue(args.glazeAmount)) * Math.max(0, numberValue(args.glazeUnitCost));
  const unitTotal = clayCost + glazeCost + bisqueBillingCost + glazeBillingCost + Math.max(0, numberValue(args.otherCosts));
  const totalCost = unitTotal * quantity;
  const chargeAmount = totalCost * (1 + Math.max(0, numberValue(args.marginRate)));
  return {
    quantity,
    clayCost,
    glazeCost,
    bisqueInternalCost: bisque.unitCost,
    glazeInternalCost: glaze.unitCost,
    bisqueBillingCost,
    glazeBillingCost,
    otherCosts: Math.max(0, numberValue(args.otherCosts)),
    unitTotal,
    totalCost,
    chargeAmount,
    kilnUsePercent: Math.max(bisque.usePercent, glaze.usePercent),
    bisqueProfile,
    glazeProfile,
  };
}

export function calculateWorkshop(args: {
  attendees: number;
  pricePerPerson: number;
  fixedCosts?: number;
  variableCostPerPerson?: number;
  paymentFeeRate?: number;
  taxRate?: number;
  surpriseRate?: number;
}) {
  const attendees = Math.max(0, Math.trunc(numberValue(args.attendees)));
  const grossRevenue = attendees * numberValue(args.pricePerPerson);
  const variableCosts = attendees * numberValue(args.variableCostPerPerson);
  const fixedCosts = numberValue(args.fixedCosts);
  const operationalCost = fixedCosts + variableCosts;
  const surpriseRate = Math.max(0, numberValue(args.surpriseRate));
  const feeRate = Math.max(0, numberValue(args.paymentFeeRate)) + Math.max(0, numberValue(args.taxRate));
  const surprise = operationalCost * surpriseRate;
  const fees = grossRevenue * feeRate;
  const totalCost = operationalCost + surprise + fees;
  const profit = grossRevenue - totalCost;
  const effectiveFixedCosts = fixedCosts * (1 + surpriseRate);
  const effectiveVariableCostPerPerson =
    numberValue(args.variableCostPerPerson) * (1 + surpriseRate) +
    numberValue(args.pricePerPerson) * feeRate;
  const contributionPerPerson =
    numberValue(args.pricePerPerson) - effectiveVariableCostPerPerson;
  return {
    attendees,
    grossRevenue,
    fixedCosts,
    variableCosts,
    surprise,
    fees,
    totalCost,
    profit,
    effectiveFixedCosts,
    effectiveVariableCostPerPerson,
    contributionPerPerson,
    marginPercent: grossRevenue ? (profit / grossRevenue) * 100 : 0,
    breakEvenAttendees:
      contributionPerPerson > 0
        ? Math.ceil(effectiveFixedCosts / contributionPerPerson)
        : null,
  };
}
