import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Invoice, InvoiceItem, COMPANY_INFO, Product, CompanySettings, Customer, PricingRule } from '../types';
import { formatCurrency, calculateTotal, generateId, generateCustomerSerialNumber, findPriceForProduct, getMonthKey } from '../utils/helpers';
import SignatureCanvas from './SignatureCanvas';
import { Plus, Trash2, Save, PenTool, Check, Download, AlertCircle, Link as LinkIcon, Copy, FileText } from 'lucide-react';

interface InvoiceSheetProps {
  invoice: Invoice;
  existingCustomers: string[];
  customerMap?: Map<string, { address: string, phone: string, taxId?: string, contactPersons: string[] }>;
  products?: Product[];
  companySettings?: CompanySettings;
  customers?: Customer[];
  invoices?: Invoice[];
  pricingRules?: PricingRule[];
  isEditing: boolean;
  isRemoteSignMode?: boolean; // If true, automatically enter signing mode (for remote signing links)
  onUpdate?: (updatedInvoice: Invoice) => void;
  onSave?: () => void;
  onDelete?: () => void;
  onSignAndComplete?: (signature: string) => void;
  onCancel?: () => void;
}

const InvoiceSheet: React.FC<InvoiceSheetProps> = ({ 
  invoice, 
  existingCustomers,
  customerMap,
  products = [],
  companySettings,
  customers = [],
  invoices = [],
  pricingRules = [],
  isEditing, 
  isRemoteSignMode = false,
  onUpdate, 
  onSave, 
  onDelete,
  onSignAndComplete,
  onCancel 
}) => {
  const company = companySettings || COMPANY_INFO;
  const [localInvoice, setLocalInvoice] = useState<Invoice>(invoice);
  const [isSigningMode, setIsSigningMode] = useState(false);
  const [tempSignature, setTempSignature] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Determine template type based on customer tier
  const currentCustomer = customers.find(c => c.name === localInvoice.customerName);
  const customerTier = currentCustomer?.customerTier || currentCustomer?.priceCategory;
  const isKangshitingTemplate = customerTier === 'kangshiting';

  // Get service client history from invoices
  const serviceClientHistory = useMemo(() => {
    if (!isKangshitingTemplate) return [];
    const history = new Set<string>();
    invoices
      .filter(inv => inv.customerName === localInvoice.customerName && inv.serviceClient)
      .forEach(inv => {
        if (inv.serviceClient) history.add(inv.serviceClient);
      });
    return Array.from(history).sort();
  }, [invoices, localInvoice.customerName, isKangshitingTemplate]);


  // Sync local state when props change
  useEffect(() => {
    setLocalInvoice(invoice);
  }, [invoice]);

  // Auto-enter signing mode if in remote sign mode and invoice is not yet signed
  useEffect(() => {
    if (isRemoteSignMode && !localInvoice.signatureBase64 && !isEditing) {
      setIsSigningMode(true);
    }
  }, [isRemoteSignMode, localInvoice.signatureBase64, isEditing]);


  const handleInputChange = (field: keyof Invoice, value: any) => {
    if (!isEditing && field !== 'signatureBase64') return;
    if (field === 'signatureBase64' && !isSigningMode && !isEditing) return;

    let updated = { ...localInvoice, [field]: value };

    // Auto-fill logic for customer details and generate serial number
    if (field === 'customerName' && value) {
        // Auto-fill customer details
        if (customerMap && customerMap.has(value)) {
            const info = customerMap.get(value);
            if (info) {
                updated = { 
                    ...updated, 
                    customerAddress: info.address || updated.customerAddress,
                    customerPhone: info.phone || updated.customerPhone,
                    customerTaxId: (info as any).taxId || updated.customerTaxId
                    // Don't auto-fill contactPerson - let user select from list
                };
            }
        }
        
        // Generate new serial number for this customer (only for new invoices)
        // Check if this is a new invoice:
        // - No customer name
        // - Serial ends with 00000 (old format: CP00000)
        // - Serial matches CP0000000000 (new temporary format)
        // - Old date-based format: YYYYMMDDxxxx
        const isNewInvoice = !invoice.customerName || 
                            invoice.serialNumber === 'CP0000000000' ||
                            invoice.serialNumber.endsWith('00000') || 
                            invoice.serialNumber.endsWith('0000') ||
                            /^\d{8}\d{4}$/.test(invoice.serialNumber); // Old format: YYYYMMDDxxxx
        if (isNewInvoice && invoices.length >= 0) {
            const customer = customers.find(c => c.name === value);
            if (customer) {
                const customerInvoices = invoices.filter(inv => inv.customerName === value);
                // Use customerTier if available, otherwise fall back to priceCategory for backward compatibility
                const customerTier = customer.customerTier || customer.priceCategory;
                const newSerial = generateCustomerSerialNumber(value, customer.id, customerInvoices, customer?.startSerialNumber, customerTier);
                updated = { ...updated, serialNumber: newSerial };
            }
        }
    }

    setLocalInvoice(updated);
    if (onUpdate) onUpdate(updated);
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    if (!isEditing || !onUpdate) return;
    
    const newItems = localInvoice.items.map(item => {
      if (item.id === id) {
        let updatedItem = { ...item, [field]: value };
        
        // Auto-fill from Product selection
        if (field === 'description' && products.length > 0) {
           const selectedProduct = products.find(p => p.name === value);
           if (selectedProduct) {
               // Keep current specification if product has size options (user should select from options)
               // Only auto-fill if no size options available
               if (!selectedProduct.sizeOptions || selectedProduct.sizeOptions.length === 0) {
                   updatedItem.specification = selectedProduct.specification || '';
               }
               // Try to get price from pricing rules
               const customer = customers.find(c => c.name === localInvoice.customerName);
               const price = findPriceForProduct(
                 selectedProduct.id,
                 item.quantity || 1,
                 updatedItem.specification,
                 customer?.id,
                 customer?.priceCategory,
                 pricingRules
               );
               updatedItem.unitPrice = price !== null ? price : (selectedProduct.price || 0);
               updatedItem.amount = (item.quantity || 1) * updatedItem.unitPrice;
           }
        }
        
        // When specification or quantity changes, re-calculate price from pricing rules
        if (field === 'specification' || field === 'quantity') {
          const selectedProduct = products.find(p => p.name === item.description);
          if (selectedProduct && pricingRules.length > 0) {
            const customer = customers.find(c => c.name === localInvoice.customerName);
            const spec = field === 'specification' ? value : (updatedItem.specification || '');
            const qty = field === 'quantity' ? Number(value) : (item.quantity || 1);
            const price = findPriceForProduct(
              selectedProduct.id,
              qty,
              spec,
              customer?.id,
              customer?.priceCategory,
              pricingRules
            );
            if (price !== null) {
              updatedItem.unitPrice = price;
              updatedItem.amount = qty * price;
            }
          }
        }

        if (field === 'quantity' || field === 'unitPrice') {
           const qty = field === 'quantity' ? Number(value) : item.quantity;
           const price = field === 'unitPrice' ? Number(value) : item.unitPrice;
           updatedItem.amount = qty * price;
        }
        return updatedItem;
      }
      return item;
    });

    const newTotal = calculateTotal(newItems);
    const updated = { ...localInvoice, items: newItems, totalAmount: newTotal };
    setLocalInvoice(updated);
    onUpdate(updated);
  };

  const addItem = () => {
    if (!isEditing || !onUpdate) return;
    const newItem: InvoiceItem = {
      id: generateId(),
      description: '',
      specification: '',
      quantity: 1,
      unitPrice: 0,
      amount: 0,
      remark: ''
    };
    const newItems = [...localInvoice.items, newItem];
    const updated = { ...localInvoice, items: newItems };
    setLocalInvoice(updated);
    onUpdate(updated);
  };

  const removeItem = (id: string) => {
    if (!isEditing || !onUpdate) return;
    const newItems = localInvoice.items.filter(item => item.id !== id);
    const newTotal = calculateTotal(newItems);
    const updated = { ...localInvoice, items: newItems, totalAmount: newTotal };
    setLocalInvoice(updated);
    onUpdate(updated);
  };

  const handleDownloadPDF = async () => {
    if (!sheetRef.current) return;
    
    // Use high-resolution html2pdf with improved settings
    const html2pdf = (window as any).html2pdf;
    if (!html2pdf) {
        alert("PDF 產生器尚未載入，請稍後再試或重新整理頁面。");
        return;
    }

    const element = sheetRef.current;
    
    // Create a clone for PDF generation to clean up UI elements
    const clone = element.cloneNode(true) as HTMLElement;
    clone.classList.remove('shadow-xl', 'rounded-sm');
    
    // 計算內容實際高度（像素）- 用於動態設置 PDF 尺寸
    const rect = element.getBoundingClientRect();
    const contentHeightPx = rect.height || element.scrollHeight;
    const contentWidthPx = rect.width || element.scrollWidth;
    
    // 將像素轉換為 mm（假設 96 DPI: 1mm ≈ 3.7795px）
    const contentHeightMm = contentHeightPx / 3.7795;
    const contentWidthMm = contentWidthPx / 3.7795;
    
    // PDF 寬度固定為 A4 橫式寬度，高度根據內容動態調整
    const PDF_WIDTH_MM = 297;
    const MARGIN_MM = 2;
    // 計算 PDF 高度：內容高度 + 邊距
    const pdfHeight = Math.max(contentHeightMm + (MARGIN_MM * 2), 50); // 最小高度 50mm
    
    // 計算 canvas 縮放比例（保持高解析度）
    const canvasScale = 2; 
    
    // Remove UI elements that shouldn't appear in PDF
    const actionBar = clone.querySelector('.print\\:hidden');
    if (actionBar) actionBar.remove();

    const footerInfo = clone.querySelector('.fixed.bottom-4');
    if (footerInfo) footerInfo.remove();
    
    // Remove all hidden print elements
    const hiddenElements = clone.querySelectorAll('.print\\:hidden');
    hiddenElements.forEach((el) => el.remove());
    
    // Remove editing buttons and input fields, show only display values
    const allInputs = clone.querySelectorAll('input, textarea');
    allInputs.forEach((input) => {
      if (input.tagName === 'INPUT') {
        const inputEl = input as HTMLInputElement;
        const displayValue = inputEl.value;
        const wrapper = inputEl.parentElement;
        if (wrapper && inputEl.type !== 'hidden') {
          const displayDiv = document.createElement('div');
          // Copy relevant styles
          const computedStyle = window.getComputedStyle(inputEl);
          displayDiv.style.padding = computedStyle.padding || '0.5rem';
          displayDiv.style.textAlign = computedStyle.textAlign || 'left';
          displayDiv.style.fontSize = computedStyle.fontSize;
          displayDiv.style.fontWeight = computedStyle.fontWeight;
          displayDiv.style.color = computedStyle.color;
          displayDiv.textContent = displayValue || '';
          // Preserve parent class if it's a td
          if (wrapper.tagName === 'TD' || wrapper.tagName === 'TH') {
            displayDiv.style.width = '100%';
          }
          wrapper.replaceChild(displayDiv, inputEl);
        }
      } else if (input.tagName === 'TEXTAREA') {
        const textareaEl = input as HTMLTextAreaElement;
        const displayValue = textareaEl.value;
        const wrapper = textareaEl.parentElement;
        if (wrapper) {
          const displayDiv = document.createElement('div');
          displayDiv.className = 'whitespace-pre-wrap';
          displayDiv.style.padding = '0.75rem';
          displayDiv.textContent = displayValue || '';
          wrapper.replaceChild(displayDiv, textareaEl);
        }
      }
    });
    
    // Remove all datalist elements (not needed in PDF)
    const datalists = clone.querySelectorAll('datalist');
    datalists.forEach((dl) => dl.remove());
    
    // Ensure background is white for PDF and allow full height
    clone.style.backgroundColor = '#ffffff';
       // 所有對帳單都使用橫式尺寸
       clone.style.width = '297mm'; // A4 landscape width
       clone.style.maxWidth = '297mm';
    clone.style.height = 'auto'; // Allow height to expand with content
    clone.style.minHeight = 'auto';
    clone.style.position = 'relative';
    clone.style.overflow = 'visible';
    clone.style.display = 'block';
    
    // Ensure all child elements can expand
    const allChildren = clone.querySelectorAll('*');
    allChildren.forEach((child) => {
      const childEl = child as HTMLElement;
      // Remove any max-height constraints
      if (childEl.style.maxHeight) {
        childEl.style.maxHeight = 'none';
      }
      // Ensure overflow doesn't hide content
      if (childEl.style.overflow === 'hidden') {
        childEl.style.overflow = 'visible';
      }
    });
    
      // Fix table layout for PDF - ensure all columns are visible
      const tables = clone.querySelectorAll('table');
      tables.forEach((table) => {
        const tableEl = table as HTMLElement;
        tableEl.style.width = '100%';
        tableEl.style.minWidth = '100%';
        tableEl.style.maxWidth = '100%';
        tableEl.style.borderCollapse = 'collapse';
        tableEl.style.tableLayout = 'auto';
        
        // Remove any min-width constraints that might cause overflow
        tableEl.classList.remove('min-w-[500px]');
        tableEl.style.minWidth = '100%';
        
        // Preserve or create colgroup for proper column widths
        let colgroup = table.querySelector('colgroup');
        if (!colgroup) {
          colgroup = document.createElement('colgroup');
          // Create columns based on header count
          const headerRow = table.querySelector('thead tr');
          if (headerRow) {
            const headerCount = headerRow.querySelectorAll('th:not(.print\\:hidden)').length;
            const widths = [5, 25, 20, 8, 12, 15, 15]; // Percentage widths
            for (let i = 0; i < headerCount && i < widths.length; i++) {
              const col = document.createElement('col');
              col.style.width = `${widths[i]}%`;
              colgroup.appendChild(col);
            }
            table.insertBefore(colgroup, table.firstChild);
          }
        } else {
          // Ensure colgroup columns have percentage widths
          const cols = colgroup.querySelectorAll('col');
          cols.forEach((col) => {
            const colEl = col as HTMLElement;
            if (colEl.style.width && !colEl.style.width.includes('%')) {
              // Convert to percentage if not already
              colEl.style.width = '';
            }
          });
        }
        
        // Ensure all table cells have proper width and are visible
        const allCells = table.querySelectorAll('th, td');
        allCells.forEach((cell) => {
          const cellEl = cell as HTMLElement;
          cellEl.style.width = '';
          cellEl.style.minWidth = '0';
          cellEl.style.maxWidth = 'none';
          cellEl.style.display = '';
          // Remove width classes that might cause issues
          cellEl.classList.forEach((cls) => {
            if (cls.startsWith('w-')) {
              cellEl.classList.remove(cls);
            }
          });
        });
      });
    
    // Fix parent container of table (remove overflow-x-auto)
    const tableContainers = clone.querySelectorAll('.overflow-x-auto');
    tableContainers.forEach((container) => {
      const containerEl = container as HTMLElement;
      containerEl.style.overflow = 'visible';
      containerEl.style.overflowX = 'visible';
      containerEl.style.overflowY = 'visible';
    });
    
    // Remove overflow hidden that might hide content
    const overflowElements = clone.querySelectorAll('[class*="overflow"]');
    overflowElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.classList.contains('overflow-x-auto') || htmlEl.classList.contains('overflow-hidden')) {
        htmlEl.style.overflow = 'visible';
        htmlEl.style.overflowX = 'visible';
        htmlEl.style.overflowY = 'visible';
      }
    });
    
    // Improve text rendering quality
    (clone.style as any).webkitFontSmoothing = 'antialiased';
    (clone.style as any).mozOsxFontSmoothing = 'grayscale';

    // Generate PDF filename: 客戶名稱_流水編號_月份
    const monthKey = getMonthKey(localInvoice.date).replace('-', ''); // Format: YYYYMM
    const fileNamePrefix = localInvoice.customerName || company.name || '對帳單';
    const pdfFilename = `${fileNamePrefix}_${localInvoice.serialNumber}_${monthKey}`;
    
    const opt = {
      margin:       2, // 減少邊距以獲得更多空間
      filename:     pdfFilename,
      image:        { 
        type: 'png', // Use PNG instead of JPEG for better quality
        quality: 1.0 
      },
      html2canvas:  { 
        scale: canvasScale, // 根據內容動態調整縮放比例，確保符合一頁
        useCORS: true,
        logging: false,
        letterRendering: true, // Better text rendering
        allowTaint: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        // Don't set fixed dimensions - let html2canvas calculate from element's actual size
        // This ensures the entire content is captured
        onclone: (clonedDoc: Document) => {
          // Fix styles in the cloned document
          const clonedElement = clonedDoc.body.firstElementChild as HTMLElement;
          if (clonedElement) {
            // 計算實際內容尺寸
            const contentHeightPx = clonedElement.scrollHeight || clonedElement.offsetHeight || element.scrollHeight;
            const contentWidthPx = clonedElement.scrollWidth || clonedElement.offsetWidth || element.scrollWidth;
            
            // PDF 寬度固定為 A4 橫式寬度
            const PDF_WIDTH_MM = 297;
            
            // 設置容器尺寸（不限制高度，讓內容自然展開）
            clonedElement.style.width = `${PDF_WIDTH_MM}mm`;
            clonedElement.style.maxWidth = `${PDF_WIDTH_MM}mm`;
            clonedElement.style.margin = '0 auto';
            clonedElement.style.display = 'block';
            clonedElement.style.height = 'auto';
            clonedElement.style.minHeight = 'auto';
            clonedElement.style.maxHeight = 'none'; // 不限制最大高度
            clonedElement.style.overflow = 'visible';
            
            // 強制單頁：設置所有元素避免分頁
            clonedElement.style.pageBreakInside = 'avoid';
            clonedElement.style.pageBreakBefore = 'avoid';
            clonedElement.style.pageBreakAfter = 'avoid';
            clonedElement.style.breakInside = 'avoid';
            clonedElement.style.breakBefore = 'avoid';
            clonedElement.style.breakAfter = 'avoid';
          }
          
          // Ensure body and html elements don't restrict height and support centering
          clonedDoc.body.style.height = 'auto';
          clonedDoc.body.style.minHeight = 'auto';
          clonedDoc.body.style.maxHeight = 'none';
          clonedDoc.body.style.margin = '0';
          clonedDoc.body.style.padding = '0';
          clonedDoc.body.style.display = 'flex';
          clonedDoc.body.style.flexDirection = 'column';
          clonedDoc.body.style.alignItems = 'center';
          clonedDoc.body.style.justifyContent = 'flex-start';
          clonedDoc.documentElement.style.height = 'auto';
          clonedDoc.documentElement.style.minHeight = 'auto';
          clonedDoc.documentElement.style.maxHeight = 'none';
          clonedDoc.documentElement.style.margin = '0';
          clonedDoc.documentElement.style.padding = '0';
          
          // Ensure tables are properly sized and all columns visible
          const clonedTables = clonedDoc.querySelectorAll('table');
          clonedTables.forEach((table) => {
            const tableEl = table as HTMLElement;
            tableEl.style.width = '100%';
            tableEl.style.minWidth = '100%';
            tableEl.style.maxWidth = '100%';
            tableEl.style.tableLayout = 'auto';
            
            // Ensure colgroup exists and has proper widths
            let colgroup = table.querySelector('colgroup');
            if (!colgroup) {
              colgroup = clonedDoc.createElement('colgroup');
              const headerRow = table.querySelector('thead tr');
              if (headerRow) {
                const headerCount = headerRow.querySelectorAll('th:not(.print\\:hidden)').length;
                const widths = [5, 25, 20, 8, 12, 15, 15];
                for (let i = 0; i < headerCount && i < widths.length; i++) {
                  const col = clonedDoc.createElement('col');
                  col.setAttribute('style', `width: ${widths[i]}%`);
                  colgroup.appendChild(col);
                }
                table.insertBefore(colgroup, table.firstChild);
              }
            }
            
            // Ensure all cells are visible and properly sized
            const allCells = table.querySelectorAll('th, td');
            allCells.forEach((cell) => {
              const cellEl = cell as HTMLElement;
              cellEl.style.minWidth = '0';
              cellEl.style.maxWidth = 'none';
              cellEl.style.width = '';
              // Remove any display:none or visibility hidden
              if (cellEl.style.display === 'none') {
                cellEl.style.display = '';
              }
              if (cellEl.style.visibility === 'hidden') {
                cellEl.style.visibility = 'visible';
              }
            });
            
            // Ensure table container doesn't hide overflow
            const tableContainer = table.parentElement;
            if (tableContainer) {
              tableContainer.setAttribute('style', 'overflow: visible !important; overflow-x: visible !important;');
            }
          });
          
          // Remove any overflow hidden or auto and prevent page breaks
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            const overflow = htmlEl.style.overflow;
            const overflowX = htmlEl.style.overflowX;
            if (overflow === 'hidden' || overflowX === 'auto' || overflowX === 'hidden') {
              htmlEl.style.overflow = 'visible';
              htmlEl.style.overflowX = 'visible';
              htmlEl.style.overflowY = 'visible';
            }
            // 強制單頁：設置所有元素避免分頁
            htmlEl.style.pageBreakInside = 'avoid';
            htmlEl.style.pageBreakBefore = 'avoid';
            htmlEl.style.pageBreakAfter = 'avoid';
            htmlEl.style.breakInside = 'avoid';
            htmlEl.style.breakBefore = 'avoid';
            htmlEl.style.breakAfter = 'avoid';
            // 移除 break-inside-avoid 類別（已經通過 style 設置）
            htmlEl.classList.remove('break-inside-avoid');
          });
          
          // Ensure body and html don't hide overflow
          clonedDoc.body.style.overflow = 'visible';
          clonedDoc.documentElement.style.overflow = 'visible';
        }
      },
      jsPDF:        { 
        unit: 'mm', 
        format: [297, pdfHeight], // 動態設置高度以符合內容，寬度固定為 A4 橫式寬度
        orientation: 'landscape', // 所有對帳單都使用橫式
        compress: true
      },
      pagebreak:    { 
        mode: [], // 禁用自動分頁
        avoid: ['*'], // 避免所有元素分頁
        before: [], // 不在任何元素前分頁
        after: [], // 不在任何元素後分頁
        inside: [] // 不在任何元素內分頁
      }
    };

    try {
      // 使用 html2pdf 生成 PDF，確保單頁輸出
      await html2pdf().set(opt).from(clone).save();
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('PDF 產生失敗，請稍後再試。');
    }
  };

  const handleSignatureChange = (base64: string | null) => {
      setTempSignature(base64);
  };

  const confirmSignature = () => {
      if (tempSignature && onSignAndComplete) {
          onSignAndComplete(tempSignature);
          setIsSigningMode(false);
      } else {
          alert('請先在簽名板上簽名');
      }
  };

  const copySigningLink = () => {
      const url = `${window.location.origin}${window.location.pathname}?sign=${localInvoice.id}`;
      navigator.clipboard.writeText(url).then(() => {
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2000);
      });
  };

  return (
    <div className="relative group/sheet">
      {/* Floating Action Bar (Top) */}
      <div className="print:hidden mb-6 flex flex-wrap justify-between items-center bg-white/90 p-3 rounded-xl border border-brand-100 shadow-sm sticky top-0 z-30 backdrop-blur gap-2">
        <div className="flex items-center gap-3">
           <div className={`w-2 h-2 rounded-full ${localInvoice.status === 'completed' ? 'bg-emerald-500' : localInvoice.status === 'pending' ? 'bg-brand-500' : 'bg-slate-300'}`}></div>
           <span className="text-sm font-semibold text-slate-700">
            {localInvoice.status === 'draft' ? '草稿 Draft' : 
             localInvoice.status === 'pending' ? '待簽收 Pending' : '已完成 Completed'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <>
              {onDelete && (
                <button 
                  onClick={() => {
                    if (window.confirm('確定要刪除此單據嗎？此動作無法復原。')) {
                      onDelete();
                    }
                  }} 
                  className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-red-100"
                >
                  <Trash2 className="w-4 h-4 inline mr-1" />
                  刪除
                </button>
              )}
              <button onClick={onCancel} className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">取消</button>
              <button onClick={onSave} className="flex items-center px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium shadow-sm transition-all hover:shadow-md">
                <Save className="w-4 h-4 mr-2" /> 儲存 (Save)
              </button>
            </>
          ) : isSigningMode ? (
             <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsSigningMode(false)}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                >
                    取消
                </button>
                {!isRemoteSignMode && (
                  <button 
                      onClick={confirmSignature}
                      className="flex items-center px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm animate-pulse"
                  >
                      <Check className="w-4 h-4 mr-2" /> 確認簽收
                  </button>
                )}
             </div>
          ) : (
            <>  
                {/* Only show these buttons if NOT in remote sign mode */}
                {!isRemoteSignMode && (
                    <>
                        {/* Share Link Button - Only valid for saved invoices (has ID) */}
                        {localInvoice.id && !localInvoice.signatureBase64 && (
                            <button 
                                onClick={copySigningLink} 
                                className="flex items-center px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"
                                title="複製遠端簽署連結"
                            >
                                {linkCopied ? <Check className="w-4 h-4 mr-1" /> : <LinkIcon className="w-4 h-4 mr-1" />}
                                {linkCopied ? '已複製' : '簽署連結'}
                            </button>
                        )}

                        {!localInvoice.signatureBase64 && (
                            <button 
                                onClick={() => setIsSigningMode(true)} 
                                className="flex items-center px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium shadow-sm transition-colors"
                            >
                                <PenTool className="w-4 h-4 mr-2" /> 現場簽收
                            </button>
                        )}
                        <button 
                          type="button"
                          onClick={handleDownloadPDF} 
                          className="flex items-center px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium shadow-sm transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" /> PDF
                        </button>
                    </>
                )}
            </>
          )}
        </div>
      </div>

      {/* The Paper Sheet */}
      <div 
        ref={sheetRef}
        className="bg-white p-6 md:p-12 mx-auto shadow-xl print:shadow-none print:w-full print:max-w-none print:p-0 relative text-slate-900 w-[297mm] min-w-[297mm] max-w-[297mm] min-h-[210mm] landscape-template"
        style={{ width: '297mm', minWidth: '297mm', maxWidth: '297mm' }}
      >
        
               {/* Invoice Header with Logo - Compact Design */}
               <div className="mb-4 relative">
                 {/* Header Row: Logo + Company Info + Serial Number */}
                 <div className="flex items-start justify-between mb-3">
                   {/* Left: Logo and Company Name (Inline) */}
                   <div className="flex items-center gap-3">
                     <img 
                       src="/logo.png" 
                       onError={(e) => {
                           const target = e.currentTarget as HTMLImageElement;
                           target.style.display = 'none';
                       }}
                       alt="Logo" 
                       className="h-10 object-contain"
                     />
                     <div>
                       <h1 className="text-xl font-bold tracking-wide text-slate-900 leading-tight">{company.name}</h1>
                       <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                         <span>{company.address}</span>
                         <span className="mx-1">|</span>
                         <span>TEL: {company.phone}</span>
                       </div>
                     </div>
                   </div>
                   
                   {/* Right: Serial Number */}
                   <div className="border border-brand-200 rounded text-brand-600 px-2.5 py-1 bg-brand-50/50 backdrop-blur-sm print:border-red-500 print:text-red-500 flex-shrink-0">
                     <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">單號</div>
                     <div className="text-base font-mono font-bold tracking-wider">{localInvoice.serialNumber}</div>
                   </div>
                 </div>
                 
                 {/* Title: 對帳單 */}
                 <div className="text-center pb-1.5 relative">
                   <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-brand-500"></div>
                   <h2 className="text-xl font-serif font-bold tracking-wide text-slate-800">對帳單</h2>
                   <span className="text-[9px] uppercase tracking-[0.2em] text-slate-400 font-medium mt-0.5 block">Statement of Account</span>
                 </div>
               </div>

        {/* Customer Info Section - Optimized Layout */}
        <div className="mb-8 text-base space-y-3">
          {/* Row 1: Name and Date */}
          <div className="flex flex-col md:flex-row md:items-end gap-2 md:gap-4">
              {/* Customer Name */}
              <div className="flex-1 flex items-end border-b border-slate-300 pb-1 min-w-0">
                  <span className="font-bold text-slate-700 whitespace-nowrap mr-2">客戶名稱:</span>
                  {isEditing ? (
                      <div className="flex-1 relative min-w-0 group">
                          <input 
                          type="text" 
                          value={localInvoice.customerName}
                          onChange={(e) => handleInputChange('customerName', e.target.value)}
                          className="w-full outline-none px-2 bg-brand-50 hover:bg-brand-100 transition-colors rounded text-slate-900 placeholder:text-slate-300"
                          placeholder="請輸入客戶名稱"
                          autoComplete="off"
                          />
                          {/* Custom Dropdown for Customer Name */}
                          {existingCustomers.length > 0 && (
                            <div className="hidden group-focus-within:block absolute top-full left-0 w-full z-50 bg-white border border-slate-200 shadow-lg max-h-48 overflow-y-auto rounded-b-md">
                              {existingCustomers
                                .filter(c => !localInvoice.customerName || c.toLowerCase().includes(localInvoice.customerName.toLowerCase()))
                                .map((c, i) => (
                                  <div 
                                    key={i}
                                    className="px-3 py-2 hover:bg-brand-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // Prevent input blur
                                      handleInputChange('customerName', c);
                                    }}
                                  >
                                    {c}
                                  </div>
                                ))}
                                {existingCustomers.filter(c => !localInvoice.customerName || c.toLowerCase().includes(localInvoice.customerName.toLowerCase())).length === 0 && (
                                  <div className="px-3 py-2 text-xs text-slate-400 italic">無相符客戶</div>
                                )}
                            </div>
                          )}
                      </div>
                  ) : (
                      <span className="flex-1 px-2 font-bold text-lg text-slate-900 truncate">{localInvoice.customerName}</span>
                  )}
              </div>
              
              {/* Date */}
              <div className="w-full md:w-40 flex-none flex items-end border-b border-slate-300 pb-1">
                  <span className="font-bold text-slate-700 text-right mr-2 whitespace-nowrap">日期:</span>
                  {isEditing ? (
                      <input 
                      type="date" 
                      value={localInvoice.date}
                      onChange={(e) => handleInputChange('date', e.target.value)}
                      className="outline-none w-full px-1 bg-brand-50 hover:bg-brand-100 rounded text-right text-slate-900 text-sm"
                      />
                  ) : (
                      <span className="flex-1 px-1 text-right text-slate-900">{localInvoice.date}</span>
                  )}
              </div>
          </div>
          
          {/* Row 2: Address and Phone */}
          <div className="flex flex-col md:flex-row md:items-end gap-2 md:gap-4">
              <div className="flex-[3] flex items-end border-b border-slate-300 pb-1 min-w-0">
                  <span className="font-bold text-slate-700 whitespace-nowrap mr-2">地址:</span>
                  {isEditing ? (
                      <input 
                          type="text" 
                          value={localInvoice.customerAddress || ''}
                          onChange={(e) => handleInputChange('customerAddress', e.target.value)}
                          className="w-full outline-none px-2 bg-brand-50 hover:bg-brand-100 transition-colors rounded text-slate-900"
                          placeholder="客戶地址"
                      />
                  ) : (
                      <span className="flex-1 px-2 text-sm text-slate-900 truncate">{localInvoice.customerAddress}</span>
                  )}
              </div>
              <div className="flex-[2] flex items-end border-b border-slate-300 pb-1 min-w-[150px]">
                  <span className="font-bold text-slate-700 text-right mr-2 whitespace-nowrap">電話:</span>
                  {isEditing ? (
                      <input 
                          type="text" 
                          value={localInvoice.customerPhone || ''}
                          onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                          className="w-full outline-none px-2 bg-brand-50 hover:bg-brand-100 transition-colors rounded text-slate-900"
                          placeholder="客戶電話"
                      />
                  ) : (
                      <span className="flex-1 px-2 text-sm text-slate-900">{localInvoice.customerPhone}</span>
                  )}
              </div>
          </div>
          
          {/* Row 3: Tax ID, Contact Person, and Service Client (for Kangshiting) */}
          <div className={`flex flex-col md:flex-row md:items-end gap-2 md:gap-4 ${isKangshitingTemplate ? 'grid grid-cols-3' : ''}`}>
              <div className="flex-1 flex items-end border-b border-slate-300 pb-1 min-w-0">
                  <span className="font-bold text-slate-700 whitespace-nowrap mr-2">統編:</span>
                  {isEditing ? (
                      <input 
                          type="text" 
                          value={localInvoice.customerTaxId || ''}
                          onChange={(e) => handleInputChange('customerTaxId', e.target.value)}
                          className="w-full outline-none px-2 bg-brand-50 hover:bg-brand-100 transition-colors rounded text-slate-900 font-mono"
                          placeholder="統一編號"
                          maxLength={8}
                      />
                  ) : (
                      <span className="flex-1 px-2 text-sm text-slate-900 font-mono tracking-wider">{localInvoice.customerTaxId || '-'}</span>
                  )}
              </div>
              <div className="flex-1 flex items-end border-b border-slate-300 pb-1 min-w-0">
                  <span className="font-bold text-slate-700 whitespace-nowrap mr-2">下單人員:</span>
                  {isEditing ? (
                      <div className="flex-1 relative group">
                          <input 
                              type="text" 
                              value={localInvoice.contactPerson || ''}
                              onChange={(e) => handleInputChange('contactPerson', e.target.value)}
                              className="w-full outline-none px-2 bg-brand-50 hover:bg-brand-100 transition-colors rounded text-slate-900"
                              placeholder="選擇或輸入下單人員"
                              autoComplete="off"
                          />
                          {/* Custom Dropdown for Contact Person */}
                          {localInvoice.customerName && customerMap?.has(localInvoice.customerName) && (
                              <div className="hidden group-focus-within:block absolute top-full left-0 w-full z-50 bg-white border border-slate-200 shadow-lg max-h-48 overflow-y-auto rounded-b-md">
                                {customerMap.get(localInvoice.customerName)?.contactPersons
                                  .filter(p => !localInvoice.contactPerson || p.toLowerCase().includes((localInvoice.contactPerson || '').toLowerCase()))
                                  .map((person, i) => (
                                      <div 
                                        key={i}
                                        className="px-3 py-2 hover:bg-brand-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                        onMouseDown={(e) => {
                                          e.preventDefault(); // Prevent input blur
                                          handleInputChange('contactPerson', person);
                                        }}
                                      >
                                        {person}
                                      </div>
                                  ))}
                                  {customerMap.get(localInvoice.customerName)?.contactPersons
                                    .filter(p => !localInvoice.contactPerson || p.toLowerCase().includes((localInvoice.contactPerson || '').toLowerCase())).length === 0 && (
                                      <div className="px-3 py-2 text-xs text-slate-400 italic">無相符人員</div>
                                    )}
                              </div>
                          )}
                      </div>
                  ) : (
                      <span className="flex-1 px-2 text-sm text-slate-900">{localInvoice.contactPerson || '-'}</span>
                  )}
              </div>
              {/* Service Client field - only for Kangshiting template */}
              {isKangshitingTemplate && (
                  <div className="flex-1 flex items-end border-b border-slate-300 pb-1 min-w-0">
                      <span className="font-bold text-slate-700 whitespace-nowrap mr-2">服務客戶:</span>
                      {isEditing ? (
                          <div className="flex-1 relative group">
                              <input 
                                  type="text" 
                                  value={localInvoice.serviceClient || ''}
                                  onChange={(e) => handleInputChange('serviceClient', e.target.value)}
                                  className="w-full outline-none px-2 bg-brand-50 hover:bg-brand-100 transition-colors rounded text-slate-900"
                                  placeholder="選擇或輸入服務客戶"
                                  autoComplete="off"
                              />
                              {/* Custom Dropdown for Service Client */}
                              {serviceClientHistory.length > 0 && (
                                  <div className="hidden group-focus-within:block absolute top-full left-0 w-full z-50 bg-white border border-slate-200 shadow-lg max-h-48 overflow-y-auto rounded-b-md">
                                    {serviceClientHistory
                                      .filter(sc => !localInvoice.serviceClient || sc.toLowerCase().includes((localInvoice.serviceClient || '').toLowerCase()))
                                      .map((sc, i) => (
                                          <div 
                                            key={i}
                                            className="px-3 py-2 hover:bg-brand-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                            onMouseDown={(e) => {
                                              e.preventDefault(); // Prevent input blur
                                              handleInputChange('serviceClient', sc);
                                            }}
                                          >
                                            {sc}
                                          </div>
                                      ))}
                                      {serviceClientHistory.filter(sc => !localInvoice.serviceClient || sc.toLowerCase().includes((localInvoice.serviceClient || '').toLowerCase())).length === 0 && (
                                        <div className="px-3 py-2 text-xs text-slate-400 italic">無相符服務客戶</div>
                                      )}
                                  </div>
                              )}
                          </div>
                      ) : (
                          <span className="flex-1 px-2 text-sm text-slate-900">{localInvoice.serviceClient || '-'}</span>
                      )}
                  </div>
              )}
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-8 overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse min-w-[500px] print:min-w-full print:table-fixed" style={{ tableLayout: 'auto' }}>
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr className="bg-[#fff7ed] text-center text-sm font-bold text-[#1e293b] border-y border-[#fed7aa]">
                <th className="py-2 border-r border-[#fed7aa]">編號</th>
                <th className="py-2 border-r border-[#fed7aa]">品名</th>
                <th className="py-2 border-r border-[#fed7aa]">規格</th>
                <th className="py-2 border-r border-[#fed7aa]">數量</th>
                <th className="py-2 border-r border-[#fed7aa]">單價</th>
                <th className="py-2 border-r border-[#fed7aa]">金額</th>
                <th className="py-2">備註</th>
                {isEditing && <th className="w-10 print:hidden bg-white border-l border-[#fed7aa]"></th>}
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {localInvoice.items.map((item, index) => (
                <tr key={item.id} className="text-center border-b border-slate-100 hover:bg-[#fff7ed]/50 transition-colors">
                  <td className="py-2 border-r border-slate-100 text-slate-500 text-xs">{index + 1}</td>
                  <td className="p-0 border-r border-slate-100">
                    {isEditing ? (
                      <div className="relative group">
                        <input 
                          className="w-full h-10 px-2 outline-none text-left bg-transparent focus:bg-brand-50"
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                          placeholder={products.length > 0 ? "選擇或輸入品名" : "請先在設定中新增商品"}
                          autoComplete="off"
                        />
                        {/* Custom Dropdown for Products */}
                        {products.length > 0 && (
                          <div className="hidden group-focus-within:block absolute top-full left-0 w-full z-50 bg-white border border-slate-200 shadow-lg max-h-48 overflow-y-auto rounded-b-md">
                            {products
                              .filter(p => !item.description || p.name.toLowerCase().includes(item.description.toLowerCase()))
                              .map((p, i) => (
                                <div 
                                  key={p.id || i}
                                  className="px-3 py-2 hover:bg-brand-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // Prevent input blur
                                    handleItemChange(item.id, 'description', p.name);
                                  }}
                                >
                                  <div className="font-medium">{p.name}</div>
                                  {p.specification && <div className="text-xs text-slate-400">{p.specification}</div>}
                                </div>
                              ))}
                              {products.filter(p => !item.description || p.name.toLowerCase().includes(item.description.toLowerCase())).length === 0 && (
                                <div className="px-3 py-2 text-xs text-slate-400 italic">無相符商品</div>
                              )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-2 text-left font-medium">{item.description}</div>
                    )}
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    {isEditing ? (
                      <div className="relative group">
                        <input 
                          className="w-full h-10 px-2 outline-none text-left bg-transparent focus:bg-brand-50"
                          value={item.specification || ''}
                          onChange={(e) => handleItemChange(item.id, 'specification', e.target.value)}
                          placeholder="選擇或輸入規格"
                          autoComplete="off"
                        />
                        {/* Custom Dropdown for Specifications */}
                        {(() => {
                          const selectedProduct = products.find(p => p.name === item.description);
                          if (selectedProduct && selectedProduct.sizeOptions && selectedProduct.sizeOptions.length > 0) {
                            return (
                              <div className="hidden group-focus-within:block absolute top-full left-0 w-full z-50 bg-white border border-slate-200 shadow-lg max-h-48 overflow-y-auto rounded-b-md">
                                {selectedProduct.sizeOptions
                                  .filter(size => !item.specification || size.toLowerCase().includes((item.specification || '').toLowerCase()))
                                  .map((size, i) => (
                                    <div 
                                      key={i}
                                      className="px-3 py-2 hover:bg-brand-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                      onMouseDown={(e) => {
                                        e.preventDefault(); // Prevent input blur
                                        handleItemChange(item.id, 'specification', size);
                                      }}
                                    >
                                      {size}
                                    </div>
                                  ))}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    ) : (
                      <div className="p-2 text-left text-sm text-slate-600">{item.specification || ''}</div>
                    )}
                  </td>
                  <td className="p-0 border-r border-slate-100">
                     {isEditing ? (
                      <input 
                        type="number"
                        min="1"
                        className="w-full h-10 px-1 outline-none text-center bg-transparent focus:bg-brand-50"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                      />
                    ) : (
                      <div className="p-2">{item.quantity}</div>
                    )}
                  </td>
                  <td className="p-0 border-r border-slate-100">
                    {isEditing ? (
                      <input 
                        type="number"
                        className="w-full h-10 px-1 outline-none text-right bg-transparent focus:bg-brand-50 font-mono"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value)}
                      />
                    ) : (
                      <div className="p-2 text-right font-mono">{formatCurrency(item.unitPrice).replace('NT$', '')}</div>
                    )}
                  </td>
                  <td className="p-2 text-right font-medium font-mono border-r border-slate-100 text-slate-700">
                    {formatCurrency(item.amount).replace('NT$', '')}
                  </td>
                  <td className="p-0">
                    {isEditing ? (
                      <input 
                        className="w-full h-10 px-2 outline-none text-left bg-transparent focus:bg-brand-50 text-xs"
                        value={item.remark}
                        onChange={(e) => handleItemChange(item.id, 'remark', e.target.value)}
                      />
                    ) : (
                      <div className="p-2 text-left text-xs text-slate-500">{item.remark}</div>
                    )}
                  </td>
                  {isEditing && (
                    <td className="p-0 print:hidden text-center border-l border-slate-100">
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="text-slate-300 hover:text-red-500 p-2 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {/* Fillers for visual consistency */}
              {!isEditing && localInvoice.items.length < 5 && Array.from({ length: 5 - localInvoice.items.length }).map((_, i) => (
                 <tr key={`blank-${i}`} className="h-10 border-b border-slate-50">
                   <td className="border-r border-slate-50"></td><td className="border-r border-slate-50"></td><td className="border-r border-slate-50"></td><td className="border-r border-slate-50"></td><td className="border-r border-slate-50"></td><td className="border-r border-slate-50"></td><td></td>
                 </tr>
              ))}
            </tbody>
            <tfoot>
               <tr className="border-t border-[#fed7aa]">
                 <td colSpan={5} className="p-3 text-right font-bold text-lg text-[#1e293b]">
                   總計新台幣
                 </td>
                 <td className="p-3 text-right font-bold text-xl bg-[#fff7ed] border-x border-[#fed7aa] font-mono text-[#ea580c]">
                   {formatCurrency(localInvoice.totalAmount)}
                 </td>
                 <td className="bg-[#fff7ed]"></td>
                 {isEditing && <td className="print:hidden"></td>}
               </tr>
            </tfoot>
          </table>
          
          {isEditing && (
            <div className="mt-4 print:hidden text-center">
              <button 
                onClick={addItem}
                className="inline-flex items-center text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-full text-sm font-medium transition-colors border border-brand-200"
              >
                <Plus className="w-4 h-4 mr-1" /> 新增項目 (Add Item)
              </button>
            </div>
          )}
        </div>

        {/* Footer / Signature Area */}
        <div className="flex flex-col md:flex-row mt-12 gap-8 md:gap-10 break-inside-avoid">
          <div className="w-full md:w-1/2 flex flex-col gap-4">
             {/* Notes (注意事項) */}
             <div className="flex flex-col">
               <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-brand-400" />
                  <p className="font-bold text-sm text-slate-700">注意事項 / Notes:</p>
               </div>
               {isEditing ? (
                 <textarea 
                   value={localInvoice.notes || '本單據經簽收後即視為正式驗收憑證。'}
                   onChange={(e) => handleInputChange('notes', e.target.value)}
                   className="w-full p-2 border border-slate-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-xs text-slate-600 bg-slate-50/50 resize-none leading-relaxed h-20"
                   placeholder="輸入注意事項..."
                 />
               ) : (
                 <div className="p-2 border border-transparent text-xs text-slate-600 whitespace-pre-wrap leading-relaxed bg-stone-50 rounded-lg min-h-[60px]">
                   {localInvoice.notes || '本單據經簽收後即視為正式驗收憑證。'}
                 </div>
               )}
             </div>

             {/* Remarks (備註) */}
             <div className="flex flex-col">
               <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <p className="font-bold text-sm text-slate-700">備註 / Remarks:</p>
               </div>
               {isEditing ? (
                 <textarea 
                   value={localInvoice.remarks || ''}
                   onChange={(e) => handleInputChange('remarks', e.target.value)}
                   className="w-full p-2 border border-slate-300 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-xs text-slate-600 bg-slate-50/50 resize-none leading-relaxed h-20"
                   placeholder="輸入備註事項..."
                 />
               ) : (
                 <div className="p-2 border border-transparent text-xs text-slate-600 whitespace-pre-wrap leading-relaxed bg-stone-50 rounded-lg min-h-[60px]">
                   {localInvoice.remarks || '無備註'}
                 </div>
               )}
             </div>
          </div>
          <div className="w-full md:w-1/2 flex flex-col justify-end">
             <div className="mb-3 font-bold text-slate-800 border-b border-brand-200 pb-1 inline-block w-full">
                客戶簽收 (Signature):
             </div>
             
             {isSigningMode ? (
                 <div className="border-2 border-brand-400 border-dashed rounded-xl p-2 bg-brand-50/50">
                     <SignatureCanvas 
                       readOnly={false}
                       onChange={handleSignatureChange}
                     />
                     <div className="text-center text-xs text-brand-600 mt-2 font-bold animate-pulse">請在框內簽名</div>
                     {isRemoteSignMode && (
                       <button 
                           onClick={confirmSignature}
                           className="w-full mt-3 flex items-center justify-center px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-base font-bold shadow-lg shadow-emerald-200 transform active:scale-95 transition-all"
                       >
                           <Check className="w-5 h-5 mr-2" /> 確認簽收 (Confirm)
                       </button>
                     )}
                 </div>
             ) : (
                  <div className="relative">
                    <SignatureCanvas 
                        readOnly={true}
                        initialData={localInvoice.signatureBase64}
                        onChange={() => {}}
                    />
                    {localInvoice.signatureBase64 && (
                        <div className="absolute -bottom-6 right-0 text-[10px] text-slate-400 font-mono">
                            Signed Digitaly
                        </div>
                    )}
                  </div>
             )}
          </div>
        </div>
        
        {/* Print Footer */}
        <div className="hidden print:block fixed bottom-4 right-4 text-[10px] text-slate-300 font-mono">
          System generated by YingCheng Digital
        </div>
      </div>
    </div>
  );
};

export default InvoiceSheet;
