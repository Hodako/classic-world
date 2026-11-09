/**
 * salary-utils.ts
 * Cumulative Employee Salary & Advance Calculation with Month-to-Month Rollover
 * Automatically rolls over remaining unpaid salary or excess advance debt into the next month.
 */

export interface EmployeeSalaryCalculation {
  baseSalary: number;
  advanceLimit: number;
  carriedForwardBalance: number; // Unpaid salary (+) or debt (-) from prior months
  totalAccruedSalary: number; // baseSalary + max(0, carriedForwardBalance)
  thisMonthAdvances: number; // Cash advances taken this month
  thisMonthPaidSalaries: number; // Official salary payments received this month
  thisMonthDailySpends: number; // Food/tea/daily spends recorded for employee
  thisMonthShopDed: number; // Shop shopping deductions
  thisMonthTotalDeductions: number;
  remainingSalary: number; // Final remaining salary payable to employee
  remainingAdvanceLimit: number; // How much advance employee is still permitted to take
  employeeOwesStore: number; // If advances exceeded accrued salary, how much employee owes store
}

export function calculateEmployeeSalaryWithRollover(
  emp: any,
  expenses: any[] = [],
  salaries: any[] = [],
  shoppings: any[] = [],
  targetMonthStr?: string
): EmployeeSalaryCalculation {
  const targetMonth = targetMonthStr || new Date().toISOString().slice(0, 7);
  const baseSalary = Number(emp?.base_salary || emp?.monthly_salary || 0);
  const advanceLimit = emp?.advance_limit !== undefined && emp?.advance_limit !== null
    ? Number(emp.advance_limit)
    : baseSalary;

  const empId = emp?.id;
  const empName = (emp?.name || emp?.full_name || "").toLowerCase().trim();

  const isMyRecord = (item: any) => {
    if (empId && item?.employee_id === empId) return true;
    if (empName && item?.employee_name && item.employee_name.toLowerCase().trim() === empName) return true;
    return false;
  };

  // Helper to extract "YYYY-MM"
  const getMonth = (item: any) => {
    if (item?.month && typeof item.month === "string" && item.month.length >= 7) {
      return item.month.slice(0, 7);
    }
    const d = item?.date || item?.created_at || item?.createdAt || "";
    return typeof d === "string" && d.length >= 7 ? d.slice(0, 7) : "";
  };

  // 1. Gather all unique historical months prior to targetMonth
  const priorMonthsSet = new Set<string>();
  const allEmpExpenses = expenses.filter(isMyRecord);
  const allEmpSalaries = salaries.filter(isMyRecord);
  const allEmpShoppings = shoppings.filter(isMyRecord);

  for (const it of allEmpExpenses) {
    const m = getMonth(it);
    if (m && m < targetMonth) priorMonthsSet.add(m);
  }
  for (const it of allEmpSalaries) {
    const m = getMonth(it);
    if (m && m < targetMonth) priorMonthsSet.add(m);
  }
  for (const it of allEmpShoppings) {
    const m = getMonth(it);
    if (m && m < targetMonth) priorMonthsSet.add(m);
  }

  // If joining_date is present, include months from joining_date up to targetMonth
  if (emp?.joining_date && typeof emp.joining_date === "string" && emp.joining_date.length >= 7) {
    const joinMonth = emp.joining_date.slice(0, 7);
    let curr = joinMonth;
    while (curr < targetMonth) {
      priorMonthsSet.add(curr);
      const [y, m] = curr.split("-").map(Number);
      const nextDate = new Date(y, m, 1);
      curr = nextDate.toISOString().slice(0, 7);
    }
  }

  // 2. Compute cumulative balance rolled over from all prior months
  let carriedForwardBalance = 0;
  const sortedPriorMonths = Array.from(priorMonthsSet).sort();

  for (const m of sortedPriorMonths) {
    // Earnings for that month = base salary
    const monthBase = baseSalary;

    // Payments / advances taken in that month
    const monthSalPaid = allEmpSalaries
      .filter(s => getMonth(s) === m && !(s as any).is_bonus && s.status !== "bonus")
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const monthAdvances = allEmpExpenses
      .filter(e => getMonth(e) === m && (e.category === "advance" || e.category === "salary_advance" || e.type === "advance"))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const monthDailySpends = allEmpExpenses
      .filter(e => getMonth(e) === m && e.category !== "advance" && e.category !== "salary_advance" && e.category !== "bonus" && e.category !== "debt_repayment" && e.category !== "adjustment_add" && e.category !== "adjustment_deduct")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const monthShopDeductions = allEmpShoppings
      .filter(s => getMonth(s) === m && s.payment_status === "deduct_from_salary" && !s.is_settled && !s.settled)
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    const monthAdjustmentsAdd = allEmpExpenses
      .filter(e => getMonth(e) === m && e.category === "adjustment_add")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const monthAdjustmentsDeduct = allEmpExpenses
      .filter(e => getMonth(e) === m && e.category === "adjustment_deduct")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const monthDebtRepaid = allEmpExpenses
      .filter(e => getMonth(e) === m && e.category === "debt_repayment")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const monthEarnings = monthBase + monthAdjustmentsAdd + monthDebtRepaid;
    const monthDeductions = monthSalPaid + monthAdvances + monthDailySpends + monthShopDeductions + monthAdjustmentsDeduct;

    // Monthly delta: positive means unpaid salary store owes employee; negative means excess advance
    const monthNet = monthEarnings - monthDeductions;
    carriedForwardBalance += monthNet;
  }

  // 3. Current Target Month Calculations
  const thisMonthAdvances = allEmpExpenses
    .filter(e => getMonth(e) === targetMonth && (e.category === "advance" || e.category === "salary_advance" || e.type === "advance"))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const thisMonthPaidSalaries = allEmpSalaries
    .filter(s => getMonth(s) === targetMonth && !(s as any).is_bonus && s.status !== "bonus")
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const thisMonthDailySpends = allEmpExpenses
    .filter(e => getMonth(e) === targetMonth && e.category !== "advance" && e.category !== "salary_advance" && e.category !== "bonus" && e.category !== "debt_repayment" && e.category !== "adjustment_add" && e.category !== "adjustment_deduct")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const thisMonthShopDed = allEmpShoppings
    .filter(s => getMonth(s) === targetMonth && s.payment_status === "deduct_from_salary" && !s.is_settled && !s.settled)
    .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

  const thisMonthAdjustmentsAdd = allEmpExpenses
    .filter(e => getMonth(e) === targetMonth && e.category === "adjustment_add")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const thisMonthAdjustmentsDeduct = allEmpExpenses
    .filter(e => getMonth(e) === targetMonth && e.category === "adjustment_deduct")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const thisMonthDebtRepaid = allEmpExpenses
    .filter(e => getMonth(e) === targetMonth && e.category === "debt_repayment")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Total accrued salary for this month = Base Salary + Prior Month Rollover (positive) - Prior Month Debt (negative)
  const totalAccruedSalary = Math.max(0, baseSalary + carriedForwardBalance + thisMonthAdjustmentsAdd + thisMonthDebtRepaid);

  const thisMonthTotalDeductions = thisMonthAdvances + thisMonthPaidSalaries + thisMonthDailySpends + thisMonthShopDed + thisMonthAdjustmentsDeduct;

  const netBalanceThisMonth = (baseSalary + carriedForwardBalance + thisMonthAdjustmentsAdd + thisMonthDebtRepaid) - thisMonthTotalDeductions;

  const remainingSalary = netBalanceThisMonth > 0 ? netBalanceThisMonth : 0;
  const employeeOwesStore = netBalanceThisMonth < 0 ? Math.abs(netBalanceThisMonth) : 0;

  // Remaining advance limit allowed for this month
  const remainingAdvanceLimit = Math.max(0, advanceLimit - thisMonthAdvances);

  return {
    baseSalary,
    advanceLimit,
    carriedForwardBalance,
    totalAccruedSalary,
    thisMonthAdvances,
    thisMonthPaidSalaries,
    thisMonthDailySpends,
    thisMonthShopDed,
    thisMonthTotalDeductions,
    remainingSalary,
    remainingAdvanceLimit,
    employeeOwesStore,
  };
}
