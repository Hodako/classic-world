"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  Users,
  UserPlus,
  KeyRound,
  Lock,
  DollarSign,
  Receipt,
  ShoppingBag,
  ShieldCheck,
  Search,
  Plus,
  Trash2,
  Pencil,
  Phone,
  Mail,
  Calendar,
  CreditCard,
  Shirt,
  Printer,
  X,
  Check,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  Info,
  Clock,
  ArrowLeft,
  ChevronRight,
  PlusCircle,
  ArrowDownLeft,
  Scale,
  Banknote,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { calculateEmployeeSalaryWithRollover } from "@/lib/salary-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCachedQuery } from "@/hooks/use-cached-query";
import {
  getEmployees,
  getEmployeeSalaries,
  getEmployeeExpenses,
  getEmployeeShoppings,
  getProducts,
  type Employee,
  type EmployeeSalary,
  type EmployeeExpense,
  type EmployeeShopping,
  type Product,
} from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import { cashboxBalance } from "@/lib/cashbox-utils";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { OwnerEmployeeDeviceLink } from "@/components/employee-device-link";
import {
  addEmployeeFn,
  updateEmployeeFn,
  deleteEmployeeFn,
  createEmployeeSalaryFn,
  deleteEmployeeSalaryFn,
  createEmployeeExpenseFn,
  deleteEmployeeExpenseFn,
  createEmployeeShoppingFn,
  deleteEmployeeShoppingFn,
} from "@/lib/rpc";

