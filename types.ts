export interface InvoiceItem {
  id: string;
  description: string; // 品名
  specification: string; // 規格
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string;
}

export interface Invoice {
  id: string;
  serialNumber: string; // Format: YYYYMMDDxxxx
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  customerTaxId?: string; // 客戶統編
  contactPerson?: string; // 下單人員
  serviceClient?: string; // 服務客戶（僅用於康士藤模板）
  serviceCompany?: string; // 服務公司（僅用於康士藤模板）
  date: string; // ISO string YYYY-MM-DD
  items: InvoiceItem[];
  totalAmount: number;
  signatureBase64: string | null;
  notes?: string; // 注意事項 (Terms & Conditions)
  remarks?: string; // 備註 (Remarks) - 內部或補充說明
  createdAt: number;
  status: 'draft' | 'pending' | 'completed';
}

export interface Product {
  id: string;
  name: string; // 品項名稱（如：大圖、小卡）
  category: string; // 品項分類（可選，用於分組）
  specification: string; // 預設規格
  price: number; // 基準價格（當沒有價格規則時使用）
  sizeOptions?: string[]; // 尺寸選項列表（如：大圖的尺寸選項、小卡的尺寸選項）
}

// 顧客分級類型（用於區分不同類型的客戶）
export type CustomerTier = 'general' | 'industry' | 'kangshiting';

export interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  taxId?: string; // 統一編號
  contactPersons: string[]; // 下單人員列表（可多個）
  startSerialNumber?: number; // 起始流水編號（可選，例如：1000 表示從 1000 開始）
  customerTier?: CustomerTier; // 顧客分級（取代 priceCategory）
  // 保持向後兼容，但將逐步移除
  priceCategory?: string; // @deprecated 使用 customerTier 代替
}

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
}

export interface MonthlyStat {
  month: string; // YYYY-MM
  totalRevenue: number;
  count: number;
  invoices: Invoice[];
}

export interface CustomerStat {
  name: string;
  totalAmount: number;
  invoiceCount: number;
  invoices: Invoice[];
  latestAddress?: string; 
  latestPhone?: string;
}

// 目標設定
export interface RevenueTarget {
  id: string;
  year: number;
  quarter?: number; // 1-4, undefined = 年度目標
  month?: number; // 1-12, 僅當需要記錄特定月份的實際營收時使用
  customerId?: string; // 客戶ID（可選，用於記錄特定客戶的營收數據）
  targetAmount: number; // 目標金額
  actualAmount?: number; // 實際營收金額（可選，用於記錄往年的實際數據）
  createdAt: number;
  updatedAt: number;
}

// 客戶分析數據
export interface CustomerAnalytics {
  customerId: string;
  customerName: string;
  firstTransactionDate: string; // 首次交易日期
  lastTransactionDate: string; // 最後交易日期
  totalRevenue: number; // 總營收
  totalInvoices: number; // 總單據數
  averageOrderValue: number; // 平均訂單金額
  transactionFrequency: number; // 交易頻率（每月平均單據數）
  customerTier: 'A' | 'B' | 'C' | 'D'; // 客戶分級（A:高價值, B:中高, C:中等, D:低）
  isActive: boolean; // 是否活躍（最近3個月有交易）
  monthsSinceLastTransaction: number; // 距離上次交易月數
}

// 產品分析數據
export interface ProductAnalytics {
  productId: string;
  productName: string;
  category: string;
  totalQuantity: number; // 總銷售數量
  totalRevenue: number; // 總營收
  totalInvoices: number; // 出現的單據數
  averagePrice: number; // 平均售價
  averageQuantityPerOrder: number; // 平均每單數量
}

// 異常通知類型
export type AlertType = 'revenue_drop' | 'revenue_spike' | 'inactive_customer' | 'unsigned_invoice' | 'target_warning';

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error'; // 嚴重程度
  relatedData?: any; // 相關數據（如客戶ID、單據ID等）
  createdAt: number;
  isRead: boolean;
  isDismissed: boolean;
}

// 數據歸檔記錄
export interface ArchiveRecord {
  id: string;
  archiveDate: string; // 歸檔日期 YYYY-MM-DD
  dataType: 'invoices' | 'customers' | 'products' | 'all'; // 歸檔數據類型
  yearRange: { start: number; end: number }; // 歸檔的年份範圍
  recordCount: number; // 歸檔的記錄數
  fileSize?: number; // 檔案大小（bytes）
  fileName?: string; // 檔案名稱
  createdAt: number;
}

// Default Company Info (Initial State)
export const DEFAULT_COMPANY_INFO: CompanySettings = {
  name: "影城數位印刷",
  address: "桃園市龜山區德明路136號",
  phone: "03-3595760"
};

// 價格類別
export type PriceCategory = 'retail' | 'wholesale' | 'vip' | 'custom' | 'industry' | 'default' | '';

// 價格階層
export interface PricingTier {
  id: string;
  minQuantity: number;
  maxQuantity?: number; // undefined 表示無上限
  price: number;
}

// 價格規則
export interface PricingRule {
  id: string;
  productId: string;
  customerId?: string; // undefined 表示適用於所有客戶
  priceCategory?: PriceCategory; // 價格類別
  specification?: string; // 規格（可選，用於區分不同規格的價格）
  basePrice: number; // 基準價格
  tiers: PricingTier[]; // 價格階層列表
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// 價格規則歷史記錄
export interface PricingRuleHistory {
  id: string;
  pricingRuleId: string;
  action: 'created' | 'updated' | 'deleted' | 'activated' | 'deactivated';
  changes?: Record<string, any>; // 變更內容
  userId?: string; // 操作者ID（可選）
  timestamp: number;
}

// B2B 廠商營收記錄
export interface RevenueRecord {
  id: string;
  date: Date; // 對帳日期
  vendorName: string; // 廠商名稱
  amount: number; // 金額
  year: number; // 為了優化查詢的冗餘欄位
  month: number; // 為了優化查詢的冗餘欄位
  createdAt?: number; // 建立時間戳
  updatedAt?: number; // 更新時間戳
}

// Backward compatibility - export as COMPANY_INFO as well
export const COMPANY_INFO = DEFAULT_COMPANY_INFO;
