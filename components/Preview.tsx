import React, { useMemo } from 'react';
import InvoiceSheet from './InvoiceSheet';
import { Invoice, CompanySettings, Product, Customer } from '../types';
import { generateId } from '../utils/helpers';

const Preview: React.FC = () => {
  // 使用 useMemo 確保數據穩定，避免每次渲染重新生成
  const sampleCompanySettings: CompanySettings = useMemo(() => ({
    name: "影城數位印刷",
    address: "桃園市龜山區德明路136號",
    phone: "03-3595760"
  }), []);

  const sampleInvoice: Invoice = useMemo(() => ({
    id: 'preview-invoice-001',
    serialNumber: "CP20250130001",
    customerName: "示例客戶有限公司",
    customerAddress: "台北市信義區信義路五段7號",
    customerPhone: "02-2345-6789",
    customerTaxId: "12345678",
    contactPerson: "王小明",
    date: new Date().toISOString().split('T')[0],
    items: [
      {
        id: 'preview-item-001',
        description: "大圖輸出",
        specification: "A1 (594x841mm)",
        quantity: 5,
        unitPrice: 500,
        amount: 2500,
        remark: ""
      },
      {
        id: 'preview-item-002',
        description: "名片印刷",
        specification: "標準尺寸",
        quantity: 1000,
        unitPrice: 0.5,
        amount: 500,
        remark: "雙面印刷"
      },
      {
        id: 'preview-item-003',
        description: "海報設計",
        specification: "A3",
        quantity: 1,
        unitPrice: 1500,
        amount: 1500,
        remark: "含設計費"
      }
    ],
    totalAmount: 4500,
    signatureBase64: null,
    notes: "本單據經簽收後即視為正式驗收憑證。",
    remarks: "請於收到貨物後7日內完成驗收。",
    createdAt: Date.now(),
    status: 'pending' as const
  }), []);

  const sampleProducts: Product[] = useMemo(() => [
    {
      id: 'preview-product-001',
      name: "大圖輸出",
      category: "印刷",
      specification: "A1",
      price: 500,
      sizeOptions: ["A1 (594x841mm)", "A2 (420x594mm)", "A3 (297x420mm)"]
    },
    {
      id: 'preview-product-002',
      name: "名片印刷",
      category: "印刷",
      specification: "標準尺寸",
      price: 0.5,
      sizeOptions: []
    }
  ], []);

  const sampleCustomers: Customer[] = useMemo(() => [
    {
      id: 'preview-customer-001',
      name: "示例客戶有限公司",
      address: "台北市信義區信義路五段7號",
      phone: "02-2345-6789",
      taxId: "12345678",
      contactPersons: ["王小明", "李小華"],
      customerTier: 'general' as const
    }
  ], []);

  const memoizedCustomers = useMemo(() => sampleCustomers.map(c => c.name), [sampleCustomers]);
  const memoizedCustomerMap = useMemo(() => {
    return new Map([
      [sampleCustomers[0].name, {
        address: sampleCustomers[0].address,
        phone: sampleCustomers[0].phone,
        taxId: sampleCustomers[0].taxId,
        contactPersons: sampleCustomers[0].contactPersons
      }]
    ]);
  }, [sampleCustomers]);

  return (
    <div className="min-h-screen bg-stone-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* 標題區域 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">發票預覽畫面</h1>
          <p className="text-slate-600 text-sm">
            以下是對帳單的預覽效果，展示實際列印時的樣貌。
          </p>
        </div>

        {/* 預覽區域 */}
        <div className="bg-stone-100 rounded-xl p-6 md:p-8 flex justify-center">
          <div className="w-full max-w-[297mm]">
            <InvoiceSheet
              invoice={sampleInvoice}
              existingCustomers={memoizedCustomers}
              customerMap={memoizedCustomerMap}
              products={sampleProducts}
              companySettings={sampleCompanySettings}
              customers={sampleCustomers}
              invoices={[]}
              pricingRules={[]}
              isEditing={false}
              isRemoteSignMode={false}
            />
          </div>
        </div>

        {/* 說明區域 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">預覽說明</h2>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start">
              <span className="text-brand-500 mr-2">•</span>
              <span>此預覽展示對帳單的實際列印效果</span>
            </li>
            <li className="flex items-start">
              <span className="text-brand-500 mr-2">•</span>
              <span>實際使用時，您可以點擊「PDF」按鈕下載 PDF 檔案</span>
            </li>
            <li className="flex items-start">
              <span className="text-brand-500 mr-2">•</span>
              <span>對帳單採用 A4 橫式格式，適合列印和電子傳送</span>
            </li>
            <li className="flex items-start">
              <span className="text-brand-500 mr-2">•</span>
              <span>客戶可以在線上簽署，或下載後列印簽名</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Preview;