export default function EmployeesPage() {
  const { lang, t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const paramTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"accounts" | "salaries" | "expenses" | "shoppings">(
    (paramTab === "shoppings" || paramTab === "expenses" || paramTab === "salaries" || paramTab === "accounts")
      ? (paramTab as any)
      : "accounts"
  );
  const [search, setSearch] = useState("");
  const router = useRouter();
  const [personalKpiRevealed, setPersonalKpiRevealed] = useState(false);

  // Queries
  const { data: employees = [], isLoading: empLoading } = useCachedQuery(["employees"], getEmployees);
  const { data: salaries = [], isLoading: salLoading } = useCachedQuery(["employee_salaries"], getEmployeeSalaries);
  const { data: expenses = [], isLoading: expLoading } = useCachedQuery(["employee_expenses"], getEmployeeExpenses);
  const { data: shoppings = [], isLoading: shopLoading } = useCachedQuery(["employee_shoppings"], getEmployeeShoppings);
  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const { data: cashEntries = [] } = useCashboxQuery();
  const liveCashBalance = useMemo(() => cashboxBalance(cashEntries), [cashEntries]);

  // Current Month String (YYYY-MM)
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const activeEmpSession = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem("cw_active_employee_session") || "null");
    } catch {
      return null;
    }
  }, []);

  const isEmployeeRole = user?.role === "employee" || Boolean(activeEmpSession);

  useEffect(() => {
    if (isEmployeeRole) {
      router.replace("/employee-hub");
    }
  }, [isEmployeeRole, router]);

  // Identify currently logged-in employee
  const currentEmployee = useMemo(() => {
    if (!user) return null;
    const targetId = activeEmpSession?.id || (user as any)?.employee_id || user.id;
    return employees.find(e =>
      e.id === targetId ||
      (e.email && user.email && e.email.toLowerCase() === user.email.toLowerCase()) ||
      (e.phone && (user as any)?.phone && e.phone.replace(/[^0-9]/g, "") === (user as any).phone.replace(/[^0-9]/g, "")) ||
      (e.name && user.full_name && e.name.toLowerCase() === user.full_name.toLowerCase())
    ) || (isEmployeeRole ? {
      id: targetId,
      name: user.full_name || "Employee",
      base_salary: (user as any)?.base_salary || 0,
      monthly_salary: (user as any)?.monthly_salary || 0,
      advance_limit: (user as any)?.advance_limit,
      designation: "Staff",
      status: "active",
      role: "employee",
      created_at: new Date().toISOString(),
    } as any : null);
  }, [employees, user, activeEmpSession, isEmployeeRole]);

  const availableCycles = useMemo(() => {
    const months = new Set<string>();
    const now = new Date();
    const curMonth = now.toISOString().slice(0, 7);
    months.add(curMonth);
    const nextMonthObj = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    months.add(nextMonthObj.toISOString().slice(0, 7));
    const prevMonthObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    months.add(prevMonthObj.toISOString().slice(0, 7));

    salaries.forEach(s => { if (s.month) months.add(s.month.slice(0, 7)); });
    expenses.forEach(e => { if (e.date) months.add(e.date.slice(0, 7)); });
    shoppings.forEach(s => { if (s.created_at) months.add(s.created_at.slice(0, 7)); });

    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [salaries, expenses, shoppings]);

  const getEmployeeSalaryStats = (empId: string, monthStr: string, deductShop: boolean = true) => {
    const emp = employees.find(x => x.id === empId);
    const baseSal = Number(emp?.base_salary) || 0;
    const matchEmp = (recEmpId?: string | null, recEmpName?: string | null) =>
      recEmpId === empId || Boolean(emp && recEmpName && recEmpName.toLowerCase() === emp.name.toLowerCase());

    const shopDed = shoppings
      .filter(s =>
        matchEmp(s.employee_id, s.employee_name) &&
        s.payment_status === "deduct_from_salary" &&
        !s.is_settled &&
        !s.settled
      )
      .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    // Owner given salary records in this cycle
    const paidSalariesInMonth = salaries
      .filter(s =>
        matchEmp(s.employee_id, s.employee_name) &&
        s.month === monthStr &&
        !(s as any).is_bonus &&
        s.status !== "bonus"
      )
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    // Owner given advances / early money in this cycle
    const advancesInMonth = expenses
      .filter(e =>
        matchEmp(e.employee_id, e.employee_name) &&
        (e.category === "advance" || e.category === "salary_advance") &&
        (e.date || "").startsWith(monthStr)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Employee daily spends (food, travel, tea, other) in this cycle
    const dailySpendsInMonth = expenses
      .filter(e =>
        matchEmp(e.employee_id, e.employee_name) &&
        e.category !== "advance" &&
        e.category !== "salary_advance" &&
        e.category !== "bonus" &&
        e.category !== "debt_repayment" &&
        e.category !== "adjustment_add" &&
        e.category !== "adjustment_deduct" &&
        (e.date || "").startsWith(monthStr)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Bonuses given by owner in this cycle
    const bonusFromExpenses = expenses
      .filter(e =>
        matchEmp(e.employee_id, e.employee_name) &&
        e.category === "bonus" &&
        (e.date || "").startsWith(monthStr)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const bonusFromSalaries = salaries
      .filter(s =>
        matchEmp(s.employee_id, s.employee_name) &&
        s.month === monthStr &&
        ((s as any).is_bonus || s.status === "bonus" || Number((s as any).bonus) > 0)
      )
      .reduce((sum, s) => {
        if ((s as any).is_bonus || s.status === "bonus") return sum + (Number(s.amount) || 0);
        return sum + (Number((s as any).bonus) || 0);
      }, 0);

    const totalBonus = bonusFromExpenses + bonusFromSalaries;

    // Manual Adjustments: Additions (+) like Overtime, Incentives
    const adjustmentsAdd = expenses
      .filter(e =>
        matchEmp(e.employee_id, e.employee_name) &&
        e.category === "adjustment_add" &&
        (e.date || "").startsWith(monthStr)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Manual Adjustments: Deductions (-) like Penalties, Late Fines
    const adjustmentsDeduct = expenses
      .filter(e =>
        matchEmp(e.employee_id, e.employee_name) &&
        e.category === "adjustment_deduct" &&
        (e.date || "").startsWith(monthStr)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Debt repayments made by employee to store in this cycle
    const debtRepaymentsInMonth = expenses
      .filter(e =>
        matchEmp(e.employee_id, e.employee_name) &&
        e.category === "debt_repayment" &&
        (e.date || "").startsWith(monthStr)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const givenByOwner = paidSalariesInMonth + advancesInMonth;
    const totalSpends = dailySpendsInMonth + (deductShop ? shopDed : 0);
    const alreadyPaid = paidSalariesInMonth + advancesInMonth + dailySpendsInMonth;
    const effectiveDeductions = alreadyPaid + (deductShop ? shopDed : 0) + adjustmentsDeduct;
    const effectiveEarnings = baseSal + adjustmentsAdd + debtRepaymentsInMonth;

    // Net balance: positive = store owes employee, negative = employee owes store
    const netBalance = effectiveEarnings - effectiveDeductions;
    const remaining = netBalance > 0 ? netBalance : 0;
    const owesStore = netBalance < 0 ? Math.abs(netBalance) : 0;

    return {
      baseSal,
      shopDed,
      paidSalariesInMonth,
      advancesInMonth,
      dailySpendsInMonth,
      givenByOwner,
      totalSpends,
      totalBonus,
      adjustmentsAdd,
      adjustmentsDeduct,
      debtRepaymentsInMonth,
      alreadyPaid,
      effectiveDeductions,
      effectiveEarnings,
      remaining,
      owesStore,
      netBalance,
    };
  };

  const activeEmployeesCount = useMemo(() => employees.filter(e => e.status === "active").length, [employees]);

  const totalBaseSalaries = useMemo(() => {
    return employees
      .filter(e => e.status === "active")
      .reduce((sum, e) => sum + (Number(e.base_salary) || 0), 0);
  }, [employees]);

  const totalMonthlyAdvances = useMemo(() => {
    return expenses
      .filter(e =>
        (e.category === "advance" || e.category === "salary_advance") &&
        (e.date || "").startsWith(currentMonthStr)
      )
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses, currentMonthStr]);

  const totalMonthlySalariesPaid = useMemo(() => {
    return salaries
      .filter(s => (s.month || "").startsWith(currentMonthStr) && s.status !== "bonus")
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [salaries, currentMonthStr]);

  const totalRemainingPayable = Math.max(0, totalBaseSalaries - totalMonthlyAdvances - totalMonthlySalariesPaid);

  const myEmployeeStats = useMemo(() => {
    if (!currentEmployee) return null;
    return getEmployeeSalaryStats(currentEmployee.id, currentMonthStr, true);
  }, [currentEmployee, currentMonthStr, employees, shoppings, salaries, expenses]);

  const myRolloverCalc = useMemo(() => {
    if (!currentEmployee) return null;
    return calculateEmployeeSalaryWithRollover(
      currentEmployee,
      expenses,
      salaries,
      shoppings,
      currentMonthStr
    );
  }, [currentEmployee, expenses, salaries, shoppings, currentMonthStr]);

  // Dialog States: Employee Account
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empDesignation, setEmpDesignation] = useState("Sales Staff");
  const [empSalary, setEmpSalary] = useState("");
  const [empAdvanceLimit, setEmpAdvanceLimit] = useState("");
  const [empStatus, setEmpStatus] = useState<"active" | "inactive">("active");
  const [empPassword, setEmpPassword] = useState("1234");
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

  // Dialog States: Salary
  const [addSalaryOpen, setAddSalaryOpen] = useState(false);
  const [salEmpId, setSalEmpId] = useState("");
  const [salMonth, setSalMonth] = useState(new Date().toISOString().slice(0, 7));
  const [salAmount, setSalAmount] = useState("");
  const [salMethod, setSalMethod] = useState("cash");
  const [salNote, setSalNote] = useState("");
  const [deductShopFromSalary, setDeductShopFromSalary] = useState(true);

  // Dialog States: Give Bonus
  const [addBonusOpen, setAddBonusOpen] = useState(false);
  const [bonusEmpId, setBonusEmpId] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusMethod, setBonusMethod] = useState("cash");
  const [bonusDate, setBonusDate] = useState(new Date().toISOString().slice(0, 10));
  const [bonusNote, setBonusNote] = useState("");

  // Dialog States: Expense
  const [addExpOpen, setAddExpOpen] = useState(false);
  const [expEmpId, setExpEmpId] = useState("");
  const [expCat, setExpCat] = useState("food");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState("cash");
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expNote, setExpNote] = useState("");

  // Dialog States: Shopping
  const [addShopOpen, setAddShopOpen] = useState(false);
  const [shopEmpId, setShopEmpId] = useState("");
  const [shopStatus, setShopStatus] = useState<"deduct_from_salary" | "paid_cash" | "gift">("deduct_from_salary");
  const [shopItems, setShopItems] = useState<{ product_id: string; product_name: string; qty: number; unit_price: number; total: number }[]>([]);
  const [shopProdSearch, setShopProdSearch] = useState("");
  const [shopNote, setShopNote] = useState("");
  const [printSlipItem, setPrintSlipItem] = useState<EmployeeShopping | null>(null);

  // Dialog States: Collect Store Debt (কর্মচারীর দোকান পাওনা আদায়)
  const [collectDebtOpen, setCollectDebtOpen] = useState(false);
  const [debtEmpId, setDebtEmpId] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtMethod, setDebtMethod] = useState("cash");
  const [debtDate, setDebtDate] = useState(new Date().toISOString().slice(0, 10));
  const [debtNote, setDebtNote] = useState("");

  // Dialog States: Manual Adjustment (সমন্বয়: ওভারটাইম / ইনসেন্টিভ / জরিমানা)
  const [addAdjustmentOpen, setAddAdjustmentOpen] = useState(false);
  const [adjEmpId, setAdjEmpId] = useState("");
  const [adjType, setAdjType] = useState<"adjustment_add" | "adjustment_deduct">("adjustment_add");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));
  const [adjNote, setAdjNote] = useState("");

  const [busy, setBusy] = useState(false);

  const [shopFilter, setShopFilter] = useState<"all" | "my">(isEmployeeRole ? "my" : "all");

  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");

  const handleOpenAddShop = () => {
    if (currentEmployee) {
      setShopEmpId(currentEmployee.id);
    } else if (employees.length > 0 && !shopEmpId) {
      setShopEmpId(employees[0].id);
    }
    setShopItems([]);
    setShopNote("");
    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemOpen(false);
    setAddShopOpen(true);
  };

  const handleAddProductToShop = (p: Product) => {
    const defaultPrice = Number(
      p.sell_price ??
      (p as any).selling_price ??
      (p as any).price ??
      (p as any).unit_price ??
      p.buy_price ??
      0
    );
    const existingIdx = shopItems.findIndex(i => i.product_id === p.id);
    let newItems = [...shopItems];
    if (existingIdx >= 0) {
      newItems[existingIdx].qty += 1;
      newItems[existingIdx].total = newItems[existingIdx].qty * newItems[existingIdx].unit_price;
    } else {
      newItems.push({
        product_id: p.id,
        product_name: p.name,
        qty: 1,
        unit_price: defaultPrice,
        total: defaultPrice,
      });
    }
    setShopItems(newItems);
    setShopProdSearch("");
  };

  const handleUpdateShopItemPrice = (index: number, newPriceVal: string) => {
    const parsed = parseFloat(newPriceVal);
    const unit_price = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setShopItems(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          unit_price,
          total: copy[index].qty * unit_price,
        };
      }
      return copy;
    });
  };

  const handleUpdateShopItemQty = (index: number, delta: number) => {
    setShopItems(prev => {
      const copy = [...prev];
      if (copy[index]) {
        const newQty = Math.max(1, copy[index].qty + delta);
        copy[index] = {
          ...copy[index],
          qty: newQty,
          total: newQty * copy[index].unit_price,
        };
      }
      return copy;
    });
  };

  const handleAddCustomShopItem = () => {
    if (!customItemName.trim()) {
      toast.error(lang === "bn" ? "পণ্যের নাম লিখুন" : "Enter product name");
      return;
    }
    const pr = parseFloat(customItemPrice) || 0;
    setShopItems(prev => [
      ...prev,
      {
        product_id: "custom_" + Date.now(),
        product_name: customItemName.trim(),
        qty: 1,
        unit_price: pr,
        total: pr,
      },
    ]);
    setCustomItemName("");
    setCustomItemPrice("");
    setCustomItemOpen(false);
  };

  // Shoppings with deduct_from_salary for selected salary employee
  const selectedSalEmp = useMemo(() => employees.find(x => x.id === salEmpId), [employees, salEmpId]);
  const selectedSalStats = useMemo(() => {
    if (!salEmpId) {
      return {
        baseSal: 0,
        shopDed: 0,
        paidSalariesInMonth: 0,
        advancesInMonth: 0,
        dailySpendsInMonth: 0,
        givenByOwner: 0,
        totalSpends: 0,
        totalBonus: 0,
        adjustmentsAdd: 0,
        adjustmentsDeduct: 0,
        debtRepaymentsInMonth: 0,
        alreadyPaid: 0,
        effectiveDeductions: 0,
        effectiveEarnings: 0,
        remaining: 0,
        owesStore: 0,
        netBalance: 0,
      };
    }
    return getEmployeeSalaryStats(salEmpId, salMonth, deductShopFromSalary);
  }, [salEmpId, salMonth, deductShopFromSalary, employees, shoppings, salaries, expenses]);
  const empShoppingDeductions = selectedSalStats.shopDed;

  // Filtered lists
  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      const q = search.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        (e.phone || "").includes(q) ||
        (e.email || "").toLowerCase().includes(q) ||
        (e.designation || "").toLowerCase().includes(q)
      );
    });
  }, [employees, search]);

  const filteredSalaries = useMemo(() => {
    return salaries.filter(s => {
      const q = search.toLowerCase();
      return s.employee_name.toLowerCase().includes(q) || s.month.includes(q);
    });
  }, [salaries, search]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const q = search.toLowerCase();
      return e.employee_name.toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q);
    });
  }, [expenses, search]);

  const filteredShoppings = useMemo(() => {
    return shoppings.filter(s => {
      const q = search.toLowerCase();
      const matchSearch = s.employee_name.toLowerCase().includes(q) || (s.note || "").toLowerCase().includes(q);
      if (!matchSearch) return false;
      if (shopFilter === "my" && currentEmployee) {
        return s.employee_id === currentEmployee.id || s.employee_name.toLowerCase() === currentEmployee.name.toLowerCase();
      }
      return true;
    });
  }, [shoppings, search, shopFilter, currentEmployee]);

  // Totals
  const totalSalariesPaid = useMemo(() => salaries.reduce((a, b) => a + (Number(b.amount) || 0), 0), [salaries]);
  const totalEmployeeExpenses = useMemo(() => expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0), [expenses]);
  const totalEmployeeShoppings = useMemo(() => shoppings.reduce((a, b) => a + (Number(b.total_amount) || 0), 0), [shoppings]);

  // Handle Employee Account Add / Update
  async function handleSaveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empName.trim()) {
      toast.error(lang === "bn" ? "কর্মচারীর নাম লিখুন" : "Please enter employee name");
      return;
    }
    if (!empPhone.trim() && !empEmail.trim()) {
      toast.error(lang === "bn" ? "ফোন নম্বর অথবা ইমেইল যেকোনো একটি অবশ্যই লিখুন" : "Please enter phone number or email");
      return;
    }

    setBusy(true);
    try {
      if (editingEmp) {
        await updateEmployeeFn({
          data: {
            id: editingEmp.id,
            name: empName.trim(),
            phone: empPhone.trim() || null,
            email: empEmail.trim() || null,
            designation: empDesignation,
            base_salary: Number(empSalary) || 0,
            monthly_salary: Number(empSalary) || 0,
            advance_limit: empAdvanceLimit ? Number(empAdvanceLimit) : (Number(empSalary) || 0),
            status: empStatus,
            password: empPassword.trim() || "1234",
            plain_password: empPassword.trim() || "1234",
            pin: empPin.trim() || empPassword.trim() || "1234",
            permissions: empPermissions,
          },
        });
        toast.success(lang === "bn" ? "কর্মচারী তথ্য আপডেট হয়েছে" : "Employee updated successfully");
      } else {
        await addEmployeeFn({
          data: {
            name: empName.trim(),
            phone: empPhone.trim() || null,
            email: empEmail.trim() || null,
            designation: empDesignation,
            base_salary: Number(empSalary) || 0,
            monthly_salary: Number(empSalary) || 0,
            advance_limit: empAdvanceLimit ? Number(empAdvanceLimit) : (Number(empSalary) || 0),
            status: empStatus,
            password: empPassword.trim() || "1234",
            plain_password: empPassword.trim() || "1234",
            pin: empPin.trim() || empPassword.trim() || "1234",
            permissions: empPermissions,
          },
        });
        toast.success(lang === "bn" ? "নতুন কর্মচারী যুক্ত হয়েছে" : "Employee added successfully");
      }

      qc.invalidateQueries({ queryKey: ["employees"] });
      setAddEmpOpen(false);
      setEditingEmp(null);
      setEmpName("");
      setEmpPhone("");
      setEmpEmail("");
      setEmpSalary("");
      setEmpAdvanceLimit("");
      setEmpPassword("1234");
      setEmpPin("1234");
    } catch (err: any) {
      toast.error(err.message || "Failed to save employee");
    } finally {
      setBusy(false);
    }
  }

  // Handle Salary Submit
  async function handleSaveSalary(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(salAmount);
    if (!salEmpId || isNaN(val) || val <= 0) {
      toast.error(lang === "bn" ? "কর্মচারী নির্বাচন করুন এবং সঠিক টাকার অঙ্ক লিখুন" : "Select employee and enter valid amount");
      return;
    }
    const emp = employees.find(x => x.id === salEmpId);
    const activeDed = deductShopFromSalary ? empShoppingDeductions : 0;
    setBusy(true);
    try {
      await createEmployeeSalaryFn({
        data: {
          employee_id: salEmpId,
          employee_name: emp?.name || "Employee",
          base_salary: emp?.base_salary || 0,
          deductions: activeDed,
          deduct_shoppings: deductShopFromSalary,
          month: salMonth,
          amount: val,
          payment_method: salMethod,
          note: salNote.trim() || (activeDed > 0 ? `পোশাক ও কেনাকাটা কর্তন: ${fmtMoney(activeDed)}` : null),
        },
      });
      toast.success(lang === "bn" ? "বেতন পরিশোধ রেকর্ড সংরক্ষিত হয়েছে" : "Salary payment recorded successfully");
      qc.invalidateQueries({ queryKey: ["employee_salaries"] });
      qc.invalidateQueries({ queryKey: ["employee_shoppings"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setAddSalaryOpen(false);
      setSalAmount("");
      setSalNote("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record salary");
    } finally {
      setBusy(false);
    }
  }

  // Handle Give Bonus Submit
  async function handleSaveBonus(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(bonusAmount);
    if (!bonusEmpId || isNaN(val) || val <= 0) {
      toast.error(lang === "bn" ? "কর্মচারী নির্বাচন করুন এবং সঠিক বোনাসের পরিমাণ লিখুন" : "Select employee and enter valid bonus amount");
      return;
    }
    const emp = employees.find(x => x.id === bonusEmpId);
    setBusy(true);
    try {
      await createEmployeeExpenseFn({
        data: {
          employee_id: bonusEmpId,
          employee_name: emp?.name || "Employee",
          category: "bonus",
          amount: val,
          payment_method: bonusMethod,
          date: bonusDate,
          note: bonusNote.trim() ? `🎁 বোনাস: ${bonusNote.trim()}` : "🎁 মালিক প্রদত্ত বোনাস (Owner Bonus)",
        },
      });
      toast.success(lang === "bn" ? `${emp?.name || "কর্মচারী"}-কে বোনাস প্রদান করা হয়েছে!` : "Employee bonus recorded!");
      qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setAddBonusOpen(false);
      setBonusAmount("");
      setBonusNote("");
    } catch (err: any) {
      toast.error(err.message || "Failed to give bonus");
    } finally {
      setBusy(false);
    }
  }

  // Handle Expense Submit
  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(expAmount);
    if (isNaN(val) || val <= 0) {
      toast.error(lang === "bn" ? "সঠিক টাকার অঙ্ক লিখুন" : "Please enter valid amount");
      return;
    }
    const emp = employees.find(x => x.id === expEmpId);
    setBusy(true);
    try {
      await createEmployeeExpenseFn({
        data: {
          employee_id: expEmpId || null,
          employee_name: emp?.name || "Employee",
          category: expCat,
          amount: val,
          payment_method: expMethod,
          date: expDate,
          note: expNote.trim() || null,
        },
      });
      toast.success(lang === "bn" ? "কর্মচারী খরচ যুক্ত হয়েছে" : "Employee expense recorded");
      qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setAddExpOpen(false);
      setExpAmount("");
      setExpNote("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record expense");
    } finally {
      setBusy(false);
    }
  }

  // Handle Collect Store Debt Submit
  async function handleCollectDebt(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(debtAmount);
    if (!debtEmpId || isNaN(val) || val <= 0) {
      toast.error(lang === "bn" ? "কর্মচারী নির্বাচন করুন এবং সঠিক টাকার পরিমাণ লিখুন" : "Select employee and enter valid amount");
      return;
    }
    const emp = employees.find(x => x.id === debtEmpId);
    setBusy(true);
    try {
      await createEmployeeExpenseFn({
        data: {
          employee_id: debtEmpId,
          employee_name: emp?.name || "Employee",
          category: "debt_repayment",
          amount: val,
          payment_method: debtMethod,
          date: debtDate,
          month: debtDate ? debtDate.slice(0, 7) : salMonth,
          note: debtNote.trim() ? `দোকান পাওনা আদায়: ${debtNote.trim()}` : "দোকানের পাওনা আদায় (Store Debt Repaid)",
        },
      });
      toast.success(lang === "bn" ? `${emp?.name || "কর্মচারী"}-এর পাওনা ৳${fmtMoney(val)} গ্রহণ করা হয়েছে!` : "Store debt payment recorded successfully!");
      qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setCollectDebtOpen(false);
      setDebtAmount("");
      setDebtNote("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record debt collection");
    } finally {
      setBusy(false);
    }
  }

  // Handle Manual Adjustment Submit (Overtime, Incentive, Late Fine, Penalty)
  async function handleSaveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(adjAmount);
    if (!adjEmpId || isNaN(val) || val <= 0) {
      toast.error(lang === "bn" ? "কর্মচারী নির্বাচন করুন এবং সঠিক টাকার অঙ্ক লিখুন" : "Select employee and enter valid amount");
      return;
    }
    const emp = employees.find(x => x.id === adjEmpId);
    const isAdd = adjType === "adjustment_add";
    setBusy(true);
    try {
      await createEmployeeExpenseFn({
        data: {
          employee_id: adjEmpId,
          employee_name: emp?.name || "Employee",
          category: adjType,
          amount: val,
          payment_method: "cash",
          date: adjDate,
          month: adjDate ? adjDate.slice(0, 7) : salMonth,
          note: adjNote.trim() || (isAdd ? "ওভারটাইম / বিশেষ ভাতা" : "জরিমানা / বিলম্বে উপস্থিতি কর্তন"),
        },
      });
      toast.success(lang === "bn" ? `${emp?.name || "কর্মচারী"}-এর বেতন সমন্বয় সংরক্ষিত হয়েছে` : "Adjustment recorded successfully");
      qc.invalidateQueries({ queryKey: ["employee_expenses"] });
      setAddAdjustmentOpen(false);
      setAdjAmount("");
      setAdjNote("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record adjustment");
    } finally {
      setBusy(false);
    }
  }

  // Handle Shopping Submit
  async function handleSaveShopping(e: React.FormEvent) {
    e.preventDefault();
    if (!shopEmpId) {
      toast.error(lang === "bn" ? "কর্মচারী নির্বাচন করুন" : "Please select employee");
      return;
    }
    if (shopItems.length === 0) {
      toast.error(lang === "bn" ? "কমপক্ষে ১টি পণ্য নির্বাচন করুন" : "Please add at least 1 product");
      return;
    }
    const total = shopItems.reduce((acc, curr) => acc + curr.total, 0);
    const emp = employees.find(x => x.id === shopEmpId);
    setBusy(true);
    try {
      await createEmployeeShoppingFn({
        data: {
          employee_id: shopEmpId,
          employee_name: emp?.name || "Employee",
          items: shopItems,
          total_amount: total,
          payment_status: shopStatus,
          note: shopNote.trim() || null,
        },
      });
      toast.success(lang === "bn" ? "কর্মচারীর পোশাক/পণ্য কেনাকাটা রেকর্ড হয়েছে ও স্টক আপডেট হয়েছে" : "Employee shopping recorded and stock updated");
      qc.invalidateQueries({ queryKey: ["employee_shoppings"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setAddShopOpen(false);
      setShopItems([]);
      setShopNote("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record shopping");
    } finally {
      setBusy(false);
    }
  }

  if (isEmployeeRole) {
    return null;
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Mobile Minimalist Header */}
      <div className="flex sm:hidden items-center justify-between gap-2 bg-card border border-border/70 p-2.5 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/more">
            <Button variant="ghost" size="icon" className="size-7 rounded-lg">
              <ArrowLeft className="size-3.5 text-muted-foreground" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-foreground truncate">
              {activeTab === "shoppings"
                ? (lang === "bn" ? "কর্মচারী কেনাকাটা" : "Staff Shopping")
                : (lang === "bn" ? "কর্মচারী ব্যবস্থাপনা" : "Employee Management")}
            </h1>
            <span className="text-[10px] text-muted-foreground">{employees.length} {lang === "bn" ? "জন কর্মী" : "staff"}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeTab === "accounts" && (
            <Button
              onClick={() => {
                setEditingEmp(null);
                setEmpName("");
                setEmpPhone("");
                setEmpEmail("");
                setEmpSalary("");
                setEmpAdvanceLimit("");
                setEmpPassword("1234");
                setEmpPin("1234");
                setAddEmpOpen(true);
              }}
              size="sm"
              className="h-7 px-2 text-[11px] rounded-lg bg-primary font-bold shadow-2xs"
            >
              <UserPlus className="size-3 mr-1" />
              <span>{lang === "bn" ? "যোগ" : "Add"}</span>
            </Button>
          )}

          {activeTab === "salaries" && (
            <Button
              onClick={() => setAddSalaryOpen(true)}
              size="sm"
              className="h-7 px-2 text-[11px] rounded-lg bg-emerald-600 font-bold text-white shadow-2xs"
            >
              <DollarSign className="size-3 mr-1" />
              <span>{lang === "bn" ? "বেতন" : "Pay"}</span>
            </Button>
          )}

          {activeTab === "expenses" && (
            <Button
              onClick={() => setAddExpOpen(true)}
              size="sm"
              className="h-7 px-2 text-[11px] rounded-lg bg-orange-600 font-bold text-white shadow-2xs"
            >
              <Receipt className="size-3 mr-1" />
              <span>{lang === "bn" ? "খরচ" : "Expense"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden sm:flex sm:items-center justify-between gap-3 bg-card border border-border/80 p-3 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3">
          <Link href="/more">
            <Button variant="ghost" size="icon" className="size-8 rounded-xl">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Users className="size-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold font-charukola text-foreground flex items-center gap-2">
              {lang === "bn" ? "কর্মচারী ব্যবস্থাপনা ও নিয়ন্ত্রণ" : "Employee Management Suite"}
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                {employees.length} {lang === "bn" ? "জন" : "Staff"}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground font-balooda">
              {lang === "bn"
                ? "কর্মচারী একাউন্ট, বেতন রেজিস্টার, দৈনিক খরচ ও পোশাক কেনাকাটা নিয়ন্ত্রণ"
                : "Manage staff accounts, salary payouts, daily allowances & shopping draws"}
            </p>
          </div>
        </div>

        {/* Tab-Specific Action Button (Desktop) */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              if (!bonusEmpId && employees.length > 0) setBonusEmpId(employees[0].id);
              setBonusAmount("");
              setBonusNote("");
              setAddBonusOpen(true);
            }}
            size="sm"
            variant="outline"
            className="h-8.5 rounded-xl text-xs font-bold gap-1.5 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 shadow-sm cursor-pointer"
          >
            <span>🎁</span>
            <span>{lang === "bn" ? "বোনাস দিন" : "Give Bonus"}</span>
          </Button>

          {activeTab === "accounts" && (
            <Button
              onClick={() => {
                setEditingEmp(null);
                setEmpName("");
                setEmpPhone("");
                setEmpEmail("");
                setEmpSalary("");
                setEmpAdvanceLimit("");
                setEmpPassword("1234");
                setEmpPin("1234");
                setAddEmpOpen(true);
              }}
              size="sm"
              className="h-8.5 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-sm cursor-pointer"
            >
              <UserPlus className="size-3.5" />
              <span>{lang === "bn" ? "নতুন কর্মচারী যোগ করুন" : "Add Employee"}</span>
            </Button>
          )}

          {activeTab === "salaries" && (
            <Button
              onClick={() => setAddSalaryOpen(true)}
              size="sm"
              className="h-8.5 rounded-xl text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
            >
              <DollarSign className="size-3.5" />
              <span>{lang === "bn" ? "বেতন প্রদান করুন" : "Pay Salary"}</span>
            </Button>
          )}

          {activeTab === "expenses" && (
            <Button
              onClick={() => setAddExpOpen(true)}
              size="sm"
              className="h-8.5 rounded-xl text-xs font-bold gap-1.5 bg-orange-600 hover:bg-orange-700 text-white shadow-sm cursor-pointer"
            >
              <Receipt className="size-3.5" />
              <span>{lang === "bn" ? "কর্মচারী খরচ / অগ্রিম যোগ" : "Add Expense / Advance"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Auto-Link Informational Notice (Desktop only) */}
      <div className="hidden sm:flex p-3 bg-gradient-to-r from-primary/10 via-indigo-500/5 to-transparent border border-primary/20 rounded-2xl items-start gap-2.5">
        <Info className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <span className="font-bold text-foreground">
            {lang === "bn" ? "💡 স্বয়ংক্রিয় কর্মচারী একাউন্ট লগইন পদ্ধতি:" : "💡 Automatic Employee Role Assignment:"}
          </span>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {lang === "bn"
              ? "এখানে কর্মচারীর যে ফোন নম্বর বা ইমেইল যোগ করবেন, সেই নম্বর/ইমেইল দিয়ে কর্মচারী সাইন-আপ করলে স্বয়ংক্রিয়ভাবে কর্মচারী একাউন্টে যুক্ত হয়ে যাবে।"
              : "When a staff signs up with the phone number or email registered here, they will automatically be assigned the Employee role with your configured permissions."}
          </p>
        </div>
      </div>

            {/* Top Quick Action Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-primary/10 border border-emerald-500/20 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
            <DollarSign className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold font-charukola text-foreground">
                {lang === "bn" ? "এমপ্লয়ি হাব ও ক্যাশবক্স থেকে টাকা উত্তোলন" : "Employee Hub & Cashbox Advance Draw"}
              </h2>
              <Badge variant="outline" className="text-[10px] bg-emerald-600 text-white border-transparent">
                {lang === "bn" ? "সক্রিয়" : "Active"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-balooda">
              {lang === "bn"
                ? "কর্মচারী এখান থেকে ক্যাশবক্স থেকে অগ্রিম টাকা নিতে পারবে যা খরচ হিসেবে যুক্ত হবে এবং অবশিষ্ট বেতন থেকে স্বয়ংক্রিয়ভাবে বাদ যাবে।"
                : "Employees can take advance money directly from cashbox which records as expense and deducts from remaining salary."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/employee-hub">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 rounded-xl px-3.5 gap-1.5 shadow-sm cursor-pointer text-xs">
              <DollarSign className="size-4" />
              <span>{lang === "bn" ? "টাকা উত্তোলন করুন / হাব" : "Take Advance / Hub"}</span>
            </Button>
          </Link>
          <Link href="/cash-management">
            <Button size="sm" variant="outline" className="font-bold h-9 rounded-xl px-3 gap-1.5 border-border cursor-pointer text-xs">
              <Banknote className="size-3.5 text-primary" />
              <span>{lang === "bn" ? "ক্যাশবক্স" : "Cashbox"}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards for Store Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <Card className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-card border-border/80 space-y-0.5 sm:space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] sm:text-[11px] font-semibold">{lang === "bn" ? "মোট কর্মচারী" : "Total Staff"}</span>
            <Users className="size-3 sm:size-3.5 text-primary" />
          </div>
          <p className="text-xs sm:text-base font-bold font-charukola text-foreground">{employees.length} {lang === "bn" ? "জন" : ""}</p>
          <span className="text-[9px] sm:text-[10px] text-emerald-600 block">{activeEmployeesCount} {lang === "bn" ? "সক্রিয়" : "Active"}</span>
        </Card>

        <Card className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-card border-border/80 space-y-0.5 sm:space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] sm:text-[11px] font-semibold">{lang === "bn" ? "মাসিক মোট বেতন" : "Total Salary Budget"}</span>
            <DollarSign className="size-3 sm:size-3.5 text-primary" />
          </div>
          <p className="text-xs sm:text-base font-bold font-charukola text-primary">{fmtMoney(totalBaseSalaries)}</p>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground block">{lang === "bn" ? "নির্ধারিত বাজেট" : "Monthly Fixed"}</span>
        </Card>

        <Card className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-card border-border/80 space-y-0.5 sm:space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] sm:text-[11px] font-semibold">{lang === "bn" ? "উত্তোলিত অগ্রিম" : "Advances Drawn"}</span>
            <TrendingDown className="size-3 sm:size-3.5 text-orange-600" />
          </div>
          <p className="text-xs sm:text-base font-bold font-charukola text-orange-600">{fmtMoney(totalMonthlyAdvances)}</p>
          <span className="text-[9px] sm:text-[10px] text-orange-600/80 block">{lang === "bn" ? "চলতি মাসে কাটা" : "Deductions"}</span>
        </Card>

        <Card className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-card border-border/80 space-y-0.5 sm:space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] sm:text-[11px] font-semibold">{lang === "bn" ? "অবশিষ্ট প্রদেয়" : "Remaining Payable"}</span>
            <Wallet className="size-3 sm:size-3.5 text-emerald-600" />
          </div>
          <p className="text-xs sm:text-base font-bold font-charukola text-emerald-600">{fmtMoney(totalRemainingPayable)}</p>
          <span className="text-[9px] sm:text-[10px] text-emerald-600/80 block">{lang === "bn" ? "মাসের বাকি বেতন" : "Net Due"}</span>
        </Card>

        <Card className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-card border-border/80 space-y-0.5 sm:space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] sm:text-[11px] font-semibold">{lang === "bn" ? "ক্যাশবক্স ব্যালেন্স" : "Cashbox Live"}</span>
            <Banknote className="size-3.5 text-blue-600" />
          </div>
          <p className="text-xs sm:text-base font-bold font-charukola text-blue-600">{fmtMoney(liveCashBalance)}</p>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground block">{lang === "bn" ? "দোকানের নগদ ক্যাশ" : "Live Cash"}</span>
        </Card>

        <Card className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-card border-border/80 space-y-0.5 sm:space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] sm:text-[11px] font-semibold">{lang === "bn" ? "পরিশোধিত বেতন" : "Salaries Paid"}</span>
            <Receipt className="size-3.5 text-indigo-600" />
          </div>
          <p className="text-xs sm:text-base font-bold font-charukola text-indigo-600">{fmtMoney(totalMonthlySalariesPaid)}</p>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground block">{salaries.length} {lang === "bn" ? "টি রসিদ" : "Vouchers"}</span>
        </Card>

        {/* Small standard KPI card for "কর্মচারী ব্যক্তিগত কেপিআই" placed at the LAST of other KPIs with hidden amount & link to dedicated page */}
        {isEmployeeRole && (
          <Card
            onClick={() => router.push("/employee-hub")}
            className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-card border-indigo-500/40 hover:border-indigo-500 space-y-0.5 sm:space-y-1 shadow-2xs cursor-pointer transition-all group relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] sm:text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 truncate">
                <Users className="size-3 sm:size-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">{lang === "bn" ? "কর্মচারী ব্যক্তিগত কেপিআই" : "Personal Staff KPI"}</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPersonalKpiRevealed(!personalKpiRevealed);
                }}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer shrink-0"
                title={personalKpiRevealed ? "Hide" : "Reveal"}
              >
                {personalKpiRevealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              </button>
            </div>
            <p className="text-xs sm:text-base font-bold font-charukola text-indigo-600">
              {personalKpiRevealed ? `৳${fmtMoney(myRolloverCalc?.remainingSalary ?? myEmployeeStats?.remaining ?? 0)}` : "••••••"}
            </p>
            <span className="text-[9px] sm:text-[10px] text-muted-foreground block truncate group-hover:text-indigo-600">
              {personalKpiRevealed
                ? (lang === "bn" ? `অবশিষ্ট সীমা: ৳${fmtMoney(myRolloverCalc?.remainingAdvanceLimit ?? (Number(currentEmployee?.advance_limit ?? currentEmployee?.base_salary ?? 0) - (myEmployeeStats?.advancesInMonth || 0)))}` : `Available: ৳${fmtMoney(myRolloverCalc?.remainingAdvanceLimit ?? 0)}`)
                : (lang === "bn" ? "ট্যাপ করে বিস্তারিত হাব দেখুন →" : "Tap to open personal hub →")}
            </span>
          </Card>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <TabsList className="bg-muted/60 p-1 rounded-xl h-auto grid grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="accounts" className="rounded-lg text-xs py-1.5 font-bold gap-1.5">
              <Users className="size-3.5" />
              <span>{lang === "bn" ? "কর্মচারী একাউন্ট" : "Accounts"}</span>
            </TabsTrigger>
            <TabsTrigger value="salaries" className="rounded-lg text-xs py-1.5 font-bold gap-1.5">
              <DollarSign className="size-3.5" />
              <span>{lang === "bn" ? "বেতন হিসাব" : "Salary"}</span>
            </TabsTrigger>
            <TabsTrigger value="expenses" className="rounded-lg text-xs py-1.5 font-bold gap-1.5">
              <Receipt className="size-3.5" />
              <span>{lang === "bn" ? "দৈনিক খরচ" : "Expenses"}</span>
            </TabsTrigger>
            <TabsTrigger value="shoppings" className="rounded-lg text-xs py-1.5 font-bold gap-1.5">
              <Shirt className="size-3.5" />
              <span>{lang === "bn" ? "কেনাকাটা" : "Shopping"}</span>
            </TabsTrigger>
          </TabsList>

          <div className="relative min-w-[200px] sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder={lang === "bn" ? "সার্চ করুন..." : "Search..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8.5 pl-8 text-xs rounded-xl bg-card"
            />
          </div>
        </div>

        {/* ── TAB 1: ACCOUNTS & STAFF LIST ── */}
        <TabsContent value="accounts" className="space-y-3">
          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {filteredEmployees.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Users className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground font-balooda">
                  {lang === "bn" ? "কোনো কর্মচারী পাওয়া যায়নি" : "No employees found"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddEmpOpen(true)}
                  className="text-xs rounded-xl"
                >
                  {lang === "bn" ? "প্রথম কর্মচারী যোগ করুন" : "Add first employee"}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredEmployees.map(e => {
                  const empStats = getEmployeeSalaryStats(e.id, currentMonthStr, true);
                  return (
                    <div key={e.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-10 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold font-charukola text-sm shrink-0">
                          {e.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{e.name}</span>
                            <Badge variant="outline" className={`text-[10px] ${e.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                              {e.status === "active" ? (lang === "bn" ? "সক্রিয়" : "Active") : (lang === "bn" ? "নিষ্ক্রিয়" : "Inactive")}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {e.designation || "Staff"}
                            </Badge>
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 text-[11px]">
                              <KeyRound className="size-3 text-amber-500" />
                              {lang === "bn" ? "লগইন পিন:" : "PIN:"} {(e as any).pin || (e as any).plain_password || (e as any).password || "1234"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {e.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="size-3 text-muted-foreground" /> {e.phone}
                              </span>
                            )}
                            {e.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="size-3 text-muted-foreground" /> {e.email}
                              </span>
                            )}
                            <span className="font-semibold text-foreground font-charukola bg-muted/60 px-2 py-0.5 rounded-md border border-border/60">
                              {lang === "bn" ? "মাসিক বেতন:" : "Base Salary:"} {fmtMoney(empStats.baseSal)}
                            </span>
                            <span className="text-[11px] font-bold text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                              {lang === "bn" ? "খরচ ও কেনাকাটা:" : "Spends:"} {fmtMoney(empStats.totalSpends)}
                            </span>
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                              {lang === "bn" ? "মালিক প্রদত্ত:" : "Given by Owner:"} {fmtMoney(empStats.givenByOwner)}
                            </span>
                            {empStats.owesStore > 0 ? (
                              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-500/15 px-2.5 py-0.5 rounded-md border border-rose-500/30 shadow-2xs flex items-center gap-1">
                                <AlertCircle className="size-3 text-rose-600" />
                                {lang === "bn" ? "দোকান পায়:" : "Owes Store:"} ৳{fmtMoney(empStats.owesStore)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded-md border border-emerald-500/30 shadow-2xs">
                                {lang === "bn" ? "অবশিষ্ট বেতন:" : "Remaining Salary:"} {fmtMoney(empStats.remaining)}
                              </span>
                            )}
                            {empStats.totalBonus > 0 && (
                              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30">
                                🎁 {lang === "bn" ? "বোনাস:" : "Bonus:"} {fmtMoney(empStats.totalBonus)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 flex-wrap">
                        {empStats.owesStore > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs rounded-xl gap-1 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold cursor-pointer"
                            onClick={() => {
                              setDebtEmpId(e.id);
                              setDebtAmount(String(empStats.owesStore));
                              setDebtNote(lang === "bn" ? "দোকানের পাওনা আদায়" : "Store debt collection");
                              setCollectDebtOpen(true);
                            }}
                          >
                            <ArrowDownLeft className="size-3" />
                            <span>{lang === "bn" ? "পাওনা আদায়" : "Collect Debt"}</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs rounded-xl gap-1 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold cursor-pointer"
                          onClick={() => {
                            setBonusEmpId(e.id);
                            setBonusAmount("");
                            setBonusNote("");
                            setAddBonusOpen(true);
                          }}
                        >
                          <span>🎁</span>
                          <span>{lang === "bn" ? "বোনাস দিন" : "Bonus"}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs rounded-xl gap-1 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer"
                          onClick={() => {
                            setSalEmpId(e.id);
                            setDeductShopFromSalary(true);
                            setSalAmount(String(empStats.remaining));
                            setAddSalaryOpen(true);
                          }}
                        >
                          <DollarSign className="size-3" />
                          <span>{lang === "bn" ? "বেতন দিন" : "Pay Salary"}</span>
                        </Button>
                        {user?.role === "owner" && (
                          <OwnerEmployeeDeviceLink
                            employeeId={e.id}
                            employeeName={e.name}
                            employeePin={(e as any).pin || (e as any).plain_password || (e as any).password || "1234"}
                            disabled={e.status === "inactive"}
                          />
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs rounded-xl gap-1"
                          onClick={() => {
                            setEditingEmp(e);
                            setEmpName(e.name || "");
                            setEmpPhone(e.phone || "");
                            setEmpEmail(e.email || "");
                            setEmpDesignation(e.designation || "Sales Staff");
                            setEmpSalary(e.base_salary ? String(e.base_salary) : "");
                            setEmpAdvanceLimit(e.advance_limit !== undefined ? String(e.advance_limit) : (e.base_salary ? String(e.base_salary) : ""));
                            setEmpStatus(e.status || "active");
                            setEmpPassword((e as any).plain_password || (e as any).password || (e as any).pin || "1234");
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
                          }}
                        >
                          <Pencil className="size-3" />
                          <span>{lang === "bn" ? "সম্পাদনা" : "Edit"}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10 rounded-xl"
                          onClick={async () => {
                            if (confirm(lang === "bn" ? "আপনি কি এই কর্মচারীকে মুছে ফেলতে চান?" : "Are you sure you want to delete this employee?")) {
                              await deleteEmployeeFn({ data: { id: e.id } });
                              qc.invalidateQueries({ queryKey: ["employees"] });
                              toast.success(lang === "bn" ? "কর্মচারী মুছে ফেলা হয়েছে" : "Employee deleted");
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── TAB 2: SALARIES ── */}
        <TabsContent value="salaries" className="space-y-3">
          {/* Monthly Salary Navigation & Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-muted/40 border border-border/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                {lang === "bn" ? "বেতনের মাস নির্বাচন:" : "Salary Month:"}
              </span>
              <Select
                value={salMonth}
                onValueChange={(val) => setSalMonth(val)}
              >
                <SelectTrigger className="h-8 text-xs font-bold w-[170px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCycles.map(c => (
                    <SelectItem key={c} value={c}>
                      {c} {c === currentMonthStr ? (lang === "bn" ? "(চলতি মাস)" : "(Current)") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-bold rounded-xl border-purple-500/30 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10 cursor-pointer"
                onClick={() => {
                  if (employees.length > 0 && !adjEmpId) setAdjEmpId(employees[0].id);
                  setAddAdjustmentOpen(true);
                }}
              >
                <Scale className="size-3.5 mr-1" />
                {lang === "bn" ? "হাতে সমন্বয় (ওভারটাইম/জরিমানা)" : "Manual Adjustment"}
              </Button>
            </div>
          </div>

          {/* Employee Monthly Salary Status Cards (Spends, Given by Owner, Bonus, Store Debt & Remaining Salary) */}
          {employees.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {employees.map(emp => {
                const st = getEmployeeSalaryStats(emp.id, salMonth, true);
                const hasStoreDebt = st.owesStore > 0;
                return (
                  <Card key={emp.id} className="p-3 rounded-2xl border border-border/80 bg-card shadow-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-xs sm:text-sm text-foreground">{emp.name}</p>
                        <span className="text-[10px] text-muted-foreground">{emp.designation || "Staff"} • {salMonth}</span>
                      </div>
                      {hasStoreDebt ? (
                        <Badge variant="outline" className="text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 flex items-center gap-1">
                          <AlertCircle className="size-3 text-rose-600" />
                          {lang === "bn" ? "দোকান পায়:" : "Owes Store:"} ৳{fmtMoney(st.owesStore)}
                        </Badge>
                      ) : st.remaining > 0 ? (
                        <Badge variant="outline" className="text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                          {lang === "bn" ? "বকেয়া বেতন:" : "Due Salary:"} ৳{fmtMoney(st.remaining)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
                          {lang === "bn" ? "পরিশোধ সম্পন্ন" : "Settled"}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-muted/40 p-2 rounded-xl border border-border/60">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{lang === "bn" ? "মূল বেতন:" : "Base:"}</span>
                        <span className="font-bold font-mono">{fmtMoney(st.baseSal)}</span>
                      </div>
                      <div className="flex justify-between text-orange-600">
                        <span>{lang === "bn" ? "খরচ/কেনা:" : "Spends:"}</span>
                        <span className="font-bold font-mono">-{fmtMoney(st.totalSpends)}</span>
                      </div>
                      <div className="flex justify-between text-blue-600">
                        <span>{lang === "bn" ? "মালিক প্রদত্ত:" : "Given:"}</span>
                        <span className="font-bold font-mono">-{fmtMoney(st.givenByOwner)}</span>
                      </div>
                      <div className="flex justify-between text-amber-600">
                        <span>🎁 {lang === "bn" ? "বোনাস:" : "Bonus:"}</span>
                        <span className="font-bold font-mono">{fmtMoney(st.totalBonus)}</span>
                      </div>
                      {st.adjustmentsAdd > 0 && (
                        <div className="flex justify-between text-purple-600 col-span-2">
                          <span>{lang === "bn" ? "ওভারটাইম/বৃদ্ধি:" : "Overtime:"}</span>
                          <span className="font-bold font-mono">+{fmtMoney(st.adjustmentsAdd)}</span>
                        </div>
                      )}
                      {st.adjustmentsDeduct > 0 && (
                        <div className="flex justify-between text-rose-600 col-span-2">
                          <span>{lang === "bn" ? "জরিমানা/কর্তন:" : "Penalty:"}</span>
                          <span className="font-bold font-mono">-{fmtMoney(st.adjustmentsDeduct)}</span>
                        </div>
                      )}
                      {st.debtRepaymentsInMonth > 0 && (
                        <div className="flex justify-between text-emerald-600 col-span-2">
                          <span>{lang === "bn" ? "পাওনা জমা:" : "Debt Repaid:"}</span>
                          <span className="font-bold font-mono">৳{fmtMoney(st.debtRepaymentsInMonth)}</span>
                        </div>
                      )}
                    </div>

                    {hasStoreDebt && (
                      <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-700 dark:text-rose-300 font-semibold flex items-center justify-between">
                        <span>⚠️ {lang === "bn" ? "কর্মচারী দোকানকে দেবে:" : "Employee owes store:"}</span>
                        <span className="font-bold font-mono text-rose-600">৳{fmtMoney(st.owesStore)}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      {hasStoreDebt ? (
                        <Button
                          size="sm"
                          className="h-7 flex-1 text-[11px] rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                          onClick={() => {
                            setDebtEmpId(emp.id);
                            setDebtAmount(String(st.owesStore));
                            setDebtNote(lang === "bn" ? "দোকান পাওনা আদায়" : "Store debt collection");
                            setCollectDebtOpen(true);
                          }}
                        >
                          <ArrowDownLeft className="size-3 mr-1" />
                          {lang === "bn" ? "পাওনা আদায়" : "Collect Debt"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 flex-1 text-[11px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                          onClick={() => {
                            setSalEmpId(emp.id);
                            setDeductShopFromSalary(true);
                            setSalAmount(String(st.remaining));
                            setAddSalaryOpen(true);
                          }}
                        >
                          <DollarSign className="size-3 mr-1" />
                          {lang === "bn" ? "বেতন দিন" : "Pay Salary"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] rounded-lg border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold cursor-pointer"
                        title={lang === "bn" ? "হাতে সমন্বয় (ওভারটাইম / জরিমানা)" : "Add Adjustment"}
                        onClick={() => {
                          setAdjEmpId(emp.id);
                          setAdjAmount("");
                          setAdjNote("");
                          setAddAdjustmentOpen(true);
                        }}
                      >
                        <Scale className="size-3 mr-1" />
                        {lang === "bn" ? "সমন্বয়" : "Adj"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] rounded-lg border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold cursor-pointer"
                        onClick={() => {
                          setBonusEmpId(emp.id);
                          setBonusAmount("");
                          setBonusNote("");
                          setAddBonusOpen(true);
                        }}
                      >
                        🎁 {lang === "bn" ? "বোনাস" : "Bonus"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {filteredSalaries.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <DollarSign className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground font-balooda">
                  {lang === "bn" ? "কোনো বেতন রেকর্ড নেই" : "No salary payments recorded"}
                </p>
                <Button size="sm" variant="outline" onClick={() => setAddSalaryOpen(true)} className="text-xs rounded-xl">
                  {lang === "bn" ? "প্রথম বেতন প্রদান করুন" : "Record first salary"}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredSalaries.map(s => (
                  <div key={s.id} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shrink-0">
                        <DollarSign className="size-4" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{s.employee_name}</span>
                          <Badge variant="outline" className="text-[10px] bg-muted font-mono">
                            {s.month}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {s.payment_method}
                          </Badge>
                        </div>
                        {s.note && <p className="text-xs text-muted-foreground truncate">{s.note}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-sm sm:text-base font-charukola text-emerald-600">
                          {fmtMoney(s.amount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{s.payment_date || fmtDate(s.created_at)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-rose-600"
                        onClick={async () => {
                          if (confirm(lang === "bn" ? "এই বেতন রেকর্ড মুছে ফেলতে চান?" : "Delete this salary record?")) {
                            await deleteEmployeeSalaryFn({ data: { id: s.id } });
                            qc.invalidateQueries({ queryKey: ["employee_salaries"] });
                            qc.invalidateQueries({ queryKey: ["expenses"] });
                            qc.invalidateQueries({ queryKey: ["cashbox"] });
                            toast.success(lang === "bn" ? "মুছে ফেলা হয়েছে" : "Deleted");
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── TAB 3: EXPENSES ── */}
        <TabsContent value="expenses" className="space-y-3">
          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {filteredExpenses.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Receipt className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground font-balooda">
                  {lang === "bn" ? "কোনো খরচ পাওয়া যায়নি" : "No employee expenses recorded"}
                </p>
                <Button size="sm" variant="outline" onClick={() => setAddExpOpen(true)} className="text-xs rounded-xl">
                  {lang === "bn" ? "প্রথম খরচ যোগ করুন" : "Add first expense"}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredExpenses.map(e => (
                  <div key={e.id} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-600 border border-orange-500/20 shrink-0">
                        <Receipt className="size-4" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{e.employee_name}</span>
                          <Badge variant="outline" className={`text-[10px] ${
                            e.category === "bonus"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold"
                              : e.category === "advance"
                              ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 font-bold"
                              : "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20"
                          }`}>
                            {e.category === "bonus"
                              ? (lang === "bn" ? "🎁 বোনাস (মালিক প্রদত্ত)" : "🎁 Bonus")
                              : e.category === "advance"
                              ? (lang === "bn" ? "💵 মালিক প্রদত্ত টাকা / অগ্রিম" : "💵 Given by Owner / Advance")
                              : e.category === "food"
                              ? (lang === "bn" ? "খাবার ভাতা" : "Food")
                              : e.category === "travel"
                              ? (lang === "bn" ? "যাতায়াত" : "Travel")
                              : e.category === "tea"
                              ? (lang === "bn" ? "নাস্তা / চা" : "Tea / Snacks")
                              : (lang === "bn" ? "অন্যান্য খরচ" : "Other Spend")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{e.date}</span>
                        </div>
                        {e.note && <p className="text-xs text-muted-foreground truncate">{e.note}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-sm sm:text-base font-charukola text-orange-600">
                          {fmtMoney(e.amount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{e.payment_method}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-rose-600"
                        onClick={async () => {
                          if (confirm(lang === "bn" ? "এই খরচ মুছে ফেলতে চান?" : "Delete this expense?")) {
                            await deleteEmployeeExpenseFn({ data: { id: e.id } });
                            qc.invalidateQueries({ queryKey: ["employee_expenses"] });
                            qc.invalidateQueries({ queryKey: ["expenses"] });
                            qc.invalidateQueries({ queryKey: ["cashbox"] });
                            toast.success(lang === "bn" ? "মুছে ফেলা হয়েছে" : "Deleted");
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── TAB 4: SHOPPINGS ── */}
        <TabsContent value="shoppings" className="space-y-3">
          {/* Shopping Filter & Quick Action Bar */}
          <div className="flex items-center justify-between gap-2 flex-wrap bg-card border border-border/80 p-2 sm:p-2.5 rounded-xl shadow-xs">
            <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/80 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShopFilter("all")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  shopFilter === "all"
                    ? "bg-card text-foreground shadow-xs border border-border/80 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{lang === "bn" ? "সকলের কেনাকাটা" : "All Staff"}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {shoppings.length}
                </Badge>
              </button>

              <button
                type="button"
                onClick={() => setShopFilter("my")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  shopFilter === "my"
                    ? "bg-card text-pink-600 dark:text-pink-400 shadow-xs border border-pink-500/30 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Shirt className="size-3 text-pink-600" />
                <span>{lang === "bn" ? "আমার কেনাকাটা" : "My Shopping"}</span>
                {currentEmployee && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-pink-500/10 text-pink-600">
                    {shoppings.filter(s => s.employee_id === currentEmployee.id || s.employee_name.toLowerCase() === currentEmployee.name.toLowerCase()).length}
                  </Badge>
                )}
              </button>
            </div>

            <Button
              size="sm"
              onClick={handleOpenAddShop}
              className="h-8 rounded-xl text-xs font-bold gap-1 bg-pink-600 hover:bg-pink-700 text-white shadow-xs cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{lang === "bn" ? "কেনাকাটা এন্ট্রি" : "Add Record"}</span>
            </Button>
          </div>

          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {filteredShoppings.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Shirt className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground font-balooda">
                  {lang === "bn" ? "কোনো কেনাকাটা রেকর্ড পাওয়া যায়নি" : "No employee shopping records"}
                </p>
                <Button size="sm" variant="outline" onClick={handleOpenAddShop} className="text-xs rounded-xl">
                  {lang === "bn" ? "প্রথম কেনাকাটা রেকর্ড করুন" : "Record first shopping"}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredShoppings.map(s => (
                  <div key={s.id} className="p-2.5 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-muted/25 transition-colors">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="p-2 rounded-xl bg-pink-500/10 text-pink-600 border border-pink-500/20 shrink-0 mt-0.5">
                        <Shirt className="size-3.5 sm:size-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-foreground">{s.employee_name}</span>
                          <Badge variant="outline" className={`text-[9px] sm:text-[10px] px-2 py-0.2 rounded-full font-medium ${s.payment_status === "paid_cash" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : s.payment_status === "gift" ? "bg-purple-500/10 text-purple-600 border-purple-500/20" : (s.is_settled || s.settled) ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>
                            {s.payment_status === "paid_cash" ? (lang === "bn" ? "নগদ পরিশোধ" : "Paid Cash") : s.payment_status === "gift" ? (lang === "bn" ? "উপহার / ফ্রি" : "Gift") : (s.is_settled || s.settled) ? (lang === "bn" ? "বেতন কর্তিত (পরিশোধিত)" : "Deducted & Settled") : (lang === "bn" ? "বেতন থেকে কর্তন (বকেয়া)" : "Deduct from Salary (Pending)")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">{s.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          {s.items?.map((item, idx) => {
                            const unitP = item.unit_price || (item.total && item.qty ? Math.round(item.total / item.qty) : 0);
                            return (
                              <span key={idx} className="bg-muted px-2 py-0.5 rounded-md font-medium text-foreground text-[11px]">
                                {item.product_name} x{item.qty} {unitP > 0 ? `(৳${unitP})` : ""}
                              </span>
                            );
                          })}
                        </div>
                        {s.note && <p className="text-[10px] sm:text-xs text-muted-foreground italic">{s.note}</p>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 self-stretch sm:self-center border-t sm:border-0 pt-2 sm:pt-0 border-border/50 shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-muted-foreground sm:hidden block">{lang === "bn" ? "মোট মূল্য:" : "Total:"}</span>
                        <p className="font-bold text-xs sm:text-sm font-charukola text-pink-600">
                          {fmtMoney(s.total_amount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-lg text-muted-foreground hover:text-primary cursor-pointer"
                          title={lang === "bn" ? "রসিদ প্রিন্ট করুন" : "Print Voucher Slip"}
                          onClick={() => setPrintSlipItem(s)}
                        >
                          <Printer className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-lg text-muted-foreground hover:text-rose-600 cursor-pointer"
                          onClick={async () => {
                            if (confirm(lang === "bn" ? "এই কেনাকাটা রেকর্ড মুছে ফেলতে চান?" : "Delete this shopping record?")) {
                              await deleteEmployeeShoppingFn({ data: { id: s.id } });
                              qc.invalidateQueries({ queryKey: ["employee_shoppings"] });
                              toast.success(lang === "bn" ? "মুছে ফেলা হয়েছে" : "Deleted");
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ──────────────── Modal 1: Add / Edit Employee ──────────────── */}
      <Dialog open={addEmpOpen} onOpenChange={setAddEmpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              {editingEmp ? (lang === "bn" ? "কর্মচারী তথ্য ও পারমিশন সম্পাদনা" : "Edit Employee & Permissions") : (lang === "bn" ? "নতুন কর্মচারী যোগ করুন" : "Add New Employee")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEmployee} className="space-y-3.5 font-balooda">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "কর্মচারীর নাম *" : "Full Name *"}</Label>
                <Input
                  required
                  placeholder="e.g. Rahim Ahmed"
                  value={empName}
                  onChange={e => setEmpName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "পদবী / রোল" : "Designation"}</Label>
                <Input
                  placeholder="e.g. Sales Executive"
                  value={empDesignation}
                  onChange={e => setEmpDesignation(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "মোবাইল নম্বর (লগইন লিংক)" : "Phone Number (Auto-Link)"}</Label>
                <Input
                  placeholder="017XXXXXXXX"
                  value={empPhone}
                  onChange={e => setEmpPhone(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "ইমেইল (লগইন লিংক)" : "Email (Auto-Link)"}</Label>
                <Input
                  type="email"
                  placeholder="staff@example.com"
                  value={empEmail}
                  onChange={e => setEmpEmail(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "মাসিক মূল বেতন (৳)" : "Base Monthly Salary (৳)"}</Label>
                <Input
                  type="number"
                  placeholder="12000"
                  value={empSalary}
                  onChange={e => setEmpSalary(e.target.value)}
                  className="h-9 text-xs font-charukola"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "অগ্রিম তোলার সর্বোচ্চ সীমা (৳)" : "Advance Limit (৳)"}</Label>
                <Input
                  type="number"
                  placeholder={empSalary || "12000"}
                  value={empAdvanceLimit}
                  onChange={e => setEmpAdvanceLimit(e.target.value)}
                  className="h-9 text-xs font-charukola"
                />
                <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "খালি রাখলে মূল বেতনই সীমা" : "Default is base salary"}</span>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "স্ট্যাটাস" : "Status"}</Label>
                <Select value={empStatus} onValueChange={v => setEmpStatus(v as any)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{lang === "bn" ? "🟢 সক্রিয় (Active)" : "🟢 Active"}</SelectItem>
                    <SelectItem value="inactive">{lang === "bn" ? "🔴 নিষ্ক্রিয় (Inactive)" : "🔴 Inactive"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            
            {/* Login Credentials: Password & PIN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/20">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                  <KeyRound className="size-3.5" />
                  {lang === "bn" ? "লগইন পাসওয়ার্ড *" : "Login Password *"}
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. 1234"
                  value={empPassword}
                  onChange={e => setEmpPassword(e.target.value)}
                  className="h-9 text-xs font-mono bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                  <Lock className="size-3.5" />
                  {lang === "bn" ? "৪-ডিজিট সিক্রেট পিন" : "4-Digit Quick PIN"}
                </Label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="1234"
                  value={empPin}
                  onChange={e => setEmpPin(e.target.value)}
                  className="h-9 text-xs font-mono bg-background"
                />
              </div>
            </div>

            {/* Permissions Matrix */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" />
                {lang === "bn" ? "কর্মচারী পারমিশন ও এক্সেস সেটিংস:" : "Employee Permissions & Access Control:"}
              </Label>
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-2.5 rounded-xl border">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="p_sales"
                    checked={empPermissions.can_sales}
                    onCheckedChange={v => setEmpPermissions({ ...empPermissions, can_sales: Boolean(v) })}
                  />
                  <Label htmlFor="p_sales" className="text-[11px] cursor-pointer">{lang === "bn" ? "বিক্রয় / POS বিলিং" : "Sales & POS"}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="p_cust"
                    checked={empPermissions.can_customers}
                    onCheckedChange={v => setEmpPermissions({ ...empPermissions, can_customers: Boolean(v) })}
                  />
                  <Label htmlFor="p_cust" className="text-[11px] cursor-pointer">{lang === "bn" ? "কাস্টমার ও বাকি আদায়" : "Customers & Dues"}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="p_returns"
                    checked={empPermissions.can_returns}
                    onCheckedChange={v => setEmpPermissions({ ...empPermissions, can_returns: Boolean(v) })}
                  />
                  <Label htmlFor="p_returns" className="text-[11px] cursor-pointer">{lang === "bn" ? "পণ্য পরিবর্তন / এক্সচেঞ্জ" : "Returns & Exchange"}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="p_prod"
                    checked={empPermissions.can_products}
                    onCheckedChange={v => setEmpPermissions({ ...empPermissions, can_products: Boolean(v) })}
                  />
                  <Label htmlFor="p_prod" className="text-[11px] cursor-pointer">{lang === "bn" ? "পণ্য যোগ ও সম্পাদনা" : "Product Management"}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="p_exp"
                    checked={empPermissions.can_expenses}
                    onCheckedChange={v => setEmpPermissions({ ...empPermissions, can_expenses: Boolean(v) })}
                  />
                  <Label htmlFor="p_exp" className="text-[11px] cursor-pointer">{lang === "bn" ? "দোকান খরচ এন্ট্রি" : "Add Expenses"}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="p_rep"
                    checked={empPermissions.can_reports}
                    onCheckedChange={v => setEmpPermissions({ ...empPermissions, can_reports: Boolean(v) })}
                  />
                  <Label htmlFor="p_rep" className="text-[11px] cursor-pointer">{lang === "bn" ? "রিপোর্ট ও লাভ দেখা" : "View Reports"}</Label>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddEmpOpen(false)} className="rounded-xl text-xs">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} size="sm" className="rounded-xl text-xs font-bold bg-primary text-primary-foreground">
                {busy ? <RefreshCw className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                <span>{editingEmp ? (lang === "bn" ? "আপডেট করুন" : "Save Changes") : (lang === "bn" ? "যোগ করুন" : "Add Staff")}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── Modal 2: Pay Salary ──────────────── */}
      <Dialog open={addSalaryOpen} onOpenChange={setAddSalaryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center gap-2">
              <DollarSign className="size-4 text-emerald-600" />
              {lang === "bn" ? "কর্মচারী বেতন প্রদান" : "Pay Employee Salary"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveSalary} className="space-y-3 font-balooda">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "কর্মচারী নির্বাচন *" : "Select Employee *"}</Label>
              <Select value={salEmpId} onValueChange={v => {
                setSalEmpId(v);
                setDeductShopFromSalary(true);
                const stats = getEmployeeSalaryStats(v, salMonth, true);
                setSalAmount(String(stats.remaining));
              }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={lang === "bn" ? "কর্মচারী বাছাই করুন" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => {
                    const st = getEmployeeSalaryStats(e.id, salMonth, true);
                    return (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} — {lang === "bn" ? "অবশিষ্ট:" : "Rem:"} {fmtMoney(st.remaining)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {salEmpId && (
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/70 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>{lang === "bn" ? "মাসিক মূল বেতন:" : "Base Monthly Salary:"}</span>
                  <span className="font-bold text-foreground font-mono">{fmtMoney(selectedSalStats.baseSal)}</span>
                </div>
                {selectedSalStats.givenByOwner > 0 ? (
                  <div className="flex justify-between items-center text-blue-600 font-semibold">
                    <span>{lang === "bn" ? "মালিক প্রদত্ত (অগ্রিম ও বেতন):" : "Given by Owner (Salary + Advance):"}</span>
                    <span className="font-mono font-bold">-{fmtMoney(selectedSalStats.givenByOwner)}</span>
                  </div>
                ) : null}
                {selectedSalStats.dailySpendsInMonth > 0 ? (
                  <div className="flex justify-between items-center text-orange-600 font-semibold">
                    <span>{lang === "bn" ? "কর্মচারী দৈনিক খরচ:" : "Employee Daily Spends:"}</span>
                    <span className="font-mono font-bold">-{fmtMoney(selectedSalStats.dailySpendsInMonth)}</span>
                  </div>
                ) : null}
                {empShoppingDeductions > 0 ? (
                  <div className="space-y-1 pt-0.5">
                    <div className="flex justify-between items-center text-rose-600 font-semibold">
                      <span>{lang === "bn" ? "পোশাক/পণ্য কেনাকাটা (বাকি):" : "Shopping Deductions:"}</span>
                      <span className="font-mono font-bold">
                        {deductShopFromSalary ? `-${fmtMoney(empShoppingDeductions)}` : fmtMoney(empShoppingDeductions)}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-rose-500/10 border border-rose-500/20 px-2 py-1.5 rounded-lg">
                      <Checkbox
                        checked={deductShopFromSalary}
                        onCheckedChange={(checked) => {
                          const nextVal = Boolean(checked);
                          setDeductShopFromSalary(nextVal);
                          const st = getEmployeeSalaryStats(salEmpId, salMonth, nextVal);
                          setSalAmount(String(st.remaining));
                        }}
                      />
                      <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                        {lang === "bn"
                          ? `বেতন থেকে পোশাক কেনাকাটা (${fmtMoney(empShoppingDeductions)}) কর্তন করুন`
                          : `Deduct shopping (${fmtMoney(empShoppingDeductions)}) from salary`}
                      </span>
                    </label>
                  </div>
                ) : null}
                {selectedSalStats.totalBonus > 0 ? (
                  <div className="flex justify-between items-center text-amber-600 font-semibold">
                    <span>🎁 {lang === "bn" ? "মালিক প্রদত্ত বোনাস (কর্তনযোগ্য নয়):" : "Owner Bonus (Not deducted):"}</span>
                    <span className="font-mono font-bold">+{fmtMoney(selectedSalStats.totalBonus)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center font-bold border-t border-border/50 pt-1 text-emerald-600">
                  <span>{lang === "bn" ? "অবশিষ্ট পরিশোধযোগ্য বেতন:" : "Remaining Payable Salary:"}</span>
                  <span className="font-mono font-bold">
                    {fmtMoney(selectedSalStats.remaining)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "মাসের নাম" : "Month"}</Label>
                <Input
                  type="month"
                  value={salMonth}
                  onChange={e => setSalMonth(e.target.value)}
                  className="h-8.5 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "টাকার অঙ্ক (৳) *" : "Amount (৳) *"}</Label>
                <Input
                  type="number"
                  required
                  placeholder="0.00"
                  value={salAmount}
                  onChange={e => setSalAmount(e.target.value)}
                  className="h-8.5 text-xs font-bold font-charukola text-emerald-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "পরিশোধের মাধ্যম" : "Payment Method"}</Label>
              <Select value={salMethod} onValueChange={setSalMethod}>
                <SelectTrigger className="h-8.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{lang === "bn" ? "💵 ক্যাশ / নগদ (ক্যাশ ডেক থেকে কর্তন)" : "💵 Cash (Deducts from Cashbox)"}</SelectItem>
                  <SelectItem value="bkash">{lang === "bn" ? "📱 বিকাশ (bKash)" : "📱 bKash"}</SelectItem>
                  <SelectItem value="bank">{lang === "bn" ? "🏦 ব্যাংক ট্রান্সফার" : "🏦 Bank Transfer"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "বিবরণ / নোট" : "Note (Optional)"}</Label>
              <Input
                placeholder={lang === "bn" ? "যেমন: পুরো বেতন বা অগ্রিম..." : "e.g. Full salary..."}
                value={salNote}
                onChange={e => setSalNote(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddSalaryOpen(false)} className="rounded-xl text-xs">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} size="sm" className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                {busy ? <RefreshCw className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                <span>{lang === "bn" ? "পরিশোধ রেকর্ড করুন" : "Record Payment"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── Modal 3: Employee Expense ──────────────── */}
      <Dialog open={addExpOpen} onOpenChange={setAddExpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center gap-2">
              <Receipt className="size-4 text-orange-600" />
              {lang === "bn" ? "কর্মচারী দৈনিক খরচ ও ভাতা" : "Employee Daily Expense"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveExpense} className="space-y-3 font-balooda">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "কর্মচারী" : "Employee"}</Label>
              <Select value={expEmpId} onValueChange={setExpEmpId}>
                <SelectTrigger className="h-8.5 text-xs">
                  <SelectValue placeholder={lang === "bn" ? "কর্মচারী বাছাই করুন" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "খরচের ধরন" : "Category"}</Label>
                <Select value={expCat} onValueChange={setExpCat}>
                  <SelectTrigger className="h-8.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance">{lang === "bn" ? "💵 মালিক প্রদত্ত টাকা / অগ্রিম (বেতন থেকে কর্তন)" : "💵 Given by Owner / Advance (Deducts from Salary)"}</SelectItem>
                    <SelectItem value="food">{lang === "bn" ? "খাবার / লাঞ্চ (কর্মচারী খরচ)" : "Food / Lunch (Staff Spend)"}</SelectItem>
                    <SelectItem value="travel">{lang === "bn" ? "যাতায়াত / ভাড়া (কর্মচারী খরচ)" : "Travel (Staff Spend)"}</SelectItem>
                    <SelectItem value="tea">{lang === "bn" ? "নাস্তা / চা (কর্মচারী খরচ)" : "Tea / Snacks (Staff Spend)"}</SelectItem>
                    <SelectItem value="bonus">{lang === "bn" ? "🎁 বোনাস / টিপস (কর্তনযোগ্য নয়)" : "🎁 Bonus / Tip (Not deducted)"}</SelectItem>
                    <SelectItem value="other">{lang === "bn" ? "অন্যান্য খরচ" : "Other Spend"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "টাকার পরিমাণ (৳) *" : "Amount (৳) *"}</Label>
                <Input
                  type="number"
                  required
                  placeholder="0.00"
                  value={expAmount}
                  onChange={e => setExpAmount(e.target.value)}
                  className="h-8.5 text-xs font-bold font-charukola text-orange-600"
                />
              </div>
            </div>

            {expEmpId && (
              <div className="p-2 rounded-xl bg-muted/40 border border-border/70 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {lang === "bn" ? "বর্তমান অবশিষ্ট বেতন:" : "Current Remaining Salary:"}
                </span>
                <span className="font-mono font-bold text-emerald-600">
                  {fmtMoney(getEmployeeSalaryStats(expEmpId, (expDate || "").slice(0, 7) || currentMonthStr, true).remaining)}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "বিবরণ / নোট" : "Note"}</Label>
              <Input
                placeholder={lang === "bn" ? "খরচের বিবরণ..." : "Note..."}
                value={expNote}
                onChange={e => setExpNote(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddExpOpen(false)} className="rounded-xl text-xs">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} size="sm" className="rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white">
                {busy ? <RefreshCw className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                <span>{lang === "bn" ? "খরচ সংরক্ষণ" : "Save Expense"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── Modal 3.5: Give Bonus (Owner Bonus to Employee) ──────────────── */}
      <Dialog open={addBonusOpen} onOpenChange={setAddBonusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center gap-2 text-amber-600">
              <span>🎁</span>
              {lang === "bn" ? "কর্মচারীকে বোনাস প্রদান করুন" : "Give Bonus to Employee"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveBonus} className="space-y-3 font-balooda">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "কর্মচারী নির্বাচন *" : "Select Employee *"}</Label>
              <Select value={bonusEmpId} onValueChange={setBonusEmpId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={lang === "bn" ? "কর্মচারী বাছাই করুন" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({lang === "bn" ? "অবশিষ্ট বেতন:" : "Rem:"} {fmtMoney(getEmployeeSalaryStats(e.id, currentMonthStr, true).remaining)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {bonusEmpId && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold">
                  {lang === "bn"
                    ? "💡 বোনাস কর্মচারীর মূল বেতন বা অবশিষ্ট বেতন থেকে কাটা হবে না।"
                    : "💡 Bonus is an extra reward and will NOT reduce the employee's remaining salary."}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "তারিখ" : "Date"}</Label>
                <Input
                  type="date"
                  value={bonusDate}
                  onChange={e => setBonusDate(e.target.value)}
                  className="h-8.5 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "বোনাসের পরিমাণ (৳) *" : "Bonus Amount (৳) *"}</Label>
                <Input
                  type="number"
                  required
                  placeholder="0.00"
                  value={bonusAmount}
                  onChange={e => setBonusAmount(e.target.value)}
                  className="h-8.5 text-xs font-bold font-charukola text-amber-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "পরিশোধের মাধ্যম" : "Payment Method"}</Label>
              <Select value={bonusMethod} onValueChange={setBonusMethod}>
                <SelectTrigger className="h-8.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{lang === "bn" ? "💵 ক্যাশ / নগদ (ক্যাশবক্স থেকে)" : "💵 Cash (From Cashbox)"}</SelectItem>
                  <SelectItem value="bkash">{lang === "bn" ? "📱 বিকাশ (bKash)" : "📱 bKash"}</SelectItem>
                  <SelectItem value="bank">{lang === "bn" ? "🏦 ব্যাংক ট্রান্সফার" : "🏦 Bank Transfer"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "বোনাসের উপলক্ষ / নোট" : "Bonus Reason / Note"}</Label>
              <Input
                placeholder={lang === "bn" ? "যেমন: ঈদ বোনাস, ভালো কাজের পুরস্কার..." : "e.g. Eid Bonus, Sales Target Bonus..."}
                value={bonusNote}
                onChange={e => setBonusNote(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddBonusOpen(false)} className="rounded-xl text-xs">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} size="sm" className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer">
                {busy ? <RefreshCw className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                <span>🎁 {lang === "bn" ? "বোনাস প্রদান করুন" : "Give Bonus"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── Modal 4: Employee Shopping / Clothing Draw ──────────────── */}
      <Dialog open={addShopOpen} onOpenChange={setAddShopOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center gap-2">
              <Shirt className="size-4 text-pink-600" />
              {lang === "bn" ? "কর্মচারী পোশাক / পণ্য কেনাকাটা" : "Employee Clothing & Shopping Draw"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveShopping} className="space-y-3 font-balooda">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "কর্মচারী *" : "Employee *"}</Label>
                <Select value={shopEmpId} onValueChange={setShopEmpId}>
                  <SelectTrigger className="h-8.5 text-xs">
                    <SelectValue placeholder={lang === "bn" ? "কর্মচারী বাছাই করুন" : "Select employee"} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "হিসাবের ধরন" : "Payment Status"}</Label>
                <Select value={shopStatus} onValueChange={v => setShopStatus(v as any)}>
                  <SelectTrigger className="h-8.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deduct_from_salary">{lang === "bn" ? "বেতন থেকে কর্তন" : "Deduct from Salary"}</SelectItem>
                    <SelectItem value="paid_cash">{lang === "bn" ? "নগদ পরিশোধ" : "Paid in Cash"}</SelectItem>
                    <SelectItem value="gift">{lang === "bn" ? "উপহার / ফ্রি বোনাস" : "Gift / Free Bonus"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Product Picker */}
            <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-700 dark:text-pink-300">
                  {lang === "bn" ? "দোকান থেকে নেওয়া পণ্য বাছাই করুন" : "Select Products from Store"}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCustomItemOpen(prev => !prev)}
                    className="text-[10px] font-bold text-pink-700 dark:text-pink-300 hover:underline cursor-pointer"
                  >
                    {customItemOpen ? (lang === "bn" ? "✕ বন্ধ" : "✕ Close") : (lang === "bn" ? "+ কাস্টম আইটেম" : "+ Custom Item")}
                  </button>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({shopItems.length} {lang === "bn" ? "টি" : "items"})
                  </span>
                </div>
              </div>

              {/* Custom Item Form */}
              {customItemOpen && (
                <div className="p-2 bg-card border border-pink-500/30 rounded-lg space-y-1.5 shadow-xs">
                  <span className="text-[11px] font-bold text-foreground">
                    {lang === "bn" ? "কাস্টম পোশাক বা পণ্যের নাম ও বিক্রয় মূল্য:" : "Custom Product & Sell Price:"}
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input
                      placeholder={lang === "bn" ? "পণ্যের নাম..." : "Product name..."}
                      value={customItemName}
                      onChange={e => setCustomItemName(e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Input
                      type="number"
                      placeholder={lang === "bn" ? "বিক্রয় মূল্য (৳)..." : "Sell price (৳)..."}
                      value={customItemPrice}
                      onChange={e => setCustomItemPrice(e.target.value)}
                      className="h-7 text-xs font-mono font-bold"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddCustomShopItem}
                    className="h-6.5 text-[11px] w-full bg-pink-600 hover:bg-pink-700 text-white rounded-md font-bold"
                  >
                    {lang === "bn" ? "তালিকায় যুক্ত করুন" : "Add to List"}
                  </Button>
                </div>
              )}

              <Input
                placeholder={lang === "bn" ? "পণ্য বা কোড সার্চ করুন..." : "Search product name or code..."}
                value={shopProdSearch}
                onChange={e => setShopProdSearch(e.target.value)}
                className="h-8 text-xs bg-card"
              />

              {shopProdSearch.trim() && (
                <div className="max-h-36 overflow-y-auto divide-y divide-border bg-card border rounded-lg shadow-xs">
                  {products
                    .filter(p => {
                      const q = shopProdSearch.toLowerCase();
                      return (
                        p.name.toLowerCase().includes(q) ||
                        (p.code && p.code.toLowerCase().includes(q)) ||
                        (p.barcode && p.barcode.toLowerCase().includes(q))
                      );
                    })
                    .slice(0, 6)
                    .map(p => {
                      const realSellPrice = Number(
                        p.sell_price ??
                        (p as any).selling_price ??
                        (p as any).price ??
                        (p as any).unit_price ??
                        p.buy_price ??
                        0
                      );
                      return (
                        <div
                          key={p.id}
                          className="p-2 flex items-center justify-between hover:bg-muted/60 cursor-pointer text-xs"
                          onClick={() => handleAddProductToShop(p)}
                        >
                          <div>
                            <span className="font-semibold">{p.name}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">(স্টক: {p.stock})</span>
                          </div>
                          <span className="font-bold text-emerald-600 font-mono">
                            ৳{realSellPrice}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Chosen Items List with Editable Sell Price */}
              {shopItems.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-foreground block">
                    {lang === "bn" ? "নির্বাচিত পণ্যসমূহ ও বিক্রয় মূল্য নির্ধারণ:" : "Selected Products & Sell Prices:"}
                  </span>
                  {shopItems.map((item, idx) => (
                    <div key={idx} className="p-2 rounded-xl bg-card border border-border/80 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs truncate max-w-[200px] sm:max-w-xs">{item.product_name}</span>
                        <button
                          type="button"
                          onClick={() => setShopItems(shopItems.filter((_, i) => i !== idx))}
                          className="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
                          title="Remove"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                        {/* Sell Price Editable Input */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">
                            {lang === "bn" ? "বিক্রয় মূল্য:" : "Sell Price:"}
                          </span>
                          <div className="flex items-center border border-border rounded-lg bg-background px-1.5 h-6.5">
                            <span className="text-[10px] text-muted-foreground mr-0.5">৳</span>
                            <input
                              type="number"
                              min="0"
                              value={item.unit_price === 0 ? "" : item.unit_price}
                              placeholder="0"
                              onChange={e => handleUpdateShopItemPrice(idx, e.target.value)}
                              className="w-16 text-xs font-bold font-mono text-pink-600 bg-transparent outline-none"
                            />
                          </div>
                        </div>

                        {/* Qty Stepper */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] sm:text-[11px] text-muted-foreground">{lang === "bn" ? "পরিমাণ:" : "Qty:"}</span>
                          <div className="flex items-center border border-border rounded-lg bg-background overflow-hidden h-6">
                            <button
                              type="button"
                              onClick={() => handleUpdateShopItemQty(idx, -1)}
                              className="px-1.5 hover:bg-muted text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="px-2 text-xs font-mono font-bold">{item.qty}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateShopItemQty(idx, 1)}
                              className="px-1.5 hover:bg-muted text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Line Total */}
                        <div className="text-right">
                          <span className="text-xs font-bold font-charukola text-foreground">
                            {fmtMoney(item.total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-between items-center pt-1 font-bold text-xs border-t border-border/60">
                    <span>{lang === "bn" ? "সর্বমোট বিক্রয় মূল্য:" : "Grand Total Price:"}</span>
                    <span className="text-pink-600 font-charukola text-sm font-bold">
                      {fmtMoney(shopItems.reduce((a, b) => a + b.total, 0))}
                    </span>
                  </div>

                  {/* Payment Status Context Info */}
                  {shopStatus === "deduct_from_salary" ? (
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                      {lang === "bn"
                        ? `💡 এই সর্বমোট ${fmtMoney(shopItems.reduce((a, b) => a + b.total, 0))} কর্মচারীর পরবর্তী বেতন থেকে স্বয়ংক্রিয়ভাবে কাটা হবে।`
                        : `💡 Total ${fmtMoney(shopItems.reduce((a, b) => a + b.total, 0))} will be deducted from staff salary.`}
                    </p>
                  ) : shopStatus === "paid_cash" ? (
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                      {lang === "bn"
                        ? `💡 নগদ প্রাপ্ত ${fmtMoney(shopItems.reduce((a, b) => a + b.total, 0))} ক্যাশবক্সে জমা হিসেবে যুক্ত হবে।`
                        : `💡 Cash of ${fmtMoney(shopItems.reduce((a, b) => a + b.total, 0))} will be recorded into cashbox.`}
                    </p>
                  ) : (
                    <p className="text-[10px] text-purple-700 dark:text-purple-300 bg-purple-500/10 p-1.5 rounded-lg border border-purple-500/20">
                      {lang === "bn"
                        ? "💡 এটি উপহার/বোনাস হিসেবে রেকর্ড হবে (বেতন বা ক্যাশ থেকে কাটা হবে না)।"
                        : "💡 Recorded as gift (no deduction from salary or cash)."}
                    </p>
                  )}
                </div>
              )}

              <p className="text-[10px] text-pink-600 dark:text-pink-400">
                {lang === "bn"
                  ? "✓ এই পোশাকের স্টক স্বয়ংক্রিয়ভাবে ইনভেন্টরি থেকে কেটে নেওয়া হবে।"
                  : "✓ Product stock will automatically be deducted from inventory."}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "নোট (ঐচ্ছিক)" : "Note"}</Label>
              <Input
                placeholder={lang === "bn" ? "যেমন: ঈদের কেনাকাটা..." : "e.g. Eid shopping..."}
                value={shopNote}
                onChange={e => setShopNote(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddShopOpen(false)} className="rounded-xl text-xs">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} size="sm" className="rounded-xl text-xs font-bold bg-pink-600 hover:bg-pink-700 text-white">
                {busy ? <RefreshCw className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                <span>{lang === "bn" ? "রেকর্ড সম্পন্ন করুন" : "Save Draw"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── Modal 5: Thermal Print Voucher Slip ──────────────── */}
      <Dialog open={!!printSlipItem} onOpenChange={open => !open && setPrintSlipItem(null)}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm">
                <Printer className="size-4 text-pink-600" />
                {lang === "bn" ? "কর্মচারী কেনাকাটা রসিদ" : "Employee Shopping Slip"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {printSlipItem && (
            <div className="space-y-3 font-balooda">
              <div id="thermal-employee-receipt" className="p-4 bg-background rounded-xl border border-dashed text-xs space-y-2.5 font-mono shadow-inner">
                <div className="text-center border-b pb-2 space-y-0.5">
                  <h3 className="font-bold text-sm uppercase tracking-wide">{user?.business_name || "Classic World"}</h3>
                  <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "পোশাক ও পণ্য ড্র ভাউচার" : "Staff Clothing Voucher"}</p>
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === "bn" ? "কর্মচারী:" : "Employee:"}</span>
                    <span className="font-bold">{printSlipItem.employee_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === "bn" ? "তারিখ:" : "Date:"}</span>
                    <span>{printSlipItem.date || printSlipItem.created_at?.slice(0, 10)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === "bn" ? "পরিশোধ পদ্ধতি:" : "Payment:"}</span>
                    <span className="font-bold text-pink-600">
                      {printSlipItem.payment_status === "paid_cash"
                        ? (lang === "bn" ? "নগদ পরিশোধ" : "Paid Cash")
                        : printSlipItem.payment_status === "gift"
                        ? (lang === "bn" ? "উপহার / ফ্রি" : "Gift")
                        : (lang === "bn" ? "বেতন থেকে কর্তন" : "Salary Deduction")}
                    </span>
                  </div>
                </div>

                <div className="border-t border-b py-2 space-y-1.5">
                  <div className="flex justify-between font-bold text-[10px] text-muted-foreground uppercase">
                    <span>{lang === "bn" ? "আইটেম" : "Item"}</span>
                    <span>{lang === "bn" ? "মূল্য" : "Total"}</span>
                  </div>
                  {printSlipItem.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[170px]">{it.product_name} x{it.qty} {it.unit_price ? `(@৳${it.unit_price})` : ""}</span>
                      <span className="font-bold">৳{it.total}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between font-bold text-sm pt-1">
                  <span>{lang === "bn" ? "সর্বমোট:" : "Grand Total:"}</span>
                  <span className="text-pink-600 font-charukola">{fmtMoney(printSlipItem.total_amount)}</span>
                </div>

                {printSlipItem.note && (
                  <p className="text-[10px] text-muted-foreground pt-1 border-t italic">
                    {lang === "bn" ? "নোট:" : "Note:"} {printSlipItem.note}
                  </p>
                )}

                <div className="text-center pt-3 text-[9px] text-muted-foreground">
                  {lang === "bn" ? "*** ধন্যবাদ ***" : "*** Thank You ***"}
                </div>
              </div>

              <DialogFooter className="gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintSlipItem(null)}
                  className="rounded-xl text-xs flex-1"
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const printContent = document.getElementById("thermal-employee-receipt");
                    if (!printContent) return;
                    const win = window.open("", "", "width=400,height=600");
                    if (win) {
                      win.document.write(`
                        <html>
                          <head>
                            <title>Employee Voucher - ${printSlipItem.employee_name}</title>
                            <style>
                              body { font-family: monospace; padding: 20px; font-size: 12px; }
                              .text-center { text-align: center; }
                              .flex { display: flex; justify-content: space-between; }
                              .border-b { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
                              .border-t { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; }
                              .bold { font-weight: bold; }
                            </style>
                          </head>
                          <body>
                            ${printContent.innerHTML}
                          </body>
                        </html>
                      `);
                      win.document.close();
                      win.focus();
                      win.print();
                      win.close();
                    }
                  }}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground flex-1 cursor-pointer"
                >
                  <Printer className="size-3.5 mr-1" />
                  <span>{lang === "bn" ? "প্রিন্ট করুন" : "Print Voucher"}</span>
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Collect Store Debt (কর্মচারীর দোকান পাওনা আদায়) ── */}
      <Dialog open={collectDebtOpen} onOpenChange={setCollectDebtOpen}>
        <DialogContent className="max-w-md font-balooda">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-600">
              <ArrowDownLeft className="size-4" />
              {lang === "bn" ? "কর্মচারীর দোকান পাওনা আদায়" : "Collect Employee Store Debt"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCollectDebt} className="space-y-3 pt-2">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300">
              {lang === "bn"
                ? "কর্মচারী দোকান থেকে অতিরিক্ত অগ্রিম বা কাপড় কেনাকাটার কারণে যে পাওনা তৈরি হয়েছিল, তা নগদ জমা নিয়ে ক্যাশইন করুন।"
                : "Record repayment from employee for excess advances or staff shopping into shop cashbox."}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারী নির্বাচন *" : "Employee *"}</Label>
              <Select value={debtEmpId} onValueChange={(id) => {
                setDebtEmpId(id);
                const st = getEmployeeSalaryStats(id, salMonth, true);
                if (st.owesStore > 0) setDebtAmount(String(st.owesStore));
              }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={lang === "bn" ? "কর্মচারী নির্বাচন করুন" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => {
                    const st = getEmployeeSalaryStats(e.id, salMonth, true);
                    return (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {st.owesStore > 0 ? `(পাওনা: ৳${fmtMoney(st.owesStore)})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "আদায়কৃত টাকার পরিমাণ (৳) *" : "Repaid Amount (৳) *"}</Label>
                <Input
                  type="number"
                  required
                  placeholder="0.00"
                  value={debtAmount}
                  onChange={e => setDebtAmount(e.target.value)}
                  className="h-9 text-xs font-bold text-rose-600 font-charukola"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "পরিশোধ পদ্ধতি" : "Payment Method"}</Label>
                <Select value={debtMethod} onValueChange={setDebtMethod}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{lang === "bn" ? "নগদ (Cash In)" : "Cash"}</SelectItem>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "তারিখ" : "Date"}</Label>
              <Input
                type="date"
                value={debtDate}
                onChange={e => setDebtDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "বিবরণ / নোট" : "Note / Remarks"}</Label>
              <Input
                placeholder={lang === "bn" ? "উদা: দোকান পাওনা নগদ পরিশোধ" : "e.g. Paid debt in cash"}
                value={debtNote}
                onChange={e => setDebtNote(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCollectDebtOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer">
                {busy ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "পাওনা জমা করুন" : "Collect Debt")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Manual Adjustment (হাতে সমন্বয়: ওভারটাইম / ইনসেন্টিভ / জরিমানা) ── */}
      <Dialog open={addAdjustmentOpen} onOpenChange={setAddAdjustmentOpen}>
        <DialogContent className="max-w-md font-balooda">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-purple-600">
              <Scale className="size-4" />
              {lang === "bn" ? "বেতন সমন্বয় (ওভারটাইম / ইনসেন্টিভ / জরিমানা)" : "Salary Adjustment (Overtime / Penalty)"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveAdjustment} className="space-y-3 pt-2">
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-700 dark:text-purple-300">
              {lang === "bn"
                ? "চলতি সাইকেলে কর্মচারীর বেতনের সাথে অতিরিক্ত টাকা যোগ করতে (ওভারটাইম/ইনসেন্টিভ) অথবা কর্তন করতে (বিলম্বে উপস্থিতি/জরিমানা) এই সমন্বয় ব্যবহার করুন।"
                : "Add additions (overtime/incentive) or deductions (late fine/penalties) for this cycle."}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারী নির্বাচন *" : "Employee *"}</Label>
              <Select value={adjEmpId} onValueChange={setAdjEmpId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={lang === "bn" ? "কর্মচারী নির্বাচন করুন" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "সমন্বয়ের ধরন *" : "Adjustment Type *"}</Label>
              <Select value={adjType} onValueChange={(val: any) => setAdjType(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment_add">{lang === "bn" ? "➕ বেতন বৃদ্ধি / ওভারটাইম / ইনসেন্টিভ (+)" : "➕ Addition (Overtime / Incentive)"}</SelectItem>
                  <SelectItem value="adjustment_deduct">{lang === "bn" ? "➖ বেতন কর্তন / জরিমানা / ক্ষতিপূরণ (-)" : "➖ Deduction (Fine / Penalty)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "টাকার পরিমাণ (৳) *" : "Amount (৳) *"}</Label>
                <Input
                  type="number"
                  required
                  placeholder="0.00"
                  value={adjAmount}
                  onChange={e => setAdjAmount(e.target.value)}
                  className="h-9 text-xs font-bold font-charukola text-purple-600"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "তারিখ" : "Date"}</Label>
                <Input
                  type="date"
                  value={adjDate}
                  onChange={e => setAdjDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "কারণ / বিবরণ *" : "Reason / Remarks *"}</Label>
              <Input
                required
                placeholder={adjType === "adjustment_add" ? (lang === "bn" ? "উদা: ঈদের অতিরিক্ত কাজের ওভারটাইম" : "e.g. Overtime for festival") : (lang === "bn" ? "উদা: বিলম্বে উপস্থিতির জরিমানা" : "e.g. Late fine")}
                value={adjNote}
                onChange={e => setAdjNote(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddAdjustmentOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="bg-purple-600 hover:bg-purple-700 text-white font-bold cursor-pointer">
                {busy ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "সমন্বয় সংরক্ষণ করুন" : "Save Adjustment")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
