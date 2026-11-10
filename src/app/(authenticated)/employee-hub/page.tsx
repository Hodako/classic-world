"use client";

import { useState, useMemo, useEffect } from "react";
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
  Gift,
  Sparkles,
  ShoppingBag,
  CreditCard,
  KeyRound,
  Phone,
  Mail,
  Search,
  Filter,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Smartphone,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import { cashboxBalance } from "@/lib/cashbox-utils";
import { calculateEmployeeSalaryWithRollover } from "@/lib/salary-utils";
import {
  getEmployees,
  getSales,
  getEmployeeExpenses,
  getEmployeeSalaries,
  getEmployeeShoppings,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  createEmployeeExpenseFn,
  deleteEmployeeExpenseFn,
  addEmployeeFn,
  updateEmployeeFn,
  deleteEmployeeFn,
  createEmployeeSalaryFn,
} from "@/lib/rpc";
import { OwnerEmployeeDeviceLink } from "@/components/employee-device-link";
import { useQueryClient } from "@tanstack/react-query";

export default function EmployeeHubPage() {
  const { lang, t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();

  const activeEmpSession = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem("cw_active_employee_session") || "null");
    } catch {
      return null;
    }
  }, []);

  const isEmployeeRole = user?.role === "employee" || Boolean(activeEmpSession);
  const isOwner = (user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin") && !activeEmpSession;
  const currentEmpId = (user as any)?.employee_id || user?.id;

  // Active Main Tab State
  const [activeTab, setActiveTab] = useState<"management" | "advances" | "salaries" | "gifts" | "performance">(
    isOwner ? "management" : "advances"
  );

  // Queries
  const employeesQuery = useCachedQuery(["employees"], getEmployees);
  const employeeExpensesQuery = useCachedQuery(["employee_expenses"], getEmployeeExpenses);
  const employeeSalariesQuery = useCachedQuery(["employee_salaries"], getEmployeeSalaries);
  const employeeShoppingsQuery = useCachedQuery(["employee_shoppings"], getEmployeeShoppings);
  const { data: allSales = [] } = useCachedQuery(["sales"], getSales);
  const { data: cashEntries = [] } = useCashboxQuery();

  const currentCashBalance = useMemo(() => cashboxBalance(cashEntries), [cashEntries]);

  const allEmployees: Employee[] = employeesQuery.data ?? [];
  const allExpenses: EmployeeExpense[] = employeeExpensesQuery.data ?? [];
  const allSalaries = employeeSalariesQuery.data ?? [];
  const allShoppings = employeeShoppingsQuery.data ?? [];

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => {
    if (!isOwner && currentEmpId) return currentEmpId;
    return allEmployees[0]?.id || "";
  });

  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const activeEmployee = useMemo(() => {
    if (activeEmpSession) {
      const match = allEmployees.find(e => e.id === activeEmpSession.id || (e.name && e.name.toLowerCase() === activeEmpSession.name?.toLowerCase()));
      if (match) return match;
      return {
        id: activeEmpSession.id,
        name: activeEmpSession.name || "Employee",
        monthly_salary: activeEmpSession.base_salary || 0,
        base_salary: activeEmpSession.base_salary || 0,
        advance_limit: activeEmpSession.advance_limit || activeEmpSession.base_salary || 0,
      } as any;
    }
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
  }, [allEmployees, isOwner, activeEmpSession, currentEmpId, selectedEmpId, user]);

  // Overall Store Staff Overview Aggregations
  const totalBaseSalaries = useMemo(() => {
    return allEmployees.reduce((sum, e) => sum + (Number(e.base_salary || e.monthly_salary) || 0), 0);
  }, [allEmployees]);

  const totalMonthlyAdvances = useMemo(() => {
    return allExpenses
      .filter(e => {
        const isAdv = e.category === "advance" || e.category === "salary_advance" || (e as any).type === "advance";
        if (!isAdv) return false;
        const d = e.date || (e.created_at ? e.created_at.slice(0, 7) : "");
        return d.startsWith(currentMonth);
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [allExpenses, currentMonth]);

  const totalGiftsGiven = useMemo(() => {
    const giftsFromExpenses = allExpenses
      .filter(e => {
        const isGift = e.category === "bonus" || e.category === "gift";
        if (!isGift) return false;
        const d = e.date || (e.created_at ? e.created_at.slice(0, 7) : "");
        return d.startsWith(currentMonth);
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const giftsFromShoppings = allShoppings
      .filter(s => {
        if (s.payment_status !== "gift") return false;
        const d = s.date || (s.created_at ? s.created_at.slice(0, 7) : "");
        return d.startsWith(currentMonth);
      })
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    return giftsFromExpenses + giftsFromShoppings;
  }, [allExpenses, allShoppings, currentMonth]);

  const totalStaffSalesToday = useMemo(() => {
    return allSales
      .filter(s => {
        if (s.returned) return false;
        const isStaff = Boolean((s as any).employee_id || (s as any).employee_name);
        const d = (s.created_at || "").slice(0, 10);
        return isStaff && d === todayStr;
      })
      .reduce((sum, s) => sum + Number(s.sell_price || 0) * (Number(s.qty) || 1), 0);
  }, [allSales, todayStr]);

  const activeEmployeesCount = useMemo(() => {
    return allEmployees.filter(e => e.status !== "inactive").length;
  }, [allEmployees]);

  // Active Employee Individual Rollover & Calculations
  const salaryRollover = useMemo(() => {
    if (!activeEmployee) return null;
    return calculateEmployeeSalaryWithRollover(
      activeEmployee,
      allExpenses,
      allSalaries,
      allShoppings,
      currentMonth
    );
  }, [activeEmployee, allExpenses, allSalaries, allShoppings, currentMonth]);

  const baseSalary = Number(activeEmployee?.monthly_salary || activeEmployee?.base_salary) || 0;
  const advanceLimit = activeEmployee?.advance_limit !== undefined && activeEmployee?.advance_limit !== null
    ? Number(activeEmployee.advance_limit)
    : baseSalary;

  const thisMonthTaken = useMemo(() => {
    if (!activeEmployee) return 0;
    return allExpenses
      .filter(e => {
        const isAdv = e.category === "advance" || e.category === "salary_advance" || (e as any).type === "advance";
        if (!isAdv) return false;
        const empMatch = e.employee_id === activeEmployee.id || (e.employee_name && e.employee_name.toLowerCase() === activeEmployee.name?.toLowerCase());
        const d = e.date || (e.created_at ? e.created_at.slice(0, 7) : "");
        return empMatch && d.startsWith(currentMonth);
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [allExpenses, activeEmployee, currentMonth]);

  const remainingLimit = salaryRollover?.remainingAdvanceLimit ?? Math.max(0, advanceLimit - thisMonthTaken);
  const remainingSalary = salaryRollover?.remainingSalary ?? Math.max(0, baseSalary - thisMonthTaken);

  // ── Dialog States: Take Advance ──
  const [takeMoneyOpen, setTakeMoneyOpen] = useState(false);
  const [takeAmount, setTakeAmount] = useState("");
  const [takeNote, setTakeNote] = useState("");
  const [takeEmpId, setTakeEmpId] = useState("");
  const [takeMethod, setTakeMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  // ── Dialog States: Give Gift / Bonus ──
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftEmpId, setGiftEmpId] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftType, setGiftType] = useState<"bonus" | "eid_gift" | "target_gift" | "item_gift">("bonus");
  const [giftMethod, setGiftMethod] = useState("cash");
  const [giftDate, setGiftDate] = useState(todayStr);
  const [giftNote, setGiftNote] = useState("");

  // ── Dialog States: Pay Salary ──
  const [paySalaryOpen, setPaySalaryOpen] = useState(false);
  const [paySalEmpId, setPaySalEmpId] = useState("");
  const [paySalAmount, setPaySalAmount] = useState("");
  const [paySalMethod, setPaySalMethod] = useState("cash");
  const [paySalMonth, setPaySalMonth] = useState(currentMonth);
  const [paySalNote, setPaySalNote] = useState("");

  // ── Dialog States: Add / Edit Employee ──
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empDesignation, setEmpDesignation] = useState("Sales Staff");
  const [empSalary, setEmpSalary] = useState("");
  const [empAdvanceLimit, setEmpAdvanceLimit] = useState("");
  const [empStatus, setEmpStatus] = useState("active");
  const [empPin, setEmpPin] = useState("1234");
  const [empPermissions, setEmpPermissions] = useState({
    can_sales: true,
    can_customers: true,
    can_returns: true,
    can_products: false,
    can_expenses: false,
    can_reports: false,
    can_delete: false,
    can_discount: false,
  });

  const openAddEmployeeModal = () => {
    setEditingEmp(null);
    setEmpName("");
    setEmpPhone("");
    setEmpEmail("");
    setEmpDesignation("Sales Staff");
    setEmpSalary("");
    setEmpAdvanceLimit("");
    setEmpStatus("active");
    setEmpPin("1234");
    setEmpPermissions({
      can_sales: true,
      can_customers: true,
      can_returns: true,
      can_products: false,
      can_expenses: false,
      can_reports: false,
      can_delete: false,
      can_discount: false,
    });
    setAddEmpOpen(true);
  };

  const openEditEmployeeModal = (e: Employee) => {
    setEditingEmp(e);
    setEmpName(e.name || "");
    setEmpPhone(e.phone || "");
    setEmpEmail(e.email || "");
    setEmpDesignation(e.designation || "Sales Staff");
    setEmpSalary(e.base_salary ? String(e.base_salary) : "");
    setEmpAdvanceLimit(e.advance_limit !== undefined ? String(e.advance_limit) : (e.base_salary ? String(e.base_salary) : ""));
    setEmpStatus(e.status || "active");
    setEmpPin((e as any).pin || (e as any).plain_password || (e as any).password || "1234");
    setEmpPermissions({
      can_sales: Boolean(e.permissions?.can_sales ?? true),
      can_customers: Boolean(e.permissions?.can_customers ?? true),
      can_returns: Boolean(e.permissions?.can_returns ?? true),
      can_products: Boolean(e.permissions?.can_products ?? false),
      can_expenses: Boolean(e.permissions?.can_expenses ?? false),
      can_reports: Boolean(e.permissions?.can_reports ?? false),
      can_delete: Boolean(e.permissions?.can_delete ?? false),
      can_discount: Boolean(e.permissions?.can_discount ?? false),
    });
    setAddEmpOpen(true);
  };

  // ── Handler: Save Employee (Add or Update) ──
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) {
      toast.error(lang === "bn" ? "কর্মচারীর নাম প্রদান করুন" : "Please enter employee name");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: empName.trim(),
        phone: empPhone.trim(),
        email: empEmail.trim(),
        designation: empDesignation.trim(),
        base_salary: parseFloat(empSalary) || 0,
        monthly_salary: parseFloat(empSalary) || 0,
        advance_limit: empAdvanceLimit !== "" ? parseFloat(empAdvanceLimit) : (parseFloat(empSalary) || 0),
        status: empStatus,
        pin: empPin.trim() || "1234",
        plain_password: empPin.trim() || "1234",
        permissions: empPermissions,
      };

      if (editingEmp) {
        await updateEmployeeFn({ data: { id: editingEmp.id, ...payload } });
        toast.success(lang === "bn" ? "কর্মচারীর তথ্য সফলভাবে আপডেট হয়েছে!" : "Employee updated successfully!");
      } else {
        await addEmployeeFn({ data: payload });
        toast.success(lang === "bn" ? "নতুন কর্মচারী সফলভাবে যোগ করা হয়েছে!" : "New employee added successfully!");
      }

      setAddEmpOpen(false);
      void qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to save employee");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Handler: Delete Employee ──
  const handleDeleteEmployee = async (empId: string, name: string) => {
    if (!confirm(lang === "bn" ? `আপনি কি নিশ্চিতভাবে "${name}"-কে অপসারণ করতে চান?` : `Are you sure you want to remove "${name}"?`)) {
      return;
    }
    setSubmitting(true);
    try {
      await deleteEmployeeFn({ data: { id: empId } });
      toast.success(lang === "bn" ? "কর্মচারী মুছে ফেলা হয়েছে।" : "Employee deleted successfully.");
      void qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Handler: Take Advance Withdrawal ──
  const handleTakeMoneySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(takeAmount);
    if (!amountNum || amountNum <= 0) {
      toast.error(lang === "bn" ? "সঠিক টাকার পরিমাণ লিখুন" : "Please enter a valid amount");
      return;
    }

    const targetEmp = isOwner ? allEmployees.find(x => x.id === (takeEmpId || selectedEmpId)) || activeEmployee : activeEmployee;
    const targetEmpId = targetEmp?.id || currentEmpId;
    const targetEmpName = targetEmp?.name || user?.full_name || "Employee";

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

    if (takeMethod === "cash" && amountNum > currentCashBalance) {
      toast.warning(
        lang === "bn"
          ? `সতর্কতা: ক্যাশবক্সে পর্যাপ্ত নগদ টাকা নেই (বর্তমান ব্যালেন্স: ৳${currentCashBalance.toLocaleString()})`
          : `Warning: Cashbox balance is lower than requested (Current: ৳${currentCashBalance.toLocaleString()})`
      );
    }

    setSubmitting(true);
    try {
      await createEmployeeExpenseFn({
        data: {
          employee_id: targetEmpId,
          employee_name: targetEmpName,
          category: "advance",
          amount: amountNum,
          payment_method: takeMethod,
          note: takeNote.trim() || (lang === "bn" ? "কর্মচারী অগ্রিম টাকা উত্তোলন" : "Employee salary advance withdrawal"),
          date: todayStr,
          month: currentMonth,
          taken_by: user?.full_name || targetEmpName,
          created_at: new Date().toISOString(),
        },
      });

      toast.success(
        lang === "bn"
          ? `৳${amountNum.toLocaleString()} টাকা সফলভাবে উত্তোলন করা হয়েছে! ক্যাশবক্স ও অবশিষ্ট বেতন থেকে সমন্বয় হয়েছে।`
          : `৳${amountNum.toLocaleString()} successfully withdrawn! Deducted from cashbox & salary.`
      );

      setTakeAmount("");
      setTakeNote("");
      setTakeMoneyOpen(false);

      void qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      void qc.invalidateQueries({ queryKey: ["cashbox"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to process withdrawal");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Handler: Give Gift / Bonus (Counts as Shop Expense) ──
  const handleSaveGift = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(giftAmount);
    if (!giftEmpId || isNaN(val) || val <= 0) {
      toast.error(lang === "bn" ? "কর্মচারী নির্বাচন করুন এবং সঠিক উপহার/বোনাসের পরিমাণ লিখুন" : "Select employee and enter valid amount");
      return;
    }
    const emp = allEmployees.find(x => x.id === giftEmpId);
    setSubmitting(true);
    try {
      const giftCategoryLabel =
        giftType === "eid_gift" ? "ঈদ/উৎসব উপহার" :
        giftType === "target_gift" ? "টার্গেট পূরণ উপহার" :
        giftType === "item_gift" ? "পোশাক/উপহার সামগ্রী" : "নগদ উপহার ও বোনাস";

      await createEmployeeExpenseFn({
        data: {
          employee_id: giftEmpId,
          employee_name: emp?.name || "Employee",
          category: "bonus", // Counts as bonus/gift and registers in shop expenses!
          amount: val,
          payment_method: giftMethod,
          date: giftDate,
          note: giftNote.trim() ? `🎁 ${giftCategoryLabel}: ${giftNote.trim()}` : `🎁 মালিকের ${giftCategoryLabel} (দোকানের খরচ হিসেবে গণ্য)`,
        },
      });

      toast.success(
        lang === "bn"
          ? `${emp?.name || "কর্মচারী"}-কে ৳${val.toLocaleString()} উপহার দেওয়া হয়েছে এবং দোকানের খরচ হিসেবে অন্তর্ভুক্ত হয়েছে!`
          : `Gift of ৳${val.toLocaleString()} recorded and accounted as shop expense!`
      );

      setGiftOpen(false);
      setGiftAmount("");
      setGiftNote("");

      void qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["cashbox"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to give gift");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Handler: Pay Salary ──
  const handleSaveSalaryPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(paySalAmount);
    if (!paySalEmpId || isNaN(val) || val <= 0) {
      toast.error(lang === "bn" ? "সঠিক বেতনের পরিমাণ লিখুন" : "Please enter valid salary amount");
      return;
    }
    const emp = allEmployees.find(x => x.id === paySalEmpId);
    setSubmitting(true);
    try {
      await createEmployeeSalaryFn({
        data: {
          employee_id: paySalEmpId,
          employee_name: emp?.name || "Employee",
          amount: val,
          month: paySalMonth,
          payment_method: paySalMethod,
          note: paySalNote.trim() || (lang === "bn" ? "মাসিক বেতন পরিশোধ" : "Monthly salary payout"),
          date: todayStr,
        },
      });

      toast.success(lang === "bn" ? "বেতন সফলভাবে পরিশোধ করা হয়েছে!" : "Salary payment recorded successfully!");
      setPaySalaryOpen(false);
      setPaySalAmount("");
      setPaySalNote("");

      void qc.invalidateQueries({ queryKey: ["employee_salaries"] });
      void qc.invalidateQueries({ queryKey: ["cashbox"] });
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: any) {
      toast.error(err?.message || "Salary payment failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered Employees for Management Roster ──
  const filteredRoster = useMemo(() => {
    return allEmployees.filter(e => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        e.name?.toLowerCase().includes(q) ||
        e.phone?.includes(q) ||
        e.designation?.toLowerCase().includes(q)
      );
    });
  }, [allEmployees, searchQuery]);

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 max-w-7xl mx-auto px-2 sm:px-4 pt-2 font-balooda">
      {/* ── Page Header & Context Banner ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-card via-card to-indigo-500/5 border border-border/70 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xs">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="outline" size="icon" className="size-9 rounded-xl border-border/80 hover:bg-muted shrink-0 cursor-pointer">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-black font-charukola tracking-tight flex items-center gap-2 text-foreground">
                <Users className="size-5 sm:size-6 text-indigo-600 dark:text-indigo-400" />
                <span>{lang === "bn" ? "এমপ্লয়ি হাব ও নিয়ন্ত্রণ কেন্দ্র" : "Employee Hub & Control Center"}</span>
              </h1>
              <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-xs px-2.5 py-0.5 font-bold rounded-lg shadow-2xs">
                {isOwner ? (lang === "bn" ? "👑 মালিক নিয়ন্ত্রণ" : "Owner Control") : (lang === "bn" ? "👤 স্টাফ টার্মিনাল" : "Staff Terminal")}
              </Badge>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              {lang === "bn"
                ? "কর্মচারী ব্যবস্থাপনা, পিন কোড, পারমিশন, রোলওভার বেতন, অগ্রিম উত্তোলন ও মালিকের উপহার নিয়ন্ত্রণ করুন।"
                : "Manage staff roster, device pins, advance withdrawals, salary ledger rollover, and owner gifts."}
            </p>
          </div>
        </div>

        {/* Quick Actions Header Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {isOwner && (
            <>
              <Button
                onClick={openAddEmployeeModal}
                size="sm"
                className="h-8.5 text-xs font-bold rounded-xl gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>{lang === "bn" ? "নতুন কর্মী" : "Add Staff"}</span>
              </Button>

              <Button
                onClick={() => {
                  if (allEmployees.length > 0 && !giftEmpId) setGiftEmpId(allEmployees[0].id);
                  setGiftAmount("");
                  setGiftNote("");
                  setGiftOpen(true);
                }}
                variant="outline"
                size="sm"
                className="h-8.5 text-xs font-bold rounded-xl gap-1.5 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 shadow-2xs cursor-pointer"
              >
                <Gift className="size-3.5 text-amber-500" />
                <span>{lang === "bn" ? "উপহার / বোনাস" : "Give Gift"}</span>
              </Button>
            </>
          )}

          <Button
            onClick={() => {
              if (isOwner && allEmployees.length > 0 && !takeEmpId) {
                setTakeEmpId(selectedEmpId || allEmployees[0].id);
              }
              setTakeAmount("");
              setTakeNote("");
              setTakeMoneyOpen(true);
            }}
            size="sm"
            className="h-8.5 text-xs font-bold rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
          >
            <ArrowDownLeft className="size-3.5" />
            <span>{lang === "bn" ? "অগ্রিম উত্তোলন" : "Take Advance"}</span>
          </Button>
        </div>
      </div>

      {/* ── Top Bento KPI Overview Cards (Responsive for PC & Phone) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {/* Card 1: Staff Count / Status */}
        <Card className="p-2.5 sm:p-3.5 rounded-2xl bg-card border-border/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10.5px] sm:text-xs font-semibold">{lang === "bn" ? "মোট কর্মচারী" : "Total Staff"}</span>
            <Users className="size-3.5 sm:size-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-1">
            <p className="text-sm sm:text-lg font-black font-charukola text-foreground">
              {allEmployees.length} {lang === "bn" ? "জন" : "Staff"}
            </p>
            <span className="text-[9.5px] sm:text-[10px] text-emerald-600 font-semibold block">
              {activeEmployeesCount} {lang === "bn" ? "জন সক্রিয়" : "Active"}
            </span>
          </div>
        </Card>

        {/* Card 2: Total Base Salary */}
        <Card className="p-2.5 sm:p-3.5 rounded-2xl bg-card border-border/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10.5px] sm:text-xs font-semibold">{lang === "bn" ? "মাসিক বেতন বাজেট" : "Base Salaries"}</span>
            <DollarSign className="size-3.5 sm:size-4 text-primary" />
          </div>
          <div className="mt-1">
            <p className="text-sm sm:text-lg font-black font-charukola text-primary">
              ৳{fmtMoney(isOwner ? totalBaseSalaries : baseSalary)}
            </p>
            <span className="text-[9.5px] sm:text-[10px] text-muted-foreground block truncate">
              {isOwner ? (lang === "bn" ? "মোট নির্ধারিত বাজেট" : "Monthly budget") : (lang === "bn" ? "আমার মাসিক বেতন" : "My monthly base")}
            </span>
          </div>
        </Card>

        {/* Card 3: Monthly Advances Taken */}
        <Card className="p-2.5 sm:p-3.5 rounded-2xl bg-card border-orange-500/30 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10.5px] sm:text-xs font-semibold text-orange-600 dark:text-orange-400">{lang === "bn" ? "উত্তোলিত অগ্রিম" : "Advances Drawn"}</span>
            <TrendingDown className="size-3.5 sm:size-4 text-orange-600" />
          </div>
          <div className="mt-1">
            <p className="text-sm sm:text-lg font-black font-charukola text-orange-600">
              ৳{fmtMoney(isOwner ? totalMonthlyAdvances : thisMonthTaken)}
            </p>
            <span className="text-[9.5px] sm:text-[10px] text-orange-600/80 block truncate">
              {isOwner ? (lang === "bn" ? "চলতি মাসে কর্তন" : "Deducted this month") : `সীমা: ৳${fmtMoney(advanceLimit)}`}
            </span>
          </div>
        </Card>

        {/* Card 4: Remaining Salary Due */}
        <Card className="p-2.5 sm:p-3.5 rounded-2xl bg-card border-emerald-500/30 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10.5px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400">{lang === "bn" ? "অবশিষ্ট প্রদেয়" : "Remaining Due"}</span>
            <Wallet className="size-3.5 sm:size-4 text-emerald-600" />
          </div>
          <div className="mt-1">
            <p className="text-sm sm:text-lg font-black font-charukola text-emerald-600">
              ৳{fmtMoney(isOwner ? Math.max(0, totalBaseSalaries - totalMonthlyAdvances) : remainingSalary)}
            </p>
            <span className="text-[9.5px] sm:text-[10px] text-emerald-600/80 block truncate">
              {lang === "bn" ? "রোলওভার ব্যালেন্স সহ" : "With rollover"}
            </span>
          </div>
        </Card>

        {/* Card 5: Owner Gifts & Bonuses (Counted as Shop Expense) */}
        <Card className="p-2.5 sm:p-3.5 rounded-2xl bg-amber-500/10 border-amber-500/30 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
            <span className="text-[10.5px] sm:text-xs font-bold flex items-center gap-1">
              <Gift className="size-3.5 text-amber-600" />
              <span>{lang === "bn" ? "উপহার / বোনাস" : "Owner Gifts"}</span>
            </span>
            <Sparkles className="size-3.5 text-amber-500" />
          </div>
          <div className="mt-1">
            <p className="text-sm sm:text-lg font-black font-charukola text-amber-700 dark:text-amber-300">
              ৳{fmtMoney(totalGiftsGiven)}
            </p>
            <span className="text-[9px] sm:text-[9.5px] font-bold text-amber-800 dark:text-amber-200 block truncate">
              {lang === "bn" ? "✓ দোকানের খরচ গণ্য" : "✓ Shop expense recorded"}
            </span>
          </div>
        </Card>

        {/* Card 6: Staff Sales Performance */}
        <Card className="p-2.5 sm:p-3.5 rounded-2xl bg-card border-border/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10.5px] sm:text-xs font-semibold">{lang === "bn" ? "আজকের কর্মী বিক্রি" : "Staff Sales Today"}</span>
            <ShoppingBag className="size-3.5 sm:size-4 text-indigo-600" />
          </div>
          <div className="mt-1">
            <p className="text-sm sm:text-lg font-black font-charukola text-indigo-600 dark:text-indigo-400">
              ৳{fmtMoney(totalStaffSalesToday)}
            </p>
            <span className="text-[9.5px] sm:text-[10px] text-muted-foreground block truncate">
              {lang === "bn" ? "ক্যাশ ড্রয়ারে জমা" : "Deposited in cashbox"}
            </span>
          </div>
        </Card>
      </div>

      {/* ── Main Hub Navigation Tabs ── */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 overflow-x-auto pb-1">
          <TabsList className="bg-muted/70 p-1 rounded-2xl h-auto flex flex-wrap w-full sm:w-auto">
            {isOwner && (
              <TabsTrigger value="management" className="rounded-xl text-xs py-2 font-bold gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs">
                <Users className="size-3.5" />
                <span>{lang === "bn" ? "কর্মচারী ব্যবস্থাপনা ও নিয়ন্ত্রণ" : "Staff Management & Control"}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="advances" className="rounded-xl text-xs py-2 font-bold gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs">
              <ArrowDownLeft className="size-3.5" />
              <span>{lang === "bn" ? "টাকা উত্তোলন ও অগ্রিম" : "Advances & Withdrawals"}</span>
            </TabsTrigger>
            <TabsTrigger value="salaries" className="rounded-xl text-xs py-2 font-bold gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs">
              <DollarSign className="size-3.5" />
              <span>{lang === "bn" ? "বেতন ও খতিয়ান" : "Salary & Ledger"}</span>
            </TabsTrigger>
            <TabsTrigger value="gifts" className="rounded-xl text-xs py-2 font-bold gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs">
              <Gift className="size-3.5" />
              <span>{lang === "bn" ? "উপহার ও বোনাস (দোকানের খরচ)" : "Gifts & Bonuses"}</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="rounded-xl text-xs py-2 font-bold gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-xs">
              <TrendingUp className="size-3.5" />
              <span>{lang === "bn" ? "বিক্রয় পারফরম্যান্স" : "Sales Performance"}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 1: কর্মচারী ব্যবস্থাপনা ও নিয়ন্ত্রণ (STAFF MANAGEMENT & CONTROL)
        ════════════════════════════════════════════════════════════════════════ */}
        {isOwner && (
          <TabsContent value="management" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border/70 shadow-2xs">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={lang === "bn" ? "কর্মচারী খুঁজুন (নাম, পদবী, ফোন)..." : "Search staff..."}
                  className="pl-9 h-9 text-xs rounded-xl bg-background"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={openAddEmployeeModal}
                  size="sm"
                  className="h-9 text-xs font-bold rounded-xl gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{lang === "bn" ? "নতুন কর্মচারী যোগ করুন" : "Add New Staff"}</span>
                </Button>
              </div>
            </div>

            {/* Staff Roster Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {filteredRoster.map(emp => {
                const empSales = allSales.filter(s => (s as any).employee_id === emp.id || (s as any).created_by === emp.id || ((s as any).employee_name && (s as any).employee_name.toLowerCase().trim() === (emp.name || '').toLowerCase().trim()));
                const empTodaySales = empSales.filter(s => (s.created_at || '').slice(0, 10) === todayStr).reduce((sum: number, s: any) => sum + (Number(s.sell_price) || 0), 0);
                const empMonthSales = empSales.filter(s => (s.created_at || '').slice(0, 7) === currentMonth).reduce((sum: number, s: any) => sum + (Number(s.sell_price) || 0), 0);
                const empAdvances = allExpenses
                  .filter(e => {
                    const isAdv = e.category === "advance" || e.category === "salary_advance" || (e as any).type === "advance";
                    return isAdv && (e.employee_id === emp.id || e.employee_name?.toLowerCase() === emp.name?.toLowerCase()) && (e.date || "").startsWith(currentMonth);
                  })
                  .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

                const empBase = Number(emp.base_salary || emp.monthly_salary) || 0;
                const empDue = Math.max(0, empBase - empAdvances);

                return (
                  <Card key={emp.id} className="p-4 rounded-2xl border border-border/80 bg-card hover:border-primary/40 hover:shadow-md transition-all space-y-3 relative overflow-hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-primary text-white font-extrabold text-sm grid place-items-center shrink-0 shadow-xs">
                          {emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm sm:text-base font-bold text-foreground truncate">{emp.name}</h3>
                            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 shrink-0 ${emp.status === "active" ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" : "border-muted text-muted-foreground"}`}>
                              {emp.status === "active" ? (lang === "bn" ? "সক্রিয়" : "Active") : (lang === "bn" ? "নিষ্ক্রিয়" : "Inactive")}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{emp.designation || "Sales Staff"} • {emp.phone || "No phone"}</p>
                        </div>
                      </div>

                      {/* Login PIN & Device Code Pill */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20 text-[11px]">
                          <KeyRound className="size-3 text-amber-500" />
                          <span>PIN: {(emp as any).pin || (emp as any).plain_password || (emp as any).password || "1234"}</span>
                        </span>
                      </div>
                    </div>

                    {/* Financial Mini KPI Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/60 text-xs">
                      <div className="bg-muted/40 p-2 rounded-xl border border-border/50">
                        <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "মাসিক বেতন" : "Base Salary"}</span>
                        <span className="font-bold font-mono text-primary">৳{fmtMoney(empBase)}</span>
                      </div>
                      <div className="bg-orange-500/10 p-2 rounded-xl border border-orange-500/20">
                        <span className="text-[10px] text-orange-700 dark:text-orange-400 block">{lang === "bn" ? "উত্তোলিত অগ্রিম" : "Advances"}</span>
                        <span className="font-bold font-mono text-orange-600">৳{fmtMoney(empAdvances)}</span>
                      </div>
                      <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block">{lang === "bn" ? "অবশিষ্ট বেতন" : "Remaining"}</span>
                        <span className="font-bold font-mono text-emerald-600">৳{fmtMoney(empDue)}</span>
                      </div>
                      <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-500/20">
                        <span className="text-[10px] text-blue-700 dark:text-blue-400 block">{lang === "bn" ? "আজকের বিক্রি" : "Today Sales"}</span>
                        <span className="font-bold font-mono text-blue-600">৳{fmtMoney(empTodaySales)}</span>
                      </div>
                    </div>

                    {/* Action Toolbar */}
                    <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-border/60 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <OwnerEmployeeDeviceLink
                          employeeId={emp.id}
                          employeeName={emp.name}
                          employeePin={(emp as any).pin || (emp as any).plain_password || (emp as any).password || "1234"}
                          disabled={emp.status === "inactive"}
                        />

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs rounded-xl gap-1 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold cursor-pointer"
                          onClick={() => {
                            setGiftEmpId(emp.id);
                            setGiftAmount("");
                            setGiftNote("");
                            setGiftOpen(true);
                          }}
                        >
                          <Gift className="size-3" />
                          <span>{lang === "bn" ? "উপহার দিন" : "Gift"}</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs rounded-xl gap-1 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer"
                          onClick={() => {
                            setPaySalEmpId(emp.id);
                            setPaySalAmount(String(empDue));
                            setPaySalaryOpen(true);
                          }}
                        >
                          <DollarSign className="size-3" />
                          <span>{lang === "bn" ? "বেতন পরিশোধ" : "Pay Salary"}</span>
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => openEditEmployeeModal(emp)}
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-xl text-destructive hover:bg-destructive/10 cursor-pointer"
                          onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 2: টাকা উত্তোলন ও অগ্রিম (ADVANCES & WITHDRAWALS)
        ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="advances" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border shadow-xs">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <ArrowDownLeft className="size-4 text-emerald-600" />
                <span>{lang === "bn" ? "অগ্রিম টাকা উত্তোলনের খতিয়ান" : "Salary Advances Ledger"}</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {lang === "bn" ? "এখানে উত্তোলিত সকল অগ্রিমের ইতিহাস প্রদর্শিত হচ্ছে। প্রতিটি এন্ট্রি ক্যাশবক্স থেকে বাদ হয়েছে।" : "All salary advances deducted from cashbox and salary balance."}
              </p>
            </div>

            <Button
              onClick={() => {
                if (isOwner && allEmployees.length > 0 && !takeEmpId) {
                  setTakeEmpId(selectedEmpId || allEmployees[0].id);
                }
                setTakeAmount("");
                setTakeNote("");
                setTakeMoneyOpen(true);
              }}
              size="sm"
              className="h-9 text-xs font-bold rounded-xl gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{lang === "bn" ? "টাকা উত্তোলন করুন" : "Record Advance"}</span>
            </Button>
          </div>

          {/* Advances Ledger List */}
          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {allExpenses.filter(e => e.category === "advance" || e.category === "salary_advance" || (e as any).type === "advance").length === 0 ? (
              <div className="p-8 text-center space-y-2 text-muted-foreground">
                <ArrowDownLeft className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold">{lang === "bn" ? "কোনো অগ্রিম উত্তোলনের তথ্য পাওয়া যায়নি" : "No salary advances recorded"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {allExpenses
                  .filter(e => e.category === "advance" || e.category === "salary_advance" || (e as any).type === "advance")
                  .map(adv => (
                    <div key={adv.id} className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center font-bold shrink-0">
                          <ArrowDownLeft className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-foreground truncate">{adv.employee_name || "Employee"}</span>
                            <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 bg-muted/50 border-border">
                              {adv.payment_method === "cash" ? (lang === "bn" ? "নগদ ক্যাশবক্স" : "Cashbox") : (lang === "bn" ? "অনলাইন / ব্যাংক" : "Online")}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{adv.note || "Advance withdrawal"} • {adv.date || fmtDate(adv.created_at)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-sm sm:text-base font-bold font-mono text-orange-600">
                            -৳{fmtMoney(Number(adv.amount) || 0)}
                          </span>
                        </div>
                        {isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-lg text-destructive hover:bg-destructive/10 cursor-pointer"
                            onClick={async () => {
                              if (confirm(lang === "bn" ? "আপনি কি এই অগ্রিম রেকর্ডটি মুছে ফেলতে চান?" : "Delete this advance record?")) {
                                await deleteEmployeeExpenseFn({ data: { id: adv.id } });
                                void qc.invalidateQueries({ queryKey: ["employee_expenses"] });
                                void qc.invalidateQueries({ queryKey: ["cashbox"] });
                                toast.success(lang === "bn" ? "অগ্রিম রেকর্ড মুছে ফেলা হয়েছে।" : "Deleted successfully.");
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 3: বেতন ও রোলওভার খতিয়ান (SALARY & ROLLOVER LEDGER)
        ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="salaries" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border shadow-xs">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <DollarSign className="size-4 text-primary" />
                <span>{lang === "bn" ? "মাসিক বেতন ও রোলওভার খতিয়ান" : "Salary Rollover Ledger"}</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {lang === "bn" ? "পূর্ববর্তী মাসের বকেয়া বা অতিরিক্ত উত্তোলন স্বয়ংক্রিয়ভাবে চলতি মাসে যুক্ত ও সমন্বয় হয়।" : "Previous month's unpaid salary or excess advance auto-rolls over to the new month."}
              </p>
            </div>
            {isOwner && (
              <Button
                onClick={() => {
                  if (allEmployees.length > 0 && !paySalEmpId) setPaySalEmpId(allEmployees[0].id);
                  setPaySalAmount("");
                  setPaySalNote("");
                  setPaySalaryOpen(true);
                }}
                size="sm"
                className="h-9 text-xs font-bold rounded-xl gap-1.5 bg-primary text-primary-foreground shadow-xs cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>{lang === "bn" ? "বেতন পরিশোধ করুন" : "Pay Salary"}</span>
              </Button>
            )}
          </div>

          {/* Salary Records List */}
          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {allSalaries.length === 0 ? (
              <div className="p-8 text-center space-y-2 text-muted-foreground">
                <Receipt className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold">{lang === "bn" ? "কোনো বেতন পরিশোধের রসিদ পাওয়া যায়নি" : "No salary payments found"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {allSalaries.map((sal: any) => (
                  <div key={sal.id} className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                        <CheckCircle2 className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-foreground truncate">{sal.employee_name || "Employee"}</span>
                          <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                            {sal.month || currentMonth}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{sal.note || "Salary payment"} • {fmtDate(sal.date || sal.created_at)}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm sm:text-base font-bold font-mono text-emerald-600">
                        +৳{fmtMoney(Number(sal.amount) || 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 4: উপহার ও বোনাস (GIFTS & BONUSES - COUNTED AS SHOP EXPENSE)
        ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="gifts" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-500/10 via-card to-card p-4 rounded-2xl border border-amber-500/30 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <Gift className="size-4 text-amber-600" />
                  <span>{lang === "bn" ? "মালিকের উপহার ও বোনাস খতিয়ান" : "Owner Gifts & Bonus Ledger"}</span>
                </h2>
                <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/40 text-[10px] font-bold">
                  {lang === "bn" ? "দোকানের খরচ গণ্য" : "Counted as Shop Expense"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "bn"
                  ? "মালিক কর্মচারীকে যে কোনো উপহার, টিপস বা বোনাস দিলে তা স্বয়ংক্রিয়ভাবে দোকানের মোট খরচ (Shop Expense) হিসেবে গণ্য হয় এবং কর্মচারীর বেতন থেকে কাটা হয় না।"
                  : "Owner gifts and bonuses automatically count as shop expenses and are never deducted from employee salary."}
              </p>
            </div>

            {isOwner && (
              <Button
                onClick={() => {
                  if (allEmployees.length > 0 && !giftEmpId) setGiftEmpId(allEmployees[0].id);
                  setGiftAmount("");
                  setGiftNote("");
                  setGiftOpen(true);
                }}
                size="sm"
                className="h-9 text-xs font-bold rounded-xl gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>{lang === "bn" ? "নতুন উপহার প্রদান করুন" : "Give New Gift"}</span>
              </Button>
            )}
          </div>

          {/* Gifts Feed */}
          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {allExpenses.filter(e => e.category === "bonus" || e.category === "gift").length === 0 ? (
              <div className="p-8 text-center space-y-2 text-muted-foreground">
                <Gift className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold">{lang === "bn" ? "কোনো উপহার বা বোনাসের রেকর্ড নেই" : "No gifts or bonuses recorded yet"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {allExpenses
                  .filter(e => e.category === "bonus" || e.category === "gift")
                  .map(gift => (
                    <div key={gift.id} className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold shrink-0">
                          <Gift className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-foreground truncate">{gift.employee_name || "Employee"}</span>
                            <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                              🎁 {lang === "bn" ? "মালিকের উপহার" : "Gift"}
                            </Badge>
                            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              {lang === "bn" ? "দোকানের খরচ" : "Shop Expense"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{gift.note || "Gift to employee"} • {fmtDate(gift.date || gift.created_at)}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm sm:text-base font-bold font-mono text-amber-600">
                          ৳{fmtMoney(Number(gift.amount) || 0)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 5: বিক্রয় পারফরম্যান্স (SALES PERFORMANCE)
        ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allEmployees.map(emp => {
              const empSales = allSales.filter(s => (s as any).employee_id === emp.id || (s as any).created_by === emp.id || ((s as any).employee_name && (s as any).employee_name.toLowerCase().trim() === (emp.name || '').toLowerCase().trim()));
              const empTodaySales = empSales.filter(s => (s.created_at || '').slice(0, 10) === todayStr);
              const empMonthSales = empSales.filter(s => (s.created_at || '').slice(0, 7) === currentMonth);

              const todayTotal = empTodaySales.reduce((sum, s) => sum + (s.returned ? 0 : Number(s.sell_price || 0) * (Number(s.qty) || 1)), 0);
              const monthTotal = empMonthSales.reduce((sum, s) => sum + (s.returned ? 0 : Number(s.sell_price || 0) * (Number(s.qty) || 1)), 0);

              return (
                <Card key={emp.id} className="p-4 rounded-2xl border border-border/80 bg-card space-y-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{emp.name}</h3>
                      <p className="text-[11px] text-muted-foreground">{emp.designation || "Staff"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/50">
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium block">{lang === "bn" ? "আজকের বিক্রি" : "Today Sales"}</span>
                      <span className="font-extrabold text-emerald-600 font-mono text-sm">৳{fmtMoney(todayTotal)}</span>
                      <span className="text-[9px] text-muted-foreground block">{empTodaySales.length} {lang === "bn" ? "টি রসিদ" : "Orders"}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium block">{lang === "bn" ? "চলতি মাসের বিক্রি" : "Month Sales"}</span>
                      <span className="font-extrabold text-blue-600 font-mono text-sm">৳{fmtMoney(monthTotal)}</span>
                      <span className="text-[9px] text-muted-foreground block">{empMonthSales.length} {lang === "bn" ? "টি রসিদ" : "Orders"}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 1: TAKE ADVANCE WITHDRAWAL
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={takeMoneyOpen} onOpenChange={setTakeMoneyOpen}>
        <DialogContent className="max-w-md font-balooda rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold font-charukola flex items-center gap-2">
              <ArrowDownLeft className="size-5 text-emerald-600" />
              <span>{lang === "bn" ? "অগ্রিম টাকা উত্তোলন করুন" : "Take Salary Advance"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "bn"
                ? "টাকা সরাসরি ক্যাশবক্স ও কর্মচারীর বেতন থেকে কাটা হবে।"
                : "Deducted immediately from cashbox and employee net salary."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTakeMoneySubmit} className="space-y-3.5">
            {isOwner && allEmployees.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারী নির্বাচন করুন" : "Select Staff"}</Label>
                <select
                  value={takeEmpId || selectedEmpId}
                  onChange={e => setTakeEmpId(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl bg-card border border-border font-medium"
                >
                  {allEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({fmtMoney(emp.monthly_salary || 0)})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "টাকার পরিমাণ (৳) *" : "Amount (৳) *"}</Label>
              <Input
                required
                type="number"
                step="any"
                inputMode="decimal"
                pattern="[0-9.]*"
                placeholder="0.00"
                value={takeAmount}
                onChange={e => setTakeAmount(e.target.value)}
                className="h-10 text-base font-bold font-mono rounded-xl"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTakeMethod("cash")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    takeMethod === "cash"
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  💵 {lang === "bn" ? "নগদ (ক্যাশবক্স)" : "Cashbox"}
                </button>
                <button
                  type="button"
                  onClick={() => setTakeMethod("online")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    takeMethod === "online"
                      ? "bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  🌐 {lang === "bn" ? "অনলাইন / ব্যাংক" : "Online/Bank"}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "উত্তোলনের কারণ বা বিবরণ" : "Note / Reason"}</Label>
              <Input
                value={takeNote}
                onChange={e => setTakeNote(e.target.value)}
                placeholder={lang === "bn" ? "যেমন: ব্যক্তিগত জরুরি প্রয়োজন..." : "e.g. Family emergency..."}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setTakeMoneyOpen(false)} className="rounded-xl">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={submitting} size="sm" className="rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? "..." : (lang === "bn" ? "উত্তোলন নিশ্চিত করুন" : "Confirm Withdrawal")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 2: GIVE OWNER GIFT / BONUS (COUNTS AS SHOP EXPENSE)
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent className="max-w-md font-balooda rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold font-charukola flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Gift className="size-5 text-amber-500" />
              <span>{lang === "bn" ? "মালিকের উপহার বা বোনাস প্রদান" : "Give Owner Gift / Bonus"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "bn"
                ? "✨ এই উপহারটি সরাসরি দোকানের মোট খরচ (Shop Expense) হিসেবে গণ্য হবে। কর্মচারীর বেতন থেকে কাটা যাবে না।"
                : "This gift is strictly recorded as a shop expense and will not reduce the employee's salary."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveGift} className="space-y-3.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারী নির্বাচন করুন" : "Select Staff"}</Label>
              <select
                value={giftEmpId}
                onChange={e => setGiftEmpId(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-xl bg-card border border-border font-medium"
              >
                {allEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "উপহারের ধরণ" : "Gift Category"}</Label>
              <select
                value={giftType}
                onChange={e => setGiftType(e.target.value as any)}
                className="w-full h-9 px-3 text-xs rounded-xl bg-card border border-border font-medium"
              >
                <option value="bonus">{lang === "bn" ? "🎁 নগদ বোনাস / পুরস্কার" : "Cash Bonus"}</option>
                <option value="eid_gift">{lang === "bn" ? "🌙 ঈদ / উৎসব উপহার" : "Eid / Festival Gift"}</option>
                <option value="target_gift">{lang === "bn" ? "🎯 সেলস টার্গেট উপহার" : "Sales Target Reward"}</option>
                <option value="item_gift">{lang === "bn" ? "👕 পোশাক / উপহার সামগ্রী" : "Gift Item / Clothes"}</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "উপহারের টাকার পরিমাণ (৳) *" : "Gift Value (৳) *"}</Label>
              <Input
                required
                type="number"
                step="any"
                inputMode="decimal"
                pattern="[0-9.]*"
                placeholder="0.00"
                value={giftAmount}
                onChange={e => setGiftAmount(e.target.value)}
                className="h-10 text-base font-bold font-mono rounded-xl border-amber-500/40"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGiftMethod("cash")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    giftMethod === "cash"
                      ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  💵 {lang === "bn" ? "নগদ ক্যাশবক্স" : "Cashbox"}
                </button>
                <button
                  type="button"
                  onClick={() => setGiftMethod("online")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    giftMethod === "online"
                      ? "bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  🌐 {lang === "bn" ? "অনলাইন / ব্যাংক" : "Online/Bank"}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "উপহারের বিবরণ / নোট" : "Note"}</Label>
              <Input
                value={giftNote}
                onChange={e => setGiftNote(e.target.value)}
                placeholder={lang === "bn" ? "যেমন: ভালো কাজের স্বীকৃতিস্বরূপ..." : "e.g. Good work reward..."}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setGiftOpen(false)} className="rounded-xl">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={submitting} size="sm" className="rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white">
                {submitting ? "..." : (lang === "bn" ? "উপহার নিশ্চিত করুন" : "Confirm Gift")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 3: PAY SALARY
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={paySalaryOpen} onOpenChange={setPaySalaryOpen}>
        <DialogContent className="max-w-md font-balooda rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold font-charukola flex items-center gap-2 text-primary">
              <DollarSign className="size-5" />
              <span>{lang === "bn" ? "কর্মচারীকে বেতন পরিশোধ" : "Pay Employee Salary"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveSalaryPayment} className="space-y-3.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারী নির্বাচন করুন" : "Select Staff"}</Label>
              <select
                value={paySalEmpId}
                onChange={e => setPaySalEmpId(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-xl bg-card border border-border font-medium"
              >
                {allEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "বেতনের মাস" : "Month"}</Label>
                <Input
                  type="month"
                  value={paySalMonth}
                  onChange={e => setPaySalMonth(e.target.value)}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "টাকার পরিমাণ (৳) *" : "Amount (৳) *"}</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  placeholder="0.00"
                  value={paySalAmount}
                  onChange={e => setPaySalAmount(e.target.value)}
                  className="h-9 text-xs font-bold font-mono rounded-xl border-primary"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaySalMethod("cash")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    paySalMethod === "cash"
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  💵 {lang === "bn" ? "নগদ (ক্যাশবক্স)" : "Cashbox"}
                </button>
                <button
                  type="button"
                  onClick={() => setPaySalMethod("online")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    paySalMethod === "online"
                      ? "bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  🌐 {lang === "bn" ? "অনলাইন / ব্যাংক" : "Online/Bank"}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "নোট বা বিবরণ" : "Note"}</Label>
              <Input
                value={paySalNote}
                onChange={e => setPaySalNote(e.target.value)}
                placeholder={lang === "bn" ? "বেতন পরিশোধ বিবরণ..." : "Salary voucher note..."}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPaySalaryOpen(false)} className="rounded-xl">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={submitting} size="sm" className="rounded-xl font-bold bg-primary text-primary-foreground">
                {submitting ? "..." : (lang === "bn" ? "বেতন নিশ্চিত করুন" : "Confirm Payment")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL 4: ADD / EDIT EMPLOYEE (FULL CONTROL)
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={addEmpOpen} onOpenChange={setAddEmpOpen}>
        <DialogContent className="max-w-md font-balooda rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold font-charukola">
              {editingEmp ? (lang === "bn" ? "কর্মচারীর তথ্য সম্পাদনা" : "Edit Employee Details") : (lang === "bn" ? "নতুন কর্মচারী যোগ করুন" : "Add New Employee")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "bn"
                ? "কর্মচারীর পদবী, বেতন, অগ্রিম সীমা ও পিন কোড নির্ধারণ করুন।"
                : "Configure designation, base salary, advance limit, and access PIN."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEmployee} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারীর পুরো নাম *" : "Full Name *"}</Label>
              <Input
                required
                value={empName}
                onChange={e => setEmpName(e.target.value)}
                placeholder={lang === "bn" ? "যেমন: মো: রহিম উদ্দিন" : "e.g. John Doe"}
                className="h-9 text-xs rounded-xl"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "মোবাইল নম্বর" : "Phone Number"}</Label>
                <Input
                  value={empPhone}
                  onChange={e => setEmpPhone(e.target.value)}
                  placeholder="017xxxxxxxx"
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "পদবী" : "Designation"}</Label>
                <Input
                  value={empDesignation}
                  onChange={e => setEmpDesignation(e.target.value)}
                  placeholder={lang === "bn" ? "যেমন: সেলস এক্সিকিউটিভ" : "e.g. Sales Staff"}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "মাসিক মূল বেতন (৳)" : "Base Salary (৳)"}</Label>
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  placeholder="15000"
                  value={empSalary}
                  onChange={e => setEmpSalary(e.target.value)}
                  className="h-9 text-xs font-bold font-mono rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "অগ্রিম সীমা (৳)" : "Advance Limit (৳)"}</Label>
                <Input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  placeholder="5000"
                  value={empAdvanceLimit}
                  onChange={e => setEmpAdvanceLimit(e.target.value)}
                  className="h-9 text-xs font-bold font-mono rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "লগইন পিন (PIN)" : "Login PIN"}</Label>
                <Input
                  value={empPin}
                  onChange={e => setEmpPin(e.target.value)}
                  placeholder="1234"
                  maxLength={6}
                  className="h-9 text-xs font-mono font-bold rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "স্ট্যাটাস" : "Status"}</Label>
                <select
                  value={empStatus}
                  onChange={e => setEmpStatus(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl bg-card border border-border font-medium"
                >
                  <option value="active">{lang === "bn" ? "সক্রিয় (Active)" : "Active"}</option>
                  <option value="inactive">{lang === "bn" ? "নিষ্ক্রিয় (Inactive)" : "Inactive"}</option>
                </select>
              </div>
            </div>

            {/* Permissions Toggles */}
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/30 space-y-2">
              <Label className="text-xs font-bold text-foreground block">{lang === "bn" ? "অ্যাক্সেস পারমিশনসমূহ" : "Access Permissions"}</Label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={empPermissions.can_sales}
                    onCheckedChange={c => setEmpPermissions(p => ({ ...p, can_sales: Boolean(c) }))}
                  />
                  <span>{lang === "bn" ? "বিক্রি ও রসিদ" : "Sales & POS"}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={empPermissions.can_returns}
                    onCheckedChange={c => setEmpPermissions(p => ({ ...p, can_returns: Boolean(c) }))}
                  />
                  <span>{lang === "bn" ? "পণ্য ফেরত" : "Returns"}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={empPermissions.can_customers}
                    onCheckedChange={c => setEmpPermissions(p => ({ ...p, can_customers: Boolean(c) }))}
                  />
                  <span>{lang === "bn" ? "কাস্টমার" : "Customers"}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={empPermissions.can_discount}
                    onCheckedChange={c => setEmpPermissions(p => ({ ...p, can_discount: Boolean(c) }))}
                  />
                  <span>{lang === "bn" ? "ডিসকাউন্ট" : "Discounts"}</span>
                </label>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddEmpOpen(false)} className="rounded-xl">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={submitting} size="sm" className="rounded-xl font-bold bg-primary text-primary-foreground">
                {submitting ? "..." : (lang === "bn" ? "সংরক্ষণ করুন" : "Save Employee")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
