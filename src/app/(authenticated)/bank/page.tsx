"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Landmark,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  CreditCard,
  History,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Pencil,
  RefreshCw,
  Wallet,
  Sparkles,
  Calendar,
  Banknote,
  Search,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getBankAccountsFn,
  createBankAccountFn,
  updateBankAccountFn,
  deleteBankAccountFn,
  createBankTransactionFn,
  getBankLoansFn,
  createBankLoanFn,
  payBankLoanInstallmentFn,
  deleteBankLoanFn,
} from "@/lib/rpc";
import { playTapSound } from "@/lib/audio";

export default function BankPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { user } = useAuth();

  const accountsQuery = useQuery({ queryKey: ["bank-accounts"], queryFn: getBankAccountsFn });
  const loansQuery = useQuery({ queryKey: ["bank-loans"], queryFn: getBankLoansFn });

  const accounts = accountsQuery.data ?? [];
  const loans = loansQuery.data ?? [];

  // Dialog States
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [accountForm, setAccountForm] = useState({
    bank_name: "",
    account_name: "",
    account_number: "",
    branch: "",
    balance: "",
    note: "",
  });

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txForm, setTxForm] = useState<{
    account_id: string;
    type: "deposit" | "withdraw";
    amount: string;
    note: string;
    sync_cashbox: boolean;
  }>({
    account_id: "",
    type: "deposit",
    amount: "",
    note: "",
    sync_cashbox: true,
  });

  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    bank_name: "",
    loan_title: "",
    principal_amount: "",
    total_repayable: "",
    has_installments: true,
    total_installments: "12",
    installment_amount: "",
    receive_to_cashbox: true,
    note: "",
  });

  const [installmentDialogOpen, setInstallmentDialogOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [installmentForm, setInstallmentForm] = useState({
    amount: "",
    payment_method: "cashbox",
    note: "",
  });

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Financial Summaries
  const totalBankBalance = useMemo(() => {
    return accounts.reduce((acc, a) => acc + (Number(a.balance) || 0), 0);
  }, [accounts]);

  const totalActiveLoans = useMemo(() => {
    return loans.filter(l => l.status !== "completed").reduce((acc, l) => acc + (Number(l.total_repayable) || 0), 0);
  }, [loans]);

  const totalPaidLoanAmount = useMemo(() => {
    return loans.reduce((acc, l) => acc + (Number(l.paid_amount) || 0), 0);
  }, [loans]);

  const totalRemainingLoanDebt = useMemo(() => {
    return Math.max(totalActiveLoans - totalPaidLoanAmount, 0);
  }, [totalActiveLoans, totalPaidLoanAmount]);

  // Account Handlers
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.bank_name.trim() || !accountForm.account_number.trim()) {
      return toast.error(lang === "bn" ? "ব্যাংকের নাম এবং একাউন্ট নম্বর লিখুন" : "Please enter bank name and account number");
    }
    setBusy(true);
    try {
      if (editingAccount) {
        await updateBankAccountFn({
          data: {
            id: editingAccount.id,
            bank_name: accountForm.bank_name.trim(),
            account_name: accountForm.account_name.trim(),
            account_number: accountForm.account_number.trim(),
            branch: accountForm.branch.trim() || null,
            note: accountForm.note.trim() || null,
          },
        });
        toast.success(lang === "bn" ? "ব্যাংক একাউন্ট আপডেট হয়েছে" : "Bank account updated");
      } else {
        await createBankAccountFn({
          data: {
            bank_name: accountForm.bank_name.trim(),
            account_name: accountForm.account_name.trim(),
            account_number: accountForm.account_number.trim(),
            branch: accountForm.branch.trim() || null,
            balance: Number(accountForm.balance) || 0,
            note: accountForm.note.trim() || null,
          },
        });
        toast.success(lang === "bn" ? "নতুন ব্যাংক একাউন্ট যোগ হয়েছে" : "Bank account added");
      }
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setAccountDialogOpen(false);
      setEditingAccount(null);
      setAccountForm({ bank_name: "", account_name: "", account_number: "", branch: "", balance: "", note: "" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to save bank account");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm(lang === "bn" ? "আপনি কি এই ব্যাংক একাউন্টটি মুছে ফেলতে চান?" : "Are you sure you want to delete this bank account?")) return;
    try {
      await deleteBankAccountFn({ data: { id } });
      toast.success(lang === "bn" ? "ব্যাংক একাউন্ট মুছে ফেলা হয়েছে" : "Bank account deleted");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete bank account");
    }
  };

  // Transaction Handler
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txForm.account_id || !Number(txForm.amount)) {
      return toast.error(lang === "bn" ? "একাউন্ট ও সঠিক টাকার পরিমাণ লিখুন" : "Select account and enter valid amount");
    }
    setBusy(true);
    try {
      await createBankTransactionFn({
        data: {
          account_id: txForm.account_id,
          type: txForm.type,
          amount: Number(txForm.amount),
          note: txForm.note.trim() || null,
          sync_cashbox: txForm.sync_cashbox,
        },
      });
      toast.success(
        txForm.type === "deposit"
          ? (lang === "bn" ? "ব্যাংকে টাকা জমা সফল হয়েছে" : "Bank deposit successful")
          : (lang === "bn" ? "ব্যাংক থেকে টাকা তোলা সফল হয়েছে" : "Bank withdrawal successful")
      );
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setTxDialogOpen(false);
      setTxForm({ account_id: "", type: "deposit", amount: "", note: "", sync_cashbox: true });
    } catch (err: any) {
      toast.error(err?.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  };

  // Loan Handlers
  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanForm.bank_name.trim() || !Number(loanForm.principal_amount)) {
      return toast.error(lang === "bn" ? "ব্যাংকের নাম এবং ঋণের পরিমাণ লিখুন" : "Enter bank name and principal loan amount");
    }
    setBusy(true);
    try {
      const principal = Number(loanForm.principal_amount) || 0;
      const repayable = Number(loanForm.total_repayable) || principal;
      const hasInst = loanForm.has_installments;
      const installments = hasInst ? (Number(loanForm.total_installments) || 1) : 0;
      const perInstallment = hasInst ? (Number(loanForm.installment_amount) || Math.round(repayable / (installments || 1))) : 0;

      await createBankLoanFn({
        data: {
          bank_name: loanForm.bank_name.trim(),
          loan_title: loanForm.loan_title.trim() || (hasInst ? "Business Loan" : "Flexible Loan"),
          principal_amount: principal,
          total_repayable: repayable,
          total_installments: installments,
          installment_amount: perInstallment,
          has_installments: hasInst,
          receive_to_cashbox: loanForm.receive_to_cashbox,
          note: loanForm.note.trim() || null,
        },
      });

      toast.success(lang === "bn" ? "নতুন ব্যাংক ঋণ অন্তর্ভুক্ত হয়েছে" : "Bank loan added successfully");
      qc.invalidateQueries({ queryKey: ["bank-loans"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setLoanDialogOpen(false);
      setLoanForm({
        bank_name: "",
        loan_title: "",
        principal_amount: "",
        total_repayable: "",
        has_installments: true,
        total_installments: "12",
        installment_amount: "",
        receive_to_cashbox: true,
        note: "",
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to create loan");
    } finally {
      setBusy(false);
    }
  };

  const handlePayInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || !Number(installmentForm.amount)) {
      return toast.error(lang === "bn" ? "সঠিক কিস্তির পরিমাণ লিখুন" : "Enter valid installment amount");
    }
    setBusy(true);
    try {
      const res = await payBankLoanInstallmentFn({
        data: {
          loan_id: selectedLoan.id,
          amount: Number(installmentForm.amount),
          payment_method: installmentForm.payment_method,
          note: installmentForm.note.trim() || null,
        },
      });

      toast.success(
        res.isFullyPaid
          ? (lang === "bn" ? "অভিনন্দন! ঋণ সম্পূর্ণ পরিশোধ হয়েছে" : "Loan fully paid off!")
          : (lang === "bn" ? "কিস্তি পরিশোধ সফল হয়েছে (ক্যাশ থেকে কর্তিত)" : "Installment paid (deducted from Cashbox)")
      );

      qc.invalidateQueries({ queryKey: ["bank-loans"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setInstallmentDialogOpen(false);
      setSelectedLoan(null);
      setInstallmentForm({ amount: "", payment_method: "cashbox", note: "" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to pay installment");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLoan = async (id: string) => {
    if (!confirm(lang === "bn" ? "আপনি কি এই ঋণ রেকর্ডটি মুছে ফেলতে চান?" : "Are you sure you want to delete this loan record?")) return;
    try {
      await deleteBankLoanFn({ data: { id } });
      toast.success(lang === "bn" ? "ঋণ রেকর্ড মুছে ফেলা হয়েছে" : "Loan record deleted");
      qc.invalidateQueries({ queryKey: ["bank-loans"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete loan");
    }
  };

  return (
    <div className="space-y-4 pb-12 max-w-7xl mx-auto font-hind">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3.5 sm:p-4 rounded-2xl border-[0.5px] border-black/75 dark:border-white/30 shadow-xs">
        <div className="flex items-center gap-2">
          <Link href="/more">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground font-balooda font-bold">
              <ArrowLeft className="size-4 mr-1" />
              {t("more")}
            </Button>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div>
            <h1 className="font-bold font-charukola text-base sm:text-lg flex items-center gap-2 text-foreground">
              <Landmark className="size-5 text-primary" />
              {lang === "bn" ? "ব্যাংক ও ঋণ ব্যবস্থাপনা" : "Bank Accounts & Loans"}
            </h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block font-balooda">
              {lang === "bn"
                ? "ব্যাংক হিসাব, ঋণ গ্রহণ এবং ক্যাশবক্স থেকে কিস্তি পরিশোধের হিসাব"
                : "Manage bank accounts, loan borrowing, and cashbox installment repayments"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap font-balooda">
          <Button
            onClick={() => {
              setEditingAccount(null);
              setAccountForm({ bank_name: "", account_name: "", account_number: "", branch: "", balance: "", note: "" });
              setAccountDialogOpen(true);
            }}
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold rounded-lg beveled-button gap-1 border-[0.5px] border-black/50 dark:border-white/30"
          >
            <Plus className="size-3.5" />
            <span>{lang === "bn" ? "নতুন একাউন্ট" : "New Account"}</span>
          </Button>

          <Button
            onClick={() => {
              setLoanForm({
                bank_name: "",
                loan_title: "",
                principal_amount: "",
                total_repayable: "",
                total_installments: "12",
                installment_amount: "",
                receive_to_cashbox: true,
                note: "",
              });
              setLoanDialogOpen(true);
            }}
            size="sm"
            className="h-8 text-xs font-bold rounded-lg beveled-button bg-primary text-primary-foreground shadow-xs gap-1"
          >
            <CreditCard className="size-3.5" />
            <span>{lang === "bn" ? "ঋণ গ্রহণ" : "Take Loan"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4 beveled-kpi border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-card rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{lang === "bn" ? "মোট ব্যাংক জমা" : "Total Bank Balance"}</span>
            <Building2 className="size-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-2xl font-bold mt-1.5 text-sky-600 dark:text-sky-400 font-serif">
            {fmtMoney(totalBankBalance)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {accounts.length} {lang === "bn" ? "টি সক্রিয় ব্যাংক একাউন্ট" : "active bank accounts"}
          </div>
        </Card>

        <Card className="p-4 beveled-kpi border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-card rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{lang === "bn" ? "মোট গৃহীত ঋণ" : "Total Borrowed Loan"}</span>
            <CreditCard className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-1.5 text-amber-600 dark:text-amber-400 font-serif">
            {fmtMoney(totalActiveLoans)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {loans.filter(l => l.status !== "completed").length} {lang === "bn" ? "টি চলমান ঋণ" : "active loan contracts"}
          </div>
        </Card>

        <Card className="p-4 beveled-kpi border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-card rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{lang === "bn" ? "অবশিষ্ট বকেয়া ঋণ" : "Remaining Loan Debt"}</span>
            <AlertCircle className="size-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold mt-1.5 text-rose-600 dark:text-rose-400 font-serif">
            {fmtMoney(totalRemainingLoanDebt)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {lang === "bn" ? "ক্যাশ থেকে পরিশোধযোগ্য" : "Payable from cashbox"}
          </div>
        </Card>

        <Card className="p-4 beveled-kpi border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-card rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{lang === "bn" ? "পরিশোধিত কিস্তির পরিমাণ" : "Total Repaid Amount"}</span>
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-1.5 text-emerald-600 dark:text-emerald-400 font-serif">
            {fmtMoney(totalPaidLoanAmount)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {lang === "bn" ? "সফলভাবে পরিশোধিত" : "Successfully repaid"}
          </div>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs defaultValue="loans" className="space-y-4">
        <TabsList className="bg-muted/80 p-1 rounded-xl">
          <TabsTrigger value="loans" className="rounded-lg text-xs font-bold gap-1.5">
            <CreditCard className="size-3.5" />
            <span>{lang === "bn" ? "ব্যাংক ঋণ ও কিস্তি" : "Bank Loans & Installments"}</span>
          </TabsTrigger>
          <TabsTrigger value="accounts" className="rounded-lg text-xs font-bold gap-1.5">
            <Landmark className="size-3.5" />
            <span>{lang === "bn" ? "ব্যাংক একাউন্টসমূহ" : "Bank Accounts"}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Bank Loans & Installments */}
        <TabsContent value="loans" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <CreditCard className="size-4 text-primary" />
              <span>{lang === "bn" ? "চলমান ঋণ ও কিস্তি পরিশোধ তালিকা" : "Active Loans & Installment Schedules"}</span>
            </h2>
            <Button
              onClick={() => {
                setLoanForm({
                  bank_name: "",
                  loan_title: "",
                  principal_amount: "",
                  total_repayable: "",
                  total_installments: "12",
                  installment_amount: "",
                  receive_to_cashbox: true,
                  note: "",
                });
                setLoanDialogOpen(true);
              }}
              size="sm"
              className="h-8 text-xs font-bold rounded-lg bg-primary text-primary-foreground gap-1"
            >
              <Plus className="size-3.5" />
              <span>{lang === "bn" ? "নতুন ঋণ গ্রহণ" : "Add Loan"}</span>
            </Button>
          </div>

          {loans.length === 0 ? (
            <Card className="p-8 text-center rounded-2xl border-dashed border-border text-muted-foreground space-y-2">
              <Landmark className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-xs font-medium">
                {lang === "bn" ? "কোন ব্যাংক ঋণ বা ধারের রেকর্ড নেই।" : "No bank loan records found."}
              </p>
              <Button
                onClick={() => setLoanDialogOpen(true)}
                variant="outline"
                size="sm"
                className="text-xs font-bold"
              >
                {lang === "bn" ? "প্রথম ঋণ যোগ করুন" : "Add First Loan"}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {loans.map((loan) => {
                const isComplete = loan.status === "completed" || loan.paid_amount >= loan.total_repayable;
                const remaining = Math.max(Number(loan.total_repayable) - Number(loan.paid_amount), 0);
                const progressPct = Math.min(Math.round((Number(loan.paid_amount) / (Number(loan.total_repayable) || 1)) * 100), 100);

                return (
                  <Card key={loan.id} className="p-4 rounded-xl border border-border/80 bg-card shadow-xs space-y-3 relative overflow-hidden flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isComplete ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          }`}>
                            {isComplete ? (lang === "bn" ? "পরিশোধিত" : "Completed") : (lang === "bn" ? "চলমান" : "Active")}
                          </span>
                          <h3 className="font-bold text-base text-foreground mt-1">{loan.bank_name}</h3>
                          <p className="text-xs text-muted-foreground">{loan.loan_title}</p>
                        </div>
                        <Button
                          onClick={() => handleDeleteLoan(loan.id)}
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className="text-muted-foreground">{lang === "bn" ? "পরিশোধের অগ্রগতি:" : "Repayment Progress:"}</span>
                          <span className="font-mono font-bold text-primary">{progressPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>

                      {/* Financial Breakdown */}
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/60">
                        <div>
                          <span className="text-[10.5px] text-muted-foreground">{lang === "bn" ? "মূল ঋণ:" : "Principal:"}</span>
                          <p className="font-mono font-semibold">{fmtMoney(loan.principal_amount)}</p>
                        </div>
                        <div>
                          <span className="text-[10.5px] text-muted-foreground">{lang === "bn" ? "মোট পরিশোধযোগ্য:" : "Total Repayable:"}</span>
                          <p className="font-mono font-bold text-foreground">{fmtMoney(loan.total_repayable)}</p>
                        </div>
                        <div>
                          <span className="text-[10.5px] text-emerald-600 font-semibold">{lang === "bn" ? "পরিশোধিত:" : "Paid:"}</span>
                          <p className="font-mono font-bold text-emerald-600">{fmtMoney(loan.paid_amount)}</p>
                        </div>
                        <div>
                          <span className="text-[10.5px] text-rose-600 font-semibold">{lang === "bn" ? "অবশিষ্ট বকেয়া:" : "Remaining Due:"}</span>
                          <p className="font-mono font-bold text-rose-600">{fmtMoney(remaining)}</p>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground font-medium bg-muted/40 p-2 rounded-lg flex justify-between items-center">
                        {Number(loan.total_installments) > 0 ? (
                          <>
                            <span>{lang === "bn" ? "কিস্তি সংখ্যা:" : "Installments:"} <strong>{loan.paid_installments || 0}/{loan.total_installments}</strong></span>
                            <span>{lang === "bn" ? "প্রতি কিস্তি:" : "Per EMI:"} <strong>{fmtMoney(loan.installment_amount)}</strong></span>
                          </>
                        ) : (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {lang === "bn" ? "পরিশোধ ধরন: কিস্তি ছাড়া / এককালীন ও নমনীয়" : "Type: Flexible / No Fixed Installment"}
                          </span>
                        )}
                      </div>
                    </div>

                    {!isComplete && (
                      <Button
                        onClick={() => {
                          setSelectedLoan(loan);
                          setInstallmentForm({
                            amount: String(Number(loan.total_installments) > 0 ? (loan.installment_amount || remaining) : remaining),
                            payment_method: "cashbox",
                            note: "",
                          });
                          setInstallmentDialogOpen(true);
                        }}
                        className="w-full h-8 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5"
                      >
                        <Banknote className="size-3.5" />
                        <span>
                          {Number(loan.total_installments) > 0
                            ? (lang === "bn" ? "ক্যাশ থেকে কিস্তি পরিশোধ" : "Pay Installment (Cashbox)")
                            : (lang === "bn" ? "ক্যাশ থেকে ঋণ পরিশোধ / জমা" : "Repay Loan (Cashbox)")}
                        </span>
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Bank Accounts */}
        <TabsContent value="accounts" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Building2 className="size-4 text-primary" />
              <span>{lang === "bn" ? "ব্যাংক একাউন্ট তালিকা" : "Registered Bank Accounts"}</span>
            </h2>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setTxForm({ account_id: accounts[0]?.id || "", type: "deposit", amount: "", note: "", sync_cashbox: true });
                  setTxDialogOpen(true);
                }}
                disabled={accounts.length === 0}
                size="sm"
                variant="outline"
                className="h-8 text-xs font-semibold rounded-lg beveled-button gap-1"
              >
                <ArrowUpRight className="size-3.5 text-sky-600" />
                <span>{lang === "bn" ? "জমা / উত্তোলন" : "Deposit / Withdraw"}</span>
              </Button>

              <Button
                onClick={() => {
                  setEditingAccount(null);
                  setAccountForm({ bank_name: "", account_name: "", account_number: "", branch: "", balance: "", note: "" });
                  setAccountDialogOpen(true);
                }}
                size="sm"
                className="h-8 text-xs font-bold rounded-lg bg-primary text-primary-foreground gap-1"
              >
                <Plus className="size-3.5" />
                <span>{lang === "bn" ? "নতুন একাউন্ট" : "Add Account"}</span>
              </Button>
            </div>
          </div>

          {accounts.length === 0 ? (
            <Card className="p-8 text-center rounded-2xl border-dashed border-border text-muted-foreground space-y-2">
              <Building2 className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-xs font-medium">
                {lang === "bn" ? "কোন ব্যাংক একাউন্ট যোগ করা হয়নি।" : "No bank accounts added yet."}
              </p>
              <Button
                onClick={() => setAccountDialogOpen(true)}
                variant="outline"
                size="sm"
                className="text-xs font-bold"
              >
                {lang === "bn" ? "প্রথম ব্যাংক একাউন্ট যোগ করুন" : "Add First Account"}
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {accounts.map((acc) => (
                <Card key={acc.id} className="p-4 rounded-xl border border-border/80 bg-card shadow-xs space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="size-9 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-600">
                          <Building2 className="size-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-foreground">{acc.bank_name}</h3>
                          <p className="text-[11px] text-muted-foreground font-mono">{acc.account_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          onClick={() => {
                            setEditingAccount(acc);
                            setAccountForm({
                              bank_name: acc.bank_name,
                              account_name: acc.account_name,
                              account_number: acc.account_number,
                              branch: acc.branch || "",
                              balance: String(acc.balance || 0),
                              note: acc.note || "",
                            });
                            setAccountDialogOpen(true);
                          }}
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          onClick={() => handleDeleteAccount(acc.id)}
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1 bg-muted/40 p-2.5 rounded-lg">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{lang === "bn" ? "হোল্ডারের নাম:" : "Account Holder:"}</span>
                        <span className="font-semibold text-foreground">{acc.account_name || "N/A"}</span>
                      </div>
                      {acc.branch && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{lang === "bn" ? "ব্রাঞ্চ / শাখা:" : "Branch:"}</span>
                          <span className="text-foreground">{acc.branch}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs font-bold pt-1 border-t border-border/50">
                        <span>{lang === "bn" ? "বর্তমান ব্যালেন্স:" : "Current Balance:"}</span>
                        <span className="font-mono text-sky-600 text-sm">{fmtMoney(acc.balance || 0)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setTxForm({ account_id: acc.id, type: "deposit", amount: "", note: "", sync_cashbox: true });
                        setTxDialogOpen(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="w-1/2 h-7.5 text-xs font-semibold text-sky-600 border-sky-500/30 gap-1"
                    >
                      <ArrowDownLeft className="size-3" />
                      <span>{lang === "bn" ? "জমা" : "Deposit"}</span>
                    </Button>
                    <Button
                      onClick={() => {
                        setTxForm({ account_id: acc.id, type: "withdraw", amount: "", note: "", sync_cashbox: true });
                        setTxDialogOpen(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="w-1/2 h-7.5 text-xs font-semibold text-amber-600 border-amber-500/30 gap-1"
                    >
                      <ArrowUpRight className="size-3" />
                      <span>{lang === "bn" ? "উত্তোলন" : "Withdraw"}</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog: Add/Edit Bank Account */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              <span>{editingAccount ? (lang === "bn" ? "ব্যাংক একাউন্ট সম্পাদনা" : "Edit Bank Account") : (lang === "bn" ? "নতুন ব্যাংক একাউন্ট যোগ" : "Add Bank Account")}</span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveAccount} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label>{lang === "bn" ? "ব্যাংকের নাম *" : "Bank Name *"}</Label>
              <Input
                required
                placeholder={lang === "bn" ? "যেমন: ডাচ-বাংলা ব্যাংক / ব্র্যাক ব্যাংক" : "e.g. Dutch Bangla Bank"}
                value={accountForm.bank_name}
                onChange={e => setAccountForm({ ...accountForm, bank_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>{lang === "bn" ? "একাউন্ট হোল্ডারের নাম *" : "Account Name *"}</Label>
              <Input
                required
                placeholder={lang === "bn" ? "যেমন: ড্রিম ফ্যাশন / মোঃ স্বত্বাধিকারী" : "e.g. Dream Fashion"}
                value={accountForm.account_name}
                onChange={e => setAccountForm({ ...accountForm, account_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{lang === "bn" ? "একাউন্ট নম্বর *" : "Account Number *"}</Label>
                <Input
                  required
                  placeholder="1234567890"
                  value={accountForm.account_number}
                  onChange={e => setAccountForm({ ...accountForm, account_number: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{lang === "bn" ? "শাখা / ব্রাঞ্চ" : "Branch"}</Label>
                <Input
                  placeholder={lang === "bn" ? "উত্তরা শাখা" : "Branch Name"}
                  value={accountForm.branch}
                  onChange={e => setAccountForm({ ...accountForm, branch: e.target.value })}
                />
              </div>
            </div>
            {!editingAccount && (
              <div className="space-y-1">
                <Label>{lang === "bn" ? "প্রারম্ভিক জমা ব্যালেন্স (ঐচ্ছিক)" : "Opening Balance (Optional)"}</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={accountForm.balance}
                  onChange={e => setAccountForm({ ...accountForm, balance: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>{lang === "bn" ? "নোট" : "Note"}</Label>
              <Input
                placeholder={lang === "bn" ? "অতিরিক্ত বিবরণ..." : "Optional note..."}
                value={accountForm.note}
                onChange={e => setAccountForm({ ...accountForm, note: e.target.value })}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setAccountDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={busy} className="bg-primary font-bold">{t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Bank Transaction (Deposit / Withdraw) */}
      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Landmark className="size-5 text-primary" />
              <span>{lang === "bn" ? "ব্যাংক জমা / উত্তোলন" : "Bank Deposit / Withdrawal"}</span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTransaction} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label>{lang === "bn" ? "ব্যাংক একাউন্ট নির্বাচন করুন" : "Select Bank Account"}</Label>
              <select
                required
                value={txForm.account_id}
                onChange={e => setTxForm({ ...txForm, account_id: e.target.value })}
                className="w-full h-9 rounded-lg border border-input bg-card px-3 text-xs font-semibold"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.bank_name} - {a.account_number} ({fmtMoney(a.balance || 0)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: "deposit" })}
                variant={txForm.type === "deposit" ? "default" : "outline"}
                className="h-8 text-xs font-bold"
              >
                {lang === "bn" ? "টাকা জমা (Deposit)" : "Deposit"}
              </Button>
              <Button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: "withdraw" })}
                variant={txForm.type === "withdraw" ? "default" : "outline"}
                className="h-8 text-xs font-bold"
              >
                {lang === "bn" ? "টাকা উত্তোলন (Withdraw)" : "Withdraw"}
              </Button>
            </div>

            <div className="space-y-1">
              <Label>{lang === "bn" ? "টাকার পরিমাণ *" : "Amount *"}</Label>
              <Input
                required
                type="number"
                placeholder="0"
                value={txForm.amount}
                onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="syncCashbox"
                checked={txForm.sync_cashbox}
                onChange={e => setTxForm({ ...txForm, sync_cashbox: e.target.checked })}
                className="size-4 rounded text-primary cursor-pointer"
              />
              <Label htmlFor="syncCashbox" className="cursor-pointer text-[11px] font-medium">
                {lang === "bn" ? "দোকানের ক্যাশবক্সের সাথে সমন্বয় করুন (নগদ তহবিল থেকে কাটা/যোগ হবে)" : "Sync with Cashbox ledger"}
              </Label>
            </div>

            <div className="space-y-1">
              <Label>{lang === "bn" ? "বিবরণ / নোট" : "Description / Note"}</Label>
              <Input
                placeholder={lang === "bn" ? "ট্রানজ্যাকশন নোট..." : "Transaction note..."}
                value={txForm.note}
                onChange={e => setTxForm({ ...txForm, note: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setTxDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={busy} className="bg-primary font-bold">{t("confirm")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Take Bank Loan */}
      <Dialog open={loanDialogOpen} onOpenChange={setLoanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              <span>{lang === "bn" ? "নতুন ব্যাংক ঋণ ও ধার গ্রহণ" : "Take Bank Loan"}</span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveLoan} className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label>{lang === "bn" ? "ব্যাংক বা ঋণদাতা প্রতিষ্ঠানের নাম *" : "Bank / Lender Name *"}</Label>
              <Input
                required
                placeholder={lang === "bn" ? "যেমন: সোনালী ব্যাংক / ব্র্যাক ব্যাংক" : "e.g. BRAC Bank"}
                value={loanForm.bank_name}
                onChange={e => setLoanForm({ ...loanForm, bank_name: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>{lang === "bn" ? "ঋণের শিরোনাম / উদ্দেশ্য" : "Loan Title / Purpose"}</Label>
              <Input
                placeholder={lang === "bn" ? "ব্যবসা সম্প্রসারণ / স্টক ক্রয় ঋণ" : "Business Expansion Loan"}
                value={loanForm.loan_title}
                onChange={e => setLoanForm({ ...loanForm, loan_title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{lang === "bn" ? "গৃহীত মূল ঋণের পরিমাণ *" : "Principal Loan Amount *"}</Label>
                <Input
                  required
                  type="number"
                  placeholder="100000"
                  value={loanForm.principal_amount}
                  onChange={e => {
                    const val = e.target.value;
                    setLoanForm({
                      ...loanForm,
                      principal_amount: val,
                      total_repayable: loanForm.total_repayable || val,
                    });
                  }}
                />
              </div>

              <div className="space-y-1">
                <Label>{lang === "bn" ? "মোট পরিশোধযোগ্য পরিমাণ *" : "Total Repayable Amount *"}</Label>
                <Input
                  required
                  type="number"
                  placeholder="110000"
                  value={loanForm.total_repayable}
                  onChange={e => setLoanForm({ ...loanForm, total_repayable: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label>{lang === "bn" ? "ঋণ পরিশোধের পদ্ধতি" : "Repayment Structure"}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={loanForm.has_installments ? "default" : "outline"}
                  onClick={() => {
                    const rep = Number(loanForm.total_repayable) || Number(loanForm.principal_amount) || 0;
                    setLoanForm({
                      ...loanForm,
                      has_installments: true,
                      total_installments: loanForm.total_installments && Number(loanForm.total_installments) > 0 ? loanForm.total_installments : "12",
                      installment_amount: String(Math.round(rep / (Number(loanForm.total_installments) || 12))),
                    });
                  }}
                  className="h-8 text-xs font-semibold"
                >
                  {lang === "bn" ? "কিস্তিভিত্তিক (EMI)" : "Installment (EMI)"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!loanForm.has_installments ? "default" : "outline"}
                  onClick={() => {
                    setLoanForm({
                      ...loanForm,
                      has_installments: false,
                      total_installments: "0",
                      installment_amount: "0",
                    });
                  }}
                  className="h-8 text-xs font-semibold"
                >
                  {lang === "bn" ? "কিস্তি ছাড়া / এককালীন" : "No Installment / Flexible"}
                </Button>
              </div>
            </div>

            {loanForm.has_installments ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>{lang === "bn" ? "মোট কিস্তির সংখ্যা" : "Total Installments"}</Label>
                  <Input
                    type="number"
                    placeholder="12"
                    value={loanForm.total_installments}
                    onChange={e => {
                      const inst = Number(e.target.value) || 1;
                      const rep = Number(loanForm.total_repayable) || 0;
                      setLoanForm({
                        ...loanForm,
                        total_installments: e.target.value,
                        installment_amount: String(Math.round(rep / inst)),
                      });
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label>{lang === "bn" ? "প্রতি কিস্তির পরিমাণ" : "Per Installment (EMI)"}</Label>
                  <Input
                    type="number"
                    placeholder="9166"
                    value={loanForm.installment_amount}
                    onChange={e => setLoanForm({ ...loanForm, installment_amount: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[11px] leading-relaxed">
                {lang === "bn"
                  ? "✓ কিস্তি ছাড়া ঋণ: কোনো নির্দিষ্ট মাসিক কিস্তি নেই। সুবিধা অনুযায়ী যেকোনো সময়ে আংশিক বা এককালীন পরিশোধ করা যাবে।"
                  : "✓ Flexible Loan: No fixed monthly installments. You can repay partially or in full at any time."}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="receiveCashbox"
                checked={loanForm.receive_to_cashbox}
                onChange={e => setLoanForm({ ...loanForm, receive_to_cashbox: e.target.checked })}
                className="size-4 rounded text-primary cursor-pointer"
              />
              <Label htmlFor="receiveCashbox" className="cursor-pointer text-[11px] font-medium">
                {lang === "bn" ? "ঋণের টাকা সরাসরি দোকানের ক্যাশবক্সে জমা হবে" : "Disburse loan directly into Cashbox"}
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setLoanDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={busy} className="bg-primary font-bold">{lang === "bn" ? "ঋণ নিশ্চিত করুন" : "Confirm Loan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Pay Loan Installment */}
      <Dialog open={installmentDialogOpen} onOpenChange={setInstallmentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Banknote className="size-5 text-emerald-600" />
              <span>
                {selectedLoan && Number(selectedLoan.total_installments) === 0
                  ? (lang === "bn" ? "ব্যাংক ঋণ পরিশোধ" : "Repay Bank Loan")
                  : (lang === "bn" ? "ঋণের কিস্তি পরিশোধ" : "Pay Loan Installment")}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePayInstallment} className="space-y-3 text-xs">
            {selectedLoan && (
              <div className="p-3 bg-muted/50 rounded-xl space-y-1">
                <div className="flex justify-between font-bold">
                  <span>{selectedLoan.bank_name}</span>
                  <span className="text-primary font-mono">{selectedLoan.loan_title}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>{lang === "bn" ? "অবশিষ্ট বকেয়া ঋণ:" : "Remaining Debt:"}</span>
                  <span className="font-mono font-bold text-rose-600">
                    {fmtMoney(Math.max(Number(selectedLoan.total_repayable) - Number(selectedLoan.paid_amount), 0))}
                  </span>
                </div>
                {Number(selectedLoan.total_installments) > 0 ? (
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>{lang === "bn" ? "নির্ধারিত কিস্তি:" : "Standard EMI:"}</span>
                    <span className="font-mono font-semibold text-foreground">{fmtMoney(selectedLoan.installment_amount)}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-emerald-600 font-medium">
                    {lang === "bn" ? "নমনীয় পরিশোধ: যেকোনো পরিমাণ অর্থ পরিশোধ করতে পারেন" : "Flexible repayment: Pay any custom amount"}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>
                {selectedLoan && Number(selectedLoan.total_installments) === 0
                  ? (lang === "bn" ? "পরিশোধের টাকার পরিমাণ *" : "Payment Amount *")
                  : (lang === "bn" ? "কিস্তির টাকার পরিমাণ *" : "Installment Amount *")}
              </Label>
              <Input
                required
                type="number"
                value={installmentForm.amount}
                onChange={e => setInstallmentForm({ ...installmentForm, amount: e.target.value })}
              />
            </div>

            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-800 dark:text-amber-300 text-[11.5px] font-medium flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{lang === "bn" ? "এই টাকা সরাসরি নগদ ক্যাশবক্স (Cashbox) থেকে কেটে নেওয়া হবে।" : "This payment will be automatically deducted from Cashbox."}</span>
            </div>

            <div className="space-y-1">
              <Label>{lang === "bn" ? "নোট / রসিদ নম্বর" : "Note / Receipt No."}</Label>
              <Input
                placeholder={lang === "bn" ? "কিস্তির রসিদ নম্বর বা নোট..." : "Receipt no. or note..."}
                value={installmentForm.note}
                onChange={e => setInstallmentForm({ ...installmentForm, note: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setInstallmentDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {lang === "bn" ? "পরিশোধ নিশ্চিত করুন" : "Confirm Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
