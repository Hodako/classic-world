"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Wallet,
  ArrowDownLeft,
  Banknote,
  Receipt,
  Calendar,
  Clock,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
  RotateCcw,
  User,
  ArrowLeft,
  Lock,
  Unlock,
  Info,
  DollarSign,
  TrendingDown,
} from "lucide-react";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import { cashboxBalance } from "@/lib/cashbox-utils";
import {
  getEmployees,
  getEmployeeExpenses,
  getEmployeeSalaries,
  type Employee,
  type EmployeeExpense,
} from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { fmtMoney, fmtDateTime, fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createEmployeeExpenseFn, deleteEmployeeExpenseFn } from "@/lib/rpc";
import { useQueryClient } from "@tanstack/react-query";

export default function EmployeeHubPage() {
  const { lang } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();

  const isOwner = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";
  const currentEmpId = (user as any)?.employee_id || user?.id;

  const employeesQuery = useCachedQuery(["employees"], getEmployees);
  const employeeExpensesQuery = useCachedQuery(["employee_expenses"], getEmployeeExpenses);
  const employeeSalariesQuery = useCachedQuery(["employee_salaries"], getEmployeeSalaries);
  const { data: cashEntries = [] } = useCashboxQuery();

  const currentCashBalance = useMemo(() => cashboxBalance(cashEntries), [cashEntries]);

  const allEmployees: Employee[] = employeesQuery.data ?? [];
  const allExpenses: EmployeeExpense[] = employeeExpensesQuery.data ?? [];

  // Filter to active employee if role is employee, or allow selection if owner
  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => {
    if (!isOwner && currentEmpId) return currentEmpId;
    return allEmployees[0]?.id || "";
  });

  const activeEmployee = useMemo(() => {
    if (!isOwner) {
      return (
        allEmployees.find(e => e.id === currentEmpId || (e as any).user_id === user?.id || e.email === user?.email) ||
        ({
          id: currentEmpId,
          name: user?.full_name || "Employee",
          monthly_salary: (user as any)?.monthly_salary || 0,
        } as any)
      );
    }
    return allEmployees.find(e => e.id === selectedEmpId) || allEmployees[0] || null;
  }, [allEmployees, isOwner, currentEmpId, selectedEmpId, user]);

  // Current Month String (YYYY-MM)
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  // Filter expenses (taken money / advances)
  const employeeAdvances = useMemo(() => {
    return allExpenses.filter(e => {
      const isAdvance =
        e.category === "advance" ||
        e.category === "salary_advance" ||
        (e as any).type === "advance";
      if (!isAdvance) return false;
      if (activeEmployee?.id) {
        return e.employee_id === activeEmployee.id;
      }
      return true;
    });
  }, [allExpenses, activeEmployee]);

  // Taken money this current month
  const thisMonthTaken = useMemo(() => {
    return employeeAdvances
      .filter(e => {
        const d = e.date || (e.created_at ? e.created_at.slice(0, 10) : "");
        return d.startsWith(currentMonth);
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [employeeAdvances, currentMonth]);

  const baseSalary = Number(activeEmployee?.monthly_salary || activeEmployee?.base_salary) || 0;
  const advanceLimit = activeEmployee?.advance_limit !== undefined && activeEmployee?.advance_limit !== null
    ? Number(activeEmployee.advance_limit)
    : baseSalary;
  const remainingLimit = Math.max(0, advanceLimit - thisMonthTaken);
  const remainingSalary = Math.max(0, baseSalary - thisMonthTaken);

  // Form states for taking money
  const [takeMoneyOpen, setTakeMoneyOpen] = useState(false);
  const [takeAmount, setTakeAmount] = useState("");
  const [takeNote, setTakeNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  // Owner Edit / Delete state
  const [editingExpense, setEditingExpense] = useState<EmployeeExpense | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleTakeMoneySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(takeAmount);
    if (!amountNum || amountNum <= 0) {
      toast.error(lang === "bn" ? "সঠিক টাকার পরিমাণ লিখুন" : "Please enter a valid amount");
      return;
    }

    if (!isOwner && remainingLimit <= 0) {
      toast.error(
        lang === "bn"
          ? `আপনার এই মাসের টাকা তোলার নির্ধারিত সীমা শেষ হয়ে গেছে! (সর্বোচ্চ সীমা: ৳${advanceLimit.toLocaleString()}, উত্তোলিত: ৳${thisMonthTaken.toLocaleString()})`
          : `You have reached your advance withdrawal limit for this month!`
      );
      return;
    }

    if (!isOwner && amountNum > remainingLimit) {
      toast.error(
        lang === "bn"
          ? `আপনার অনুমোদিত উত্তোলনের সীমা (৳${remainingLimit.toLocaleString()}) অতিক্রম করেছে! সর্বোচ্চ ৳${remainingLimit.toLocaleString()} নিতে পারবেন।`
          : `Exceeds your allowed advance withdrawal limit of ৳${remainingLimit.toLocaleString()}!`
      );
      return;
    }

    if (paymentMethod === "cash" && amountNum > currentCashBalance) {
      toast.warning(
        lang === "bn"
          ? `সতর্কতা: ক্যাশবক্সে পর্যাপ্ত টাকা নেই (বর্তমান ব্যালেন্স: ৳${currentCashBalance.toLocaleString()})`
          : `Warning: Cashbox balance is lower than requested (Current: ৳${currentCashBalance.toLocaleString()})`
      );
    }

    const empId = activeEmployee?.id || currentEmpId;
    const empName = activeEmployee?.name || user?.full_name || "Employee";

    setSubmitting(true);
    try {
      await createEmployeeExpenseFn({
        data: {
          employee_id: empId,
          employee_name: empName,
          category: "advance",
          amount: amountNum,
          payment_method: paymentMethod,
          note: takeNote.trim() || (lang === "bn" ? "কর্মচারী অগ্রিম টাকা উত্তোলন" : "Employee salary advance withdrawal"),
          date: new Date().toISOString().slice(0, 10),
          month: currentMonth,
          taken_by: user?.full_name || empName,
          created_at: new Date().toISOString(),
        },
      });

      toast.success(
        lang === "bn"
          ? `৳${amountNum.toLocaleString()} টাকা সফলভাবে উত্তোলন করা হয়েছে! ক্যাশবক্স ও অবশিষ্ট বেতন থেকে কাটা হয়েছে।`
          : `৳${amountNum.toLocaleString()} successfully withdrawn! Deducted from cashbox and salary.`
      );

      setTakeAmount("");
      setTakeNote("");
      setTakeMoneyOpen(false);

      // Invalidate relevant queries
      void qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      void qc.invalidateQueries({ queryKey: ["cashbox"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to process withdrawal");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!isOwner) {
      toast.error(lang === "bn" ? "শুধুমাত্র দোকান মালিক এই রেকর্ড মুছতে পারবেন।" : "Only store owner can delete this record.");
      return;
    }
    setSubmitting(true);
    try {
      await deleteEmployeeExpenseFn({ data: { id } });
      toast.success(lang === "bn" ? "রেকর্ডটি মুছে ফেলা হয়েছে এবং সমন্বয় করা হয়েছে।" : "Record deleted and reconciled.");
      setDeletingId(null);
      void qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      void qc.invalidateQueries({ queryKey: ["cashbox"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto px-2 sm:px-4 pt-2">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/60 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="outline" size="icon" className="size-9 rounded-xl border-border/80 hover:bg-muted">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                <Users className="size-6 text-indigo-600" />
                {lang === "bn" ? "এমপ্লয়ি হাব ও বেতন উত্তোলন" : "Employee Hub & Salary Advances"}
              </h1>
              <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs px-2 py-0.5 font-bold">
                {isOwner ? (lang === "bn" ? "মালিক মোড" : "Owner Control") : (lang === "bn" ? "স্টাফ মোড" : "Staff Mode")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "bn"
                ? "কর্মচারী এখান থেকে অগ্রিম টাকা উত্তোলন করতে পারবেন। টাকা সরাসরি ক্যাশবক্স এবং বেতন থেকে কাটা হবে।"
                : "Employees take salary advances here. Auto-deducted from cashbox and remaining salary as expenses."}
            </p>
          </div>
        </div>

        {/* Action Button: Take Money */}
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && allEmployees.length > 1 && (
            <select
              value={selectedEmpId}
              onChange={e => setSelectedEmpId(e.target.value)}
              className="h-9 px-3 text-xs rounded-xl bg-card border border-border font-bold cursor-pointer"
            >
              {allEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({fmtMoney(emp.monthly_salary || 0)})
                </option>
              ))}
            </select>
          )}

          <Button
            onClick={() => setTakeMoneyOpen(true)}
            size="sm"
            className="rounded-xl h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm"
          >
            <ArrowDownLeft className="size-4" />
            <span>{lang === "bn" ? "টাকা উত্তোলন করুন (অগ্রিম)" : "Take Money / Advance"}</span>
          </Button>
        </div>
      </div>

      {/* ── Employee Personal KPI (কর্মচারী ব্যক্তিগত কেপিআই) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2 text-foreground">
            <Users className="size-4 text-indigo-600" />
            <span>{lang === "bn" ? "কর্মচারী ব্যক্তিগত কেপিআই" : "Employee Personal KPI"}</span>
          </h2>
          <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/20 font-bold">
            {activeEmployee?.designation || "Staff"} · {activeEmployee?.name || user?.full_name || "Employee"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-3.5 rounded-2xl border-indigo-500/20 bg-indigo-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "কর্মচারী" : "Staff"}</span>
            <User className="size-4 text-indigo-500" />
          </div>
          <div className="text-base sm:text-lg font-black text-foreground truncate">
            {activeEmployee?.name || user?.full_name || "Employee"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {lang === "bn" ? "মূল বেতন:" : "Salary:"} {fmtMoney(baseSalary)}
          </div>
        </Card>

        <Card className="p-3.5 rounded-2xl border-amber-500/20 bg-amber-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "উত্তোলনের মোট সীমা" : "Advance Limit"}</span>
            <DollarSign className="size-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400">
            {fmtMoney(advanceLimit)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {lang === "bn" ? "নির্ধারিত অগ্রিম সীমা" : "Max allowed per month"}
          </div>
        </Card>

        <Card className="p-3.5 rounded-2xl border-rose-500/20 bg-rose-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "উত্তোলিত মোট টাকা" : "Total Taken"}</span>
            <TrendingDown className="size-4 text-rose-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400">
            {fmtMoney(thisMonthTaken)}
          </div>
          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
            {lang === "bn" ? "এই মাসে নিয়েছেন" : "Taken this month"}
          </div>
        </Card>

        <Card className="p-3.5 rounded-2xl border-purple-500/20 bg-purple-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "এখন তুলতে পারবেন" : "Allowed to Take"}</span>
            <Banknote className="size-4 text-purple-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-purple-600 dark:text-purple-400">
            {fmtMoney(remainingLimit)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {remainingLimit <= 0
              ? (lang === "bn" ? "সীমা শেষ" : "Limit reached")
              : (lang === "bn" ? "অবশিষ্ট উত্তোলনের সুযোগ" : "Available to withdraw")}
          </div>
        </Card>

        <Card className="p-3.5 rounded-2xl border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "অবশিষ্ট বেতন" : "Remaining Salary"}</span>
            <Wallet className="size-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400">
            {fmtMoney(remainingSalary)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
            <span>{lang === "bn" ? "মাস শেষে প্রাপ্য" : "Month end"}</span>
            <span className="text-teal-600 font-bold">ক্যাশ: {fmtMoney(currentCashBalance)}</span>
          </div>
        </Card>
      </div>
      </div>

      {/* ── Security / Permission Notice Strip ── */}
      <div className="p-3.5 rounded-2xl bg-muted/50 border border-border/80 flex items-start gap-3">
        <div className="size-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
          <Lock className="size-4" />
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">
            {lang === "bn" ? "নিরাপত্তা ও হিসাব নীতি:" : "Security & Audit Policy:"}
          </span>{" "}
          {lang === "bn"
            ? "কর্মচারী নিজে এই পৃষ্ঠা থেকে অগ্রিম টাকা উত্তোলন এন্ট্রি দিতে পারবেন যা ক্যাশবক্স ও চলতি মাসের অবশিষ্ট বেতন থেকে স্বয়ংক্রিয়ভাবে খরচ হিসেবে গণ্য হবে। তবে হিসাবের নিরাপত্তার স্বার্থে উত্তোলিত টাকার রেকর্ড শুধুমাত্র দোকানের মূল মালিক (Owner) সংশোধন বা মুছতে পারবেন।"
            : "Employees can log salary advances here which auto-deducts from cashbox and remaining salary as an expense. For financial security, advance withdrawal records can ONLY be edited or deleted by the store owner."}
        </div>
      </div>

      {/* ── Taken Money / Advance History Table ── */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <Receipt className="size-4 text-indigo-600" />
              {lang === "bn" ? "টাকা উত্তোলন ও অগ্রিমের রেকর্ড ইতিহাস" : "Salary Advance & Withdrawal History"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {employeeAdvances.length} {lang === "bn" ? "টি উত্তোলন রেকর্ড পাওয়া গেছে" : "withdrawal transactions on file"}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => employeeExpensesQuery.refetch()}
            className="rounded-xl h-8 text-xs gap-1.5"
          >
            <RotateCcw className={`size-3.5 ${employeeExpensesQuery.isFetching ? "animate-spin" : ""}`} />
            {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
          </Button>
        </div>

        {employeeAdvances.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground space-y-2">
            <Wallet className="size-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-semibold">
              {lang === "bn" ? "এখনো কোনো অগ্রিম টাকা উত্তোলন করা হয়নি" : "No salary advances recorded yet"}
            </p>
            <p className="text-xs">
              {lang === "bn" ? "উপরে 'টাকা উত্তোলন করুন' বাটনে চাপ দিয়ে অগ্রিম টাকা এন্ট্রি করুন।" : "Click 'Take Money / Advance' above to log a withdrawal."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">{lang === "bn" ? "তারিখ ও সময়" : "Date & Time"}</th>
                  <th className="py-2.5 px-3">{lang === "bn" ? "কর্মচারী" : "Staff Name"}</th>
                  <th className="py-2.5 px-3 text-right">{lang === "bn" ? "পরিমাণ (টাকা)" : "Amount"}</th>
                  <th className="py-2.5 px-3 text-center">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Method"}</th>
                  <th className="py-2.5 px-3">{lang === "bn" ? "কারণ / বিবরণ" : "Note / Purpose"}</th>
                  <th className="py-2.5 px-3 text-center">{lang === "bn" ? "অ্যাকশন" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {employeeAdvances.map(exp => (
                  <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-3 whitespace-nowrap text-muted-foreground font-medium">
                      {fmtDateTime(exp.created_at || exp.date)}
                    </td>
                    <td className="py-3 px-3 font-bold text-foreground">
                      {exp.employee_name || activeEmployee?.name || "Employee"}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-rose-600 dark:text-rose-400 text-sm">
                      {fmtMoney(exp.amount)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant="secondary" className="text-[10px] uppercase font-bold px-2 py-0.5">
                        {exp.payment_method || "cash"}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-muted-foreground line-clamp-1 max-w-xs">
                      {exp.note || (lang === "bn" ? "অগ্রিম উত্তোলন" : "Salary advance")}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {isOwner ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="size-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                            title={lang === "bn" ? "মুছুন (শুধুমাত্র মালিক)" : "Delete (Owner only)"}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                          <Lock className="size-2.5" />
                          {lang === "bn" ? "লক করা" : "Locked"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Take Money Dialog Modal ── */}
      <Dialog open={takeMoneyOpen} onOpenChange={setTakeMoneyOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ArrowDownLeft className="size-5 text-indigo-600" />
              {lang === "bn" ? "টাকা উত্তোলন করুন (অগ্রিম বেতন)" : "Take Money (Salary Advance)"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "bn"
                ? `কর্মচারী: ${activeEmployee?.name || user?.full_name || "Employee"} • ক্যাশবক্স থেকে টাকা কাটা হবে`
                : `Staff: ${activeEmployee?.name || user?.full_name || "Employee"} • Auto-deducted from Cashbox`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTakeMoneySubmit} className="space-y-4 pt-2">
            {/* Advance Limit Status Banner */}
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              remainingLimit > 0
                ? "bg-purple-500/10 border-purple-500/25 text-purple-700 dark:text-purple-300"
                : "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300"
            }`}>
              <div className="flex items-center gap-1.5 font-bold">
                <Banknote className="size-4 shrink-0" />
                <span>{lang === "bn" ? "টাকা তোলার অবশিষ্ট সুযোগ:" : "Available Advance Limit:"}</span>
              </div>
              <span className="font-black text-sm font-mono">
                {fmtMoney(remainingLimit)}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  {lang === "bn" ? "উত্তোলনের পরিমাণ (টাকা) *" : "Withdrawal Amount (৳) *"}
                </Label>
                {!isOwner && (
                  <span className="text-[10px] text-muted-foreground">
                    {lang === "bn" ? `সর্বোচ্চ সীমা: ${fmtMoney(remainingLimit)}` : `Max Limit: ${fmtMoney(remainingLimit)}`}
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">৳</span>
                <Input
                  type="number"
                  min="1"
                  max={!isOwner ? remainingLimit : undefined}
                  required
                  placeholder="0"
                  value={takeAmount}
                  onChange={e => setTakeAmount(e.target.value)}
                  className="pl-8 text-lg font-black rounded-xl h-11"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                <span>{lang === "bn" ? "ক্যাশবক্স ব্যালেন্স:" : "Cashbox:"} {fmtMoney(currentCashBalance)}</span>
                <span>{lang === "bn" ? "অবশিষ্ট বেতন:" : "Remaining Salary:"} {fmtMoney(remainingSalary)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {["cash", "bkash", "bank"].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all text-center capitalize ${
                      paymentMethod === m
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m === "cash" ? (lang === "bn" ? "ক্যাশ (নগদ)" : "Cash") : m === "bkash" ? "bKash" : "Bank"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {lang === "bn" ? "উত্তোলনের কারণ বা নোট (ঐচ্ছিক)" : "Reason / Purpose Note"}
              </Label>
              <Input
                placeholder={lang === "bn" ? "যেমন: জরুরি হাতখরচ, পরিবারের খরচ ইত্যাদি..." : "e.g. Daily allowance, urgent expense..."}
                value={takeNote}
                onChange={e => setTakeNote(e.target.value)}
                className="text-xs rounded-xl h-9"
              />
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setTakeMoneyOpen(false)} className="rounded-xl">
                {lang === "bn" ? "বাতিল" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={submitting || !takeAmount}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl gap-2"
              >
                {submitting ? (lang === "bn" ? "প্রসেস হচ্ছে..." : "Processing...") : (lang === "bn" ? "নিশ্চিত করুন ও টাকা নিন" : "Confirm & Take Money")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
