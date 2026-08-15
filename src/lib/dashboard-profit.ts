export type MonthlyProfit = {
  month: number;
  balance: number;
};

/**
 * Returns the selected month's profit and the arithmetic monthly average from
 * January through the selected month. Months without transactions count as
 * zero, matching the ordinary meaning of year-to-date monthly average.
 */
export function profitThroughSelectedMonth(monthly: MonthlyProfit[], selectedMonth: number) {
  const safeMonth = Math.max(1, Math.min(12, Math.trunc(selectedMonth) || 1));
  const balances = new Map(
    monthly
      .filter((item) => Number.isFinite(item.month) && Number.isFinite(item.balance))
      .map((item) => [item.month, item.balance]),
  );
  const selectedProfit = balances.get(safeMonth) ?? 0;
  let yearToDateProfit = 0;
  for (let month = 1; month <= safeMonth; month += 1) {
    yearToDateProfit += balances.get(month) ?? 0;
  }
  return {
    selectedProfit,
    yearToDateProfit,
    averageMonthlyProfit: yearToDateProfit / safeMonth,
    monthsIncluded: safeMonth,
  };
}
