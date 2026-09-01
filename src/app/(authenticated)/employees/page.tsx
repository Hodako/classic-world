"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
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
} from "lucide-react";
import Link from "next/link";
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

  const [activeTab, setActiveTab] = useState<"accounts" | "salaries" | "expenses" | "shoppings">("accounts");
  const [search, setSearch] = useState("");

  // Queries
  const { data: employees = [], isLoading: empLoading } = useCachedQuery(["employees"], getEmployees);
  const { data: salaries = [], isLoading: salLoading } = useCachedQuery(["employee_salaries"], getEmployeeSalaries);
  const { data: expenses = [], isLoading: expLoading } = useCachedQuery(["employee_expenses"], getEmployeeExpenses);
  const { data: shoppings = [], isLoading: shopLoading } = useCachedQuery(["employee_shoppings"], getEmployeeShoppings);
  const { data: products = [] } = useCachedQuery(["products"], getProducts);

  // Dialog States: Employee Account
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empDesignation, setEmpDesignation] = useState("Sales Staff");
  const [empSalary, setEmpSalary] = useState("");
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

  const [busy, setBusy] = useState(false);

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
      return s.employee_name.toLowerCase().includes(q) || (s.note || "").toLowerCase().includes(q);
    });
  }, [shoppings, search]);

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
    setBusy(true);
    try {
      await createEmployeeSalaryFn({
        data: {
          employee_id: salEmpId,
          employee_name: emp?.name || "Employee",
          base_salary: emp?.base_salary || 0,
          month: salMonth,
          amount: val,
          payment_method: salMethod,
          note: salNote.trim() || null,
        },
      });
      toast.success(lang === "bn" ? "বেতন পরিশোধ রেকর্ড সংরক্ষিত হয়েছে" : "Salary payment recorded successfully");
      qc.invalidateQueries({ queryKey: ["employee_salaries"] });
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

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/80 p-3 sm:p-4 rounded-2xl shadow-xs">
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

        {/* Tab-Specific Action Button */}
        <div className="flex items-center gap-2">
          {activeTab === "accounts" && (
            <Button
              onClick={() => {
                setEditingEmp(null);
                setEmpName("");
                setEmpPhone("");
                setEmpEmail("");
                setEmpSalary("");
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
              <span>{lang === "bn" ? "কর্মচারী খরচ যোগ" : "Add Expense"}</span>
            </Button>
          )}

          {activeTab === "shoppings" && (
            <Button
              onClick={() => setAddShopOpen(true)}
              size="sm"
              className="h-8.5 rounded-xl text-xs font-bold gap-1.5 bg-pink-600 hover:bg-pink-700 text-white shadow-sm cursor-pointer"
            >
              <Shirt className="size-3.5" />
              <span>{lang === "bn" ? "পোশাক/পণ্য প্রদান" : "Record Shopping"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Auto-Link Informational Notice */}
      <div className="p-3 bg-gradient-to-r from-primary/10 via-indigo-500/5 to-transparent border border-primary/20 rounded-2xl flex items-start gap-2.5">
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 rounded-2xl bg-card border-border/80 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold">{lang === "bn" ? "মোট কর্মচারী" : "Total Staff"}</span>
            <Users className="size-3.5 text-primary" />
          </div>
          <p className="text-lg sm:text-xl font-bold font-charukola text-foreground">{employees.length} {lang === "bn" ? "জন" : ""}</p>
          <span className="text-[10px] text-emerald-600">{employees.filter(e => e.status === "active").length} {lang === "bn" ? "সক্রিয়" : "Active"}</span>
        </Card>

        <Card className="p-3 rounded-2xl bg-card border-border/80 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold">{lang === "bn" ? "মোট পরিশোধিত বেতন" : "Salaries Paid"}</span>
            <DollarSign className="size-3.5 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-bold font-charukola text-emerald-600">{fmtMoney(totalSalariesPaid)}</p>
          <span className="text-[10px] text-muted-foreground">{salaries.length} {lang === "bn" ? "টি ট্রানজেকশন" : "Records"}</span>
        </Card>

        <Card className="p-3 rounded-2xl bg-card border-border/80 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold">{lang === "bn" ? "কর্মচারী খরচ ও ভাতা" : "Staff Expenses"}</span>
            <Receipt className="size-3.5 text-orange-600" />
          </div>
          <p className="text-lg sm:text-xl font-bold font-charukola text-orange-600">{fmtMoney(totalEmployeeExpenses)}</p>
          <span className="text-[10px] text-muted-foreground">{expenses.length} {lang === "bn" ? "টি ভাউচার" : "Vouchers"}</span>
        </Card>

        <Card className="p-3 rounded-2xl bg-card border-border/80 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold">{lang === "bn" ? "কর্মচারী কেনাকাটা" : "Staff Shopping"}</span>
            <Shirt className="size-3.5 text-pink-600" />
          </div>
          <p className="text-lg sm:text-xl font-bold font-charukola text-pink-600">{fmtMoney(totalEmployeeShoppings)}</p>
          <span className="text-[10px] text-muted-foreground">{shoppings.length} {lang === "bn" ? "বার কেনাকাটা" : "Draws"}</span>
        </Card>
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
                {filteredEmployees.map(e => (
                  <div key={e.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold font-charukola text-sm shrink-0">
                        {e.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{e.name}</span>
                          <Badge variant="outline" className={`text-[10px] ${e.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                            {e.status === "active" ? (lang === "bn" ? "সক্রিয়" : "Active") : (lang === "bn" ? "নিষ্ক্রিয়" : "Inactive")}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {e.designation || "Staff"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
                          {e.base_salary ? (
                            <span className="font-semibold text-foreground font-charukola">
                              {lang === "bn" ? "মাসিক বেতন:" : "Salary:"} {fmtMoney(e.base_salary)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
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
                        <span>{lang === "bn" ? "সম্পাদনা ও পারমিশন" : "Edit & Permissions"}</span>
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
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── TAB 2: SALARIES ── */}
        <TabsContent value="salaries" className="space-y-3">
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
                          <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
                            {e.category === "food" ? (lang === "bn" ? "খাবার ভাতা" : "Food") : e.category === "travel" ? (lang === "bn" ? "যাতায়াত" : "Travel") : (lang === "bn" ? "অন্যান্য" : "Other")}
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
          <Card className="rounded-2xl border border-border/80 overflow-hidden bg-card shadow-xs">
            {filteredShoppings.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Shirt className="size-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground font-balooda">
                  {lang === "bn" ? "কোনো কেনাকাটা রেকর্ড পাওয়া যায়নি" : "No employee shopping records"}
                </p>
                <Button size="sm" variant="outline" onClick={() => setAddShopOpen(true)} className="text-xs rounded-xl">
                  {lang === "bn" ? "প্রথম কেনাকাটা রেকর্ড করুন" : "Record first shopping"}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredShoppings.map(s => (
                  <div key={s.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-600 border border-pink-500/20 shrink-0">
                        <Shirt className="size-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{s.employee_name}</span>
                          <Badge variant="outline" className={`text-[10px] ${s.payment_status === "paid_cash" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : s.payment_status === "gift" ? "bg-purple-500/10 text-purple-600 border-purple-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>
                            {s.payment_status === "paid_cash" ? (lang === "bn" ? "নগদ পরিশোধিত" : "Paid in Cash") : s.payment_status === "gift" ? (lang === "bn" ? "উপহার/বোনাস" : "Gift") : (lang === "bn" ? "বেতন থেকে কর্তন" : "Deduct from Salary")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{s.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          {s.items?.map((item, idx) => (
                            <span key={idx} className="bg-muted px-2 py-0.5 rounded-md font-medium text-foreground">
                              {item.product_name} x{item.qty} (৳{item.unit_price})
                            </span>
                          ))}
                        </div>
                        {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-sm sm:text-base font-charukola text-pink-600">
                          {fmtMoney(s.total_amount)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-rose-600"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                const emp = employees.find(x => x.id === v);
                if (emp?.base_salary) setSalAmount(String(emp.base_salary));
              }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={lang === "bn" ? "কর্মচারী বাছাই করুন" : "Select employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.base_salary ? `(৳${fmtMoney(e.base_salary)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                    <SelectItem value="food">{lang === "bn" ? "খাবার / লাঞ্চ" : "Food / Lunch"}</SelectItem>
                    <SelectItem value="travel">{lang === "bn" ? "যাতায়াত / ভাড়া" : "Travel"}</SelectItem>
                    <SelectItem value="tea">{lang === "bn" ? "নাস্তা / চা" : "Tea / Snacks"}</SelectItem>
                    <SelectItem value="bonus">{lang === "bn" ? "টিপস / বোনাস" : "Bonus / Tip"}</SelectItem>
                    <SelectItem value="other">{lang === "bn" ? "অন্যান্য" : "Other"}</SelectItem>
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
            <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-700 dark:text-pink-300">
                  {lang === "bn" ? "দোকান থেকে নেওয়া পণ্য বাছাই করুন" : "Select Products from Store"}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {shopItems.length} {lang === "bn" ? "টি পণ্য" : "items"}
                </span>
              </div>

              <Input
                placeholder={lang === "bn" ? "পণ্য সার্চ করুন..." : "Search products..."}
                value={shopProdSearch}
                onChange={e => setShopProdSearch(e.target.value)}
                className="h-8 text-xs bg-card"
              />

              {shopProdSearch.trim() && (
                <div className="max-h-32 overflow-y-auto divide-y divide-border bg-card border rounded-lg shadow-xs">
                  {products
                    .filter(p => p.name.toLowerCase().includes(shopProdSearch.toLowerCase()) || (p.code && p.code.toLowerCase().includes(shopProdSearch.toLowerCase())))
                    .slice(0, 5)
                    .map(p => (
                      <div
                        key={p.id}
                        className="p-2 flex items-center justify-between hover:bg-muted/60 cursor-pointer text-xs"
                        onClick={() => {
                          const existingIdx = shopItems.findIndex(i => i.product_id === p.id);
                          let newItems = [...shopItems];
                          if (existingIdx >= 0) {
                            newItems[existingIdx].qty += 1;
                            newItems[existingIdx].total = newItems[existingIdx].qty * newItems[existingIdx].unit_price;
                          } else {
                            const price = Number(p.sell_price) || 0;
                            newItems.push({
                              product_id: p.id,
                              product_name: p.name,
                              qty: 1,
                              unit_price: price,
                              total: price,
                            });
                          }
                          setShopItems(newItems);
                          setShopProdSearch("");
                        }}
                      >
                        <div>
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">(স্টক: {p.stock})</span>
                        </div>
                        <span className="font-bold text-emerald-600">৳{p.sell_price}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Chosen Items */}
              {shopItems.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {shopItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-card border text-xs">
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="font-bold truncate">{item.product_name}</p>
                        <p className="text-[10px] text-muted-foreground">৳{item.unit_price} x {item.qty} = ৳{item.total}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShopItems(shopItems.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-1 font-bold text-xs">
                    <span>{lang === "bn" ? "মোট মূল্য:" : "Total Price:"}</span>
                    <span className="text-pink-600 font-charukola">
                      {fmtMoney(shopItems.reduce((a, b) => a + b.total, 0))}
                    </span>
                  </div>
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
    </div>
  );
}
