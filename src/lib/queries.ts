import {
  getProductsFn,
  getPartiesFn,
  getSalesFn,
  getSalesForPartyFn,
  getPurchasesFn,
  getExpensesFn,
  getSomitiFn,
  getWithdrawalsFn,
  getOwnerWalletFn,
  getPaymentsForPartyFn,
  getAllPaymentsFn,
  getAllPartyReceivablesFn,
  getAllPartyPayablesFn,
  getAllPayableSettlementsFn,
  getPartyReceivablesFn,
  getPartyPayablesFn,
  getPayableSettlementsFn,
  getReturnsFn,
  getPartyFn,
  getCashboxFn,
  getRemindersFn,
  getCustomersFn,
  getCustomerFn,
} from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────────────────
export type Product = {
  id: string; name: string; image_url: string | null;
  buy_price: number; sell_price: number; stock: number; created_at: string;
  barcode?: string | null;
  code?: string | null;
  sku?: string | null;
  qr_code?: string | null;
  product_number?: string | null;
  attributes?: Record<string, string>;
  archived?: boolean;
  min_stock?: number;
  category?: string;
};
export type Party = { id: string; name: string; phone: string | null; address?: string | null; created_at: string; archived?: boolean };
export type Customer = { id: string; name: string; phone: string | null; address?: string | null; created_at: string; archived?: boolean };
export type Sale = {
  id: string; product_id: string | null; product_name: string;
  qty: number; buy_price: number; sell_price: number; profit: number;
  type: "cash" | "bkash" | "credit" | "online"; party_id: string | null;
  paid_amount: number; due_amount: number; created_at: string;
  returned?: boolean; return_qty?: number;
  parties?: { name: string } | null;
  note?: string | null;
  cart_id?: string | null;
  discount?: number;
};
export type Payment = { id: string; party_id: string; amount: number; note: string | null; created_at: string };
export type PartyLedger = { id: string; party_id: string; amount: number; note: string | null; created_at: string };
export type Return = {
  id: string; sale_id: string; product_id: string; product_name: string;
  qty: number; note: string | null; created_at: string;
};
export type Purchase = {
  id: string; product_id: string | null; product_name: string;
  qty: number; unit_cost: number; total: number; note: string | null; created_at: string;
  payment_type?: "cash" | "credit" | null; party_id?: string | null;
};
export type Expense = { id: string; title: string; amount: number; category?: string | null; note: string | null; created_at: string };
export type Somiti = { id: string; kind: "deposit" | "withdraw"; amount: number; note: string | null; created_at: string };
export type Withdrawal = { id: string; amount: number; note: string | null; created_at: string };
export type OwnerWalletEntry = { id: string; amount: number; category?: string | null; note: string | null; created_at: string };
export type CashboxEntry = {
  id: string;
  kind: "deposit" | "withdraw" | "sale" | "expense";
  amount: number;
  note: string | null;
  ref_id?: string | null;
  created_at: string;
};
export type Reminder = {
  id: string;
  title: string;
  due_date: string;
  completed: boolean;
  logic_type?: string;
  logic_config?: any;
  created_at: string;
};

// ─── Query functions (called by react-query) ─────────────────────────────────
export const getProducts = () => getProductsFn() as unknown as Promise<Product[]>;
export const getParties = () => getPartiesFn() as unknown as Promise<Party[]>;
export const getParty = (id: string) => getPartyFn({ data: { id } }) as unknown as Promise<Party | null>;
export const getCustomers = () => getCustomersFn() as unknown as Promise<Customer[]>;
export const getCustomer = (id: string) => getCustomerFn({ data: { id } }) as unknown as Promise<Customer | null>;
export const getSales = () => getSalesFn() as unknown as Promise<Sale[]>;
export const getPurchases = () => getPurchasesFn() as unknown as Promise<Purchase[]>;
export const getExpenses = () => getExpensesFn() as unknown as Promise<Expense[]>;
export const getSomiti = () => getSomitiFn() as unknown as Promise<Somiti[]>;
export const getWithdrawals = () => getWithdrawalsFn() as unknown as Promise<Withdrawal[]>;
export const getOwnerWallet = () => getOwnerWalletFn() as unknown as Promise<OwnerWalletEntry[]>;
export const getCashbox = () => getCashboxFn() as unknown as Promise<CashboxEntry[]>;
export const getSalesForParty = (partyId: string) => getSalesForPartyFn({ data: { partyId } }) as unknown as Promise<Sale[]>;
export const getPaymentsForParty = (partyId: string) => getPaymentsForPartyFn({ data: { partyId } }) as unknown as Promise<Payment[]>;
export const getAllPayments = () => getAllPaymentsFn() as unknown as Promise<Payment[]>;
export const getAllPartyReceivables = () => getAllPartyReceivablesFn() as unknown as Promise<PartyLedger[]>;
export const getAllPartyPayables = () => getAllPartyPayablesFn() as unknown as Promise<PartyLedger[]>;
export const getAllPayableSettlements = () => getAllPayableSettlementsFn() as unknown as Promise<PartyLedger[]>;
export const getPartyReceivables = (partyId: string) => getPartyReceivablesFn({ data: { partyId } }) as unknown as Promise<PartyLedger[]>;
export const getPartyPayables = (partyId: string) => getPartyPayablesFn({ data: { partyId } }) as unknown as Promise<PartyLedger[]>;
export const getPayableSettlements = (partyId: string) => getPayableSettlementsFn({ data: { partyId } }) as unknown as Promise<PartyLedger[]>;
export const getReturns = () => getReturnsFn() as unknown as Promise<Return[]>;
export const getReminders = () => getRemindersFn() as unknown as Promise<Reminder[]>;

/** In ImgBB configuration, the path is already a direct URL string. */
export async function signedImage(path: string | null): Promise<string | null> {
  return path || null;
}