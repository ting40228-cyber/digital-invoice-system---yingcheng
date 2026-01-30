import React, { useState, useMemo, useRef } from 'react';
import { Invoice, CustomerStat, COMPANY_INFO, CompanySettings, RevenueTarget, Customer } from '../types';
import { 
  getLocalMonthKey, 
  formatCurrency
} from '../utils/helpers';
import InvoiceSheet from './InvoiceSheet'; // Import for Batch Rendering
import SignatureCanvas from './SignatureCanvas';
import { FileText, PlusCircle, Search, ChevronRight, CheckCircle, Clock, Download, Filter, CheckSquare, Square, PenTool, X } from 'lucide-react';


interface DashboardProps {
  invoices: Invoice[];
  onCreateNew: () => void;
  onSelectInvoice: (invoice: Invoice) => void;
  companySettings?: CompanySettings;
  revenueTargets?: RevenueTarget[];
  customers?: Customer[]; // Add customers prop for customer ID lookup
  onBatchSign?: (invoiceIds: string[], signatureBase64: string) => void; // Batch sign handler
}

const Dashboard: React.FC<DashboardProps> = ({ invoices, onCreateNew, onSelectInvoice, companySettings, revenueTargets = [], customers = [], onBatchSign }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalMonthKey(new Date().toISOString().split('T')[0]));
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  
  // Batch Selection State
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);
  
  // Batch Sign State
  const [isBatchSignMode, setIsBatchSignMode] = useState(false);
  const [batchSignature, setBatchSignature] = useState<string | null>(null);

  // Get available months for filtering
  const availableMonths = useMemo(() => {
      const months = new Set<string>();
      invoices.forEach(inv => months.add(getLocalMonthKey(inv.date)));
      months.add(getLocalMonthKey(new Date().toISOString().split('T')[0]));
      return Array.from(months).sort().reverse();
  }, [invoices]);

  // Filter invoices by selected month
  const filteredInvoices = useMemo(() => {
      return invoices.filter(inv => getLocalMonthKey(inv.date) === selectedMonth);
  }, [invoices, selectedMonth]);

  // For backward compatibility, keep monthlyInvoices
  const monthlyInvoices = filteredInvoices;

  // 2. Group by Customer
  const customerStats = useMemo(() => {
    const stats: Record<string, CustomerStat> = {};
    filteredInvoices.forEach(inv => {
      const name = inv.customerName || 'Unknown Customer';
      if (!stats[name]) {
        stats[name] = { 
            name, totalAmount: 0, invoiceCount: 0, invoices: [],
            latestAddress: inv.customerAddress, latestPhone: inv.customerPhone
        };
      }
      stats[name].totalAmount += inv.totalAmount;
      stats[name].invoiceCount += 1;
      stats[name].invoices.push(inv);
    });
    return Object.values(stats).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredInvoices]);

  // 3. Filter by Search
  const filteredCustomers = customerStats.filter(c => 
     c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
     c.invoices.some(inv => 
       inv.serialNumber.includes(searchTerm) ||
       // Search in invoice notes and remarks
       (inv.notes && inv.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
       (inv.remarks && inv.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
       // Search in item remarks
       inv.items.some(item => item.remark && item.remark.toLowerCase().includes(searchTerm.toLowerCase()))
     )
  );

  // Calculate total revenue
  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);


  const toggleCustomer = (name: string) => {
    setExpandedCustomer(expandedCustomer === name ? null : name);
  };

  // --- Batch Selection Logic ---
  const toggleSelectInvoice = (id: string) => {
      const newSet = new Set(selectedInvoiceIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedInvoiceIds(newSet);
  };

  const toggleSelectCustomer = (customerName: string, custInvoices: Invoice[]) => {
      const newSet = new Set(selectedInvoiceIds);
      const allSelected = custInvoices.every(i => newSet.has(i.id));
      
      custInvoices.forEach(i => {
          if (allSelected) newSet.delete(i.id);
          else newSet.add(i.id);
      });
      setSelectedInvoiceIds(newSet);
  };

  // --- Batch PDF Generation ---
  const handleBatchPdfExport = () => {
      if (selectedInvoiceIds.size === 0) return;
      setIsExportingBatch(true);
      
      // Allow DOM to render the hidden sheets
      setTimeout(() => {
          const element = printContainerRef.current;
          const html2pdf = (window as any).html2pdf;
          if (element && html2pdf) {
              // Clone the element for PDF processing
              const clone = element.cloneNode(true) as HTMLElement;
              
              // Clean up UI elements that shouldn't appear in PDF
              const actionBars = clone.querySelectorAll('.print\\:hidden');
              actionBars.forEach((bar) => bar.remove());
              
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
                    const computedStyle = window.getComputedStyle(inputEl);
                    displayDiv.style.padding = computedStyle.padding || '0.5rem';
                    displayDiv.style.textAlign = computedStyle.textAlign || 'left';
                    displayDiv.style.fontSize = computedStyle.fontSize;
                    displayDiv.style.fontWeight = computedStyle.fontWeight;
                    displayDiv.style.color = computedStyle.color;
                    displayDiv.textContent = displayValue || '';
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
              
              // Remove all datalist elements
              const datalists = clone.querySelectorAll('datalist');
              datalists.forEach((dl) => dl.remove());
              
              // Ensure background is white for PDF
              clone.style.backgroundColor = '#ffffff';
              clone.style.width = '210mm';
              clone.style.maxWidth = '210mm';
              clone.style.height = 'auto';
              clone.style.minHeight = 'auto';
              clone.style.maxHeight = 'none';
              clone.style.overflow = 'visible';
              
              // Improve text rendering quality
              (clone.style as any).webkitFontSmoothing = 'antialiased';
              (clone.style as any).mozOsxFontSmoothing = 'grayscale';
              
              // Get customer name from selected invoices for filename
              const selectedInvoices = invoicesToPrint;
              // If all invoices are from the same customer, use that customer name
              // Otherwise, use the first invoice's customer name
              const customerNames = new Set(selectedInvoices.map(inv => inv.customerName));
              const customerNameForFile = customerNames.size === 1 
                ? Array.from(customerNames)[0] 
                : (selectedInvoices[0]?.customerName || '多客戶');
              const monthKey = selectedMonth.replace('-', ''); // Format: YYYYMM
              
              const opt = {
                margin:       5,
                filename:     `${customerNameForFile}_合併對帳單_${monthKey}.pdf`,
                image:        { 
                  type: 'png', // Use PNG instead of JPEG for better quality
                  quality: 1.0 
                },
                html2canvas:  { 
                  scale: 2, // Balanced scale for quality and performance
                  useCORS: true,
                  logging: false,
                  letterRendering: true, // Better text rendering
                  allowTaint: false,
                  backgroundColor: '#ffffff',
                  scrollX: 0,
                  scrollY: 0,
                  onclone: (clonedDoc: Document) => {
                    // Set proper page breaks: each invoice should start on a new page
                    const pageBreakContainers = clonedDoc.querySelectorAll('.invoice-page-break');
                    const totalInvoices = pageBreakContainers.length;
                    
                    pageBreakContainers.forEach((pb, index) => {
                      const pbEl = pb as HTMLElement;
                      
                      // Remove margin-bottom that might cause spacing issues
                      pbEl.style.marginBottom = '0';
                      pbEl.style.paddingBottom = '0';
                      
                      // Ensure each invoice container takes full page height to prevent compression
                      const invoiceSheet = pbEl.querySelector('[class*="max-w-\\[210mm\\]"]') as HTMLElement;
                      if (invoiceSheet) {
                        // Keep minimum height but allow it to grow if content is larger
                        invoiceSheet.style.minHeight = '287mm'; // A4 height minus margins
                        invoiceSheet.style.height = 'auto';
                        invoiceSheet.style.maxHeight = 'none';
                        
                        // Remove min-h-[297mm] class effect if it exists
                        invoiceSheet.style.minHeight = '287mm';
                      }
                      
                      // Set page breaks: all except the last one should have page-break-after
                      if (index < totalInvoices - 1) {
                        // Not the last invoice - add page break after
                        pbEl.style.pageBreakAfter = 'always';
                        pbEl.style.breakAfter = 'page';
                        pbEl.style.pageBreakInside = 'avoid';
                        pbEl.style.breakInside = 'avoid';
                      } else {
                        // Last invoice - no page break to prevent blank page, but still avoid breaking inside
                        pbEl.style.pageBreakAfter = 'auto';
                        pbEl.style.breakAfter = 'auto';
                        pbEl.style.pageBreakInside = 'avoid';
                        pbEl.style.breakInside = 'avoid';
                      }
                      
                      // First invoice doesn't need page-break-before
                      if (index === 0) {
                        pbEl.style.pageBreakBefore = 'auto';
                        pbEl.style.breakBefore = 'auto';
                      } else {
                        // Ensure each invoice starts on a new page
                        pbEl.style.pageBreakBefore = 'always';
                        pbEl.style.breakBefore = 'page';
                      }
                    });
                    
                    // Remove any overflow hidden or auto from all elements to prevent clipping
                    const allElements = clonedDoc.querySelectorAll('*');
                    allElements.forEach((el) => {
                      const elHtml = el as HTMLElement;
                      // Remove any overflow hidden or auto
                      const overflow = elHtml.style.overflow;
                      const overflowX = elHtml.style.overflowX;
                      if (overflow === 'hidden' || overflowX === 'auto' || overflowX === 'hidden') {
                        elHtml.style.overflow = 'visible';
                        elHtml.style.overflowX = 'visible';
                        elHtml.style.overflowY = 'visible';
                      }
                    });
                    
                    // Ensure invoice sheet elements have proper height and no extra spacing
                    // 查找所有對帳單容器（橫式：297mm）
                    const invoiceSheetContainers = clonedDoc.querySelectorAll('[class*="max-w-\\[297mm\\]"], [class*="w-\\[297mm\\]"], [style*="max-width: 297mm"], [style*="width: 297mm"]');
                    invoiceSheetContainers.forEach((container, idx) => {
                      const containerEl = container as HTMLElement;
                      // Remove margin-bottom but keep other styles
                      containerEl.style.marginBottom = '0';
                      // Ensure each sheet has minimum height to fill one page (A4 landscape: 210mm minus margins)
                      containerEl.style.minHeight = '200mm'; // A4 landscape height minus margins (5mm each side)
                      containerEl.style.height = 'auto';
                      containerEl.style.maxHeight = 'none';
                      // Ensure width is set to landscape
                      containerEl.style.width = '297mm';
                      containerEl.style.minWidth = '297mm';
                      containerEl.style.maxWidth = '297mm';
                      // Last invoice sheet should also have no padding-bottom
                      if (idx === invoiceSheetContainers.length - 1) {
                        containerEl.style.paddingBottom = '0';
                      }
                    });
                    
                    // Fix styles in the cloned document - 所有對帳單都使用橫式尺寸
                    const clonedElement = clonedDoc.body.firstElementChild as HTMLElement;
                    if (clonedElement) {
                      clonedElement.style.width = '297mm';
                      clonedElement.style.minWidth = '297mm';
                      clonedElement.style.maxWidth = '297mm';
                      clonedElement.style.height = 'auto';
                      clonedElement.style.minHeight = 'auto';
                      clonedElement.style.maxHeight = 'none';
                      clonedElement.style.margin = '0 auto';
                      clonedElement.style.transform = 'none';
                      clonedElement.style.webkitTransform = 'none';
                      clonedElement.style.overflow = 'visible';
                    }
                    
                    // Ensure body and html elements don't restrict height
                    clonedDoc.body.style.height = 'auto';
                    clonedDoc.body.style.minHeight = 'auto';
                    clonedDoc.body.style.maxHeight = 'none';
                    clonedDoc.documentElement.style.height = 'auto';
                    clonedDoc.documentElement.style.minHeight = 'auto';
                    clonedDoc.documentElement.style.maxHeight = 'none';
                    
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
                    
                    // Ensure body and html don't hide overflow
                    clonedDoc.body.style.overflow = 'visible';
                    clonedDoc.documentElement.style.overflow = 'visible';
                  }
                },
                jsPDF:        { 
                  unit: 'mm', 
                  format: 'a4', 
                  orientation: 'landscape', // 所有對帳單都使用橫式
                  compress: true
                },
                pagebreak:    { mode: ['css', 'legacy'] } // Allow page breaks for long content (removed 'after' to prevent blank pages)
              };

              html2pdf().set(opt).from(clone).save().then(() => {
                  setIsExportingBatch(false);
                  setSelectedInvoiceIds(new Set()); // Clear selection after export
              }).catch((error: any) => {
                  console.error('Batch PDF generation error:', error);
                  setIsExportingBatch(false);
                  alert('PDF 匯出失敗，請稍後再試');
              });
          } else {
              setIsExportingBatch(false);
              alert("PDF Export failed or lib not found");
          }
      }, 1000); // Wait 1s for images/signatures to render in the hidden div
  };

  const invoicesToPrint = useMemo(() => {
      return invoices.filter(inv => selectedInvoiceIds.has(inv.id));
  }, [invoices, selectedInvoiceIds]);

  // Get pending invoices (not yet signed) from selected
  const pendingInvoicesToSign = useMemo(() => {
      return invoices.filter(inv => selectedInvoiceIds.has(inv.id) && inv.status !== 'completed');
  }, [invoices, selectedInvoiceIds]);

  // Handle batch sign
  const handleBatchSignConfirm = () => {
      if (!batchSignature || !onBatchSign) {
          alert('請先簽名');
          return;
      }
      
      if (pendingInvoicesToSign.length === 0) {
          alert('所選單據皆已完成簽收');
          return;
      }

      const invoiceIds = pendingInvoicesToSign.map(inv => inv.id);
      onBatchSign(invoiceIds, batchSignature);
      
      // Reset state
      setIsBatchSignMode(false);
      setBatchSignature(null);
      setSelectedInvoiceIds(new Set());
  };


  // Enhanced Excel Export - Supports Month, Quarter, and Year reports
  const executeExcelExport = (targetInvoices: Invoice[], filename: string, customerName?: string) => {
      // Calculate totals
      const totalAmount = targetInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      
      // Get customer info from the first invoice if specific customer export
      let custAddress = '';
      let custPhone = '';
      if (customerName && targetInvoices.length > 0) {
          custAddress = targetInvoices[0].customerAddress || '';
          custPhone = targetInvoices[0].customerPhone || '';
      }

      // Determine period label for header (Dashboard only handles month filtering)
      const periodLabel = selectedMonth;

      // Dashboard only shows invoice details, not statistics
      // Statistics reports are in the Reports page
      
      // 收集所有不重複的下單人員和服務客戶（用於下拉選單）
      const uniqueContactPersons = Array.from(new Set(targetInvoices.map(inv => inv.contactPerson).filter(Boolean))).sort();
      const uniqueServiceClients = Array.from(new Set(targetInvoices.map(inv => inv.serviceClient).filter(Boolean))).sort();

      // Generate invoice detail rows for month report
      let rowsHtml = '';
      
      targetInvoices.forEach((inv) => {
          // Combine all item remarks into one string
          const allRemarks = inv.items
              .filter(i => i.remark && i.remark.trim() !== '')
              .map(i => i.remark)
              .join('; ');

          // Filter out empty descriptions and specifications
          const descriptions = inv.items.map(i => i.description).filter(d => d && d.trim() !== '');
          const specifications = inv.items.map(i => i.specification || '').filter(s => s && s.trim() !== '');

          // Main Invoice Row
          rowsHtml += `
            <tr style="height: 30px;">
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; background-color: #ffffff;">${inv.date}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; background-color: #ffffff; mso-number-format:'\@';">${inv.serialNumber}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; background-color: #ffffff;">${descriptions.join('、')}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; background-color: #ffffff;">${specifications.join('、')}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; background-color: #ffffff;">${allRemarks}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; background-color: #ffffff; mso-number-format:'\#\,\#\#0';">${inv.totalAmount}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; background-color: #ffffff;">${inv.status === 'completed' ? '已簽收' : '未簽收'}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; background-color: #ffffff;">${inv.contactPerson || ''}</td>
                <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: center; background-color: #ffffff;">${inv.serviceClient || ''}</td>
            </tr>
          `;
      });

      // Total Row
      const taxRate = 0.05;
      const taxAmount = Math.round(totalAmount * taxRate);
      const grandTotal = totalAmount + taxAmount;
      
      rowsHtml += `
        <tr style="height: 30px;">
            <td colspan="6" style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; font-weight: bold; color: #1e293b; background-color: #ffffff;">總計 Total (未稅)</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; font-weight: bold; color: #1e293b; background-color: #fff7ed; mso-number-format:'\#\,\#\#0';">${totalAmount}</td>
            <td colspan="2" style="border: 1px solid #e2e8f0; padding: 8px 10px; background-color: #fff7ed;"></td>
        </tr>
        <tr style="height: 30px;">
            <td colspan="6" style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; font-weight: bold; color: #ea580c; background-color: #ffffff;">總計 Total (含稅)</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; font-weight: bold; color: #ea580c; background-color: #fff7ed; mso-number-format:'\#\,\#\#0';">${grandTotal}</td>
            <td colspan="2" style="border: 1px solid #e2e8f0; padding: 8px 10px; background-color: #fff7ed;"></td>
        </tr>
      `;

      // 創建下拉選單的選項列表（用於 Data Validation）
      const contactPersonList = uniqueContactPersons.length > 0 ? uniqueContactPersons.join(',') : '全部';
      const serviceClientList = uniqueServiceClients.length > 0 ? uniqueServiceClients.join(',') : '全部';

      // Header Info
      const headerHtml = `
        <tr>
            <td colspan="9" style="text-align: center; font-size: 24px; font-weight: bold; height: 50px; vertical-align: middle; color: #1e293b; background-color: #ffffff;">${COMPANY_INFO.name}</td>
        </tr>
        <tr>
            <td colspan="9" style="text-align: center; font-weight: bold; font-size: 18px; height: 40px; color: #334155; background-color: #ffffff;">
                ${customerName ? customerName + ' - ' : ''}對帳單明細表 (${periodLabel})
            </td>
        </tr>
        <tr>
            <td colspan="9" style="text-align: center; color: #64748b; font-size: 14px; height: 30px; border-bottom: 2px solid #f97316; background-color: #ffffff;">
                ${customerName && custPhone ? '客戶電話：' + custPhone : ''} 
                ${customerName && custAddress ? ' / 客戶地址：' + custAddress : ''}
            </td>
        </tr>
        <tr style="height: 10px;"><td colspan="9" style="background-color: #ffffff;"></td></tr>
        <tr>
            <td colspan="9" style="padding: 10px; background-color: #fff7ed; border: 1px solid #fed7aa;">
                <strong style="color: #1e293b;">篩選說明：</strong>
                <span style="color: #64748b; font-size: 12px;">
                    表格已啟用自動篩選功能。請點擊「下單人員」或「服務客戶」欄位的下拉箭頭來篩選數據。
                    ${uniqueContactPersons.length > 0 ? `可用的下單人員：${uniqueContactPersons.join('、')}` : ''}
                    ${uniqueServiceClients.length > 0 ? `可用的服務客戶：${uniqueServiceClients.join('、')}` : ''}
                </span>
            </td>
        </tr>
      `;

      const template = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
            <!--[if gte mso 9]>
            <xml>
            <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                    <x:Name>對帳單明細</x:Name>
                    <x:WorksheetOptions>
                    <x:DisplayGridlines/>
                    </x:WorksheetOptions>
                </x:ExcelWorksheet>
                </x:ExcelWorksheets>
            </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                br {mso-data-placement:same-cell;}
                body { 
                    background-color: #ffffff; 
                    font-family: 'Microsoft JhengHei', 'Noto Sans TC', Arial, sans-serif;
                }
                table { 
                    background-color: #ffffff; 
                    border-collapse: collapse;
                }
                th {
                    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                    color: white;
                    font-weight: bold;
                    padding: 12px 10px;
                    border: 1px solid #ea580c;
                    text-align: center;
                    font-size: 13px;
                }
                td {
                    padding: 10px;
                    border: 1px solid #e2e8f0;
                    font-size: 12px;
                }
                tr:nth-child(even) {
                    background-color: #f8fafc;
                }
                tr:hover {
                    background-color: #fff7ed;
                }
            </style>
        </head>
        <body>
            <table style="font-family: 'Microsoft JhengHei', 微軟正黑體, sans-serif; border-collapse: collapse; width: 100%; background-color: #ffffff;">
                <colgroup>
                    <col style="width: 100px; background-color: #ffffff;" />
                    <col style="width: 140px; background-color: #ffffff;" />
                    <col style="width: 250px; background-color: #ffffff;" />
                    <col style="width: 200px; background-color: #ffffff;" />
                    <col style="width: 200px; background-color: #ffffff;" />
                    <col style="width: 100px; background-color: #ffffff;" />
                    <col style="width: 80px; background-color: #ffffff;" />
                    <col style="width: 120px; background-color: #ffffff;" />
                    <col style="width: 150px; background-color: #ffffff;" />
                </colgroup>
                <thead>
                    ${headerHtml}
                    <tr>
                        <th>日期</th>
                        <th>單號</th>
                        <th>品名</th>
                        <th>規格</th>
                        <th>備註</th>
                        <th>金額</th>
                        <th>狀態</th>
                        <th x:autofilter="all">下單人員</th>
                        <th x:autofilter="all">服務客戶</th>
                    </tr>
                </thead>
                <tbody style="background-color: #ffffff;">
                    ${rowsHtml}
                </tbody>
            </table>
        </body>
        </html>
      `;

       const blob = new Blob([template], { type: 'application/vnd.ms-excel' });
       const link = document.createElement('a');
       link.href = URL.createObjectURL(blob);
       link.download = `${filename}.xls`;
       link.click();
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">儀表板 Dashboard</h1>
          <p className="text-slate-500 mt-1">管理您的客戶對帳單與營收概況</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
            {selectedInvoiceIds.size > 0 && !isBatchSignMode && (
                <>
                    <button 
                        onClick={handleBatchPdfExport}
                        disabled={isExportingBatch}
                        className="flex-1 md:flex-none bg-slate-800 text-white px-5 py-2.5 rounded-lg flex items-center justify-center shadow-lg animate-fadeIn"
                    >
                        {isExportingBatch ? (
                            <span className="flex items-center"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>處理中...</span>
                        ) : (
                            <span className="flex items-center"><Download className="w-4 h-4 mr-2" /> 下載合併 PDF ({selectedInvoiceIds.size})</span>
                        )}
                    </button>
                    {onBatchSign && pendingInvoicesToSign.length > 0 && (
                        <button 
                            onClick={() => setIsBatchSignMode(true)}
                            className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg flex items-center justify-center shadow-lg animate-fadeIn"
                        >
                            <PenTool className="w-4 h-4 mr-2" /> 批量簽收 ({pendingInvoicesToSign.length})
                        </button>
                    )}
                </>
            )}
            <button 
                onClick={onCreateNew}
                className="flex-1 md:flex-none bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg flex items-center justify-center shadow-md shadow-brand-500/20 transition-all font-medium"
            >
                <PlusCircle className="w-5 h-5 mr-2" />
                建立新單據            
                </button>
        </div>
      </div>

      {/* Batch Sign Modal */}
      {isBatchSignMode && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 animate-fadeIn">
                  <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold text-slate-800">批量簽收</h2>
                      <button 
                          onClick={() => {
                              setIsBatchSignMode(false);
                              setBatchSignature(null);
                          }}
                          className="text-slate-400 hover:text-slate-600"
                      >
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="mb-4">
                      <p className="text-sm text-slate-600 mb-2">
                          將為以下 <span className="font-bold text-emerald-600">{pendingInvoicesToSign.length}</span> 筆待簽收單據進行批量簽收：
                      </p>
                      <div className="bg-slate-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                          <ul className="text-sm text-slate-700 space-y-1">
                              {pendingInvoicesToSign.map(inv => (
                                  <li key={inv.id} className="flex items-center gap-2">
                                      <span className="font-mono text-xs">{inv.serialNumber}</span>
                                      <span>-</span>
                                      <span>{inv.customerName}</span>
                                  </li>
                              ))}
                          </ul>
                      </div>
                  </div>

                  <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-700 mb-2">請在下方簽名：</label>
                      <div className="border-2 border-brand-400 border-dashed rounded-xl p-4 bg-brand-50/50">
                          <SignatureCanvas 
                              readOnly={false}
                              onChange={(base64) => setBatchSignature(base64)}
                          />
                      </div>
                  </div>

                  <div className="flex gap-3 justify-end">
                      <button 
                          onClick={() => {
                              setIsBatchSignMode(false);
                              setBatchSignature(null);
                          }}
                          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          onClick={handleBatchSignConfirm}
                          disabled={!batchSignature}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      >
                          <CheckCircle className="w-4 h-4" />
                          確認簽收 ({pendingInvoicesToSign.length} 筆)
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Hidden Print Container for Batch Export */}
      <div className="absolute top-0 left-0 w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
          <div ref={printContainerRef} className="bg-white">
              {invoicesToPrint.map((inv) => (
                  <div key={inv.id} className="invoice-page-break mb-10">
                      <InvoiceSheet 
                        invoice={inv} 
                        existingCustomers={[]} 
                        companySettings={companySettings}
                        isEditing={false} 
                      />
                  </div>
              ))}
        </div>
      </div>

      {/* Main List Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-stone-50/50">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              客戶對帳總表
            </h2>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
            >
              {availableMonths.map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
          <div className="relative w-full md:w-72 group">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-brand-500 transition-colors" />
            <input 
              type="text" 
              placeholder="搜尋客戶、單號或備註..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
            />
          </div>
        </div>

        {/* List Content with Multi-Select */}
        <div className="divide-y divide-slate-100 min-h-[300px]">
            {filteredCustomers.length > 0 ? (
                filteredCustomers.map((cust) => {
                    const isAllSelected = cust.invoices.every(i => selectedInvoiceIds.has(i.id));
                    return (
                        <div key={cust.name} className="group transition-colors bg-white">
                            {/* Customer Header Row */}
                            <div 
                                className={`p-5 flex items-center justify-between transition-all duration-200 ${expandedCustomer === cust.name ? 'bg-brand-50/50 shadow-inner' : 'hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-4">
                                    {/* Batch Select Checkbox */}
                                    <div 
                                        onClick={(e) => { e.stopPropagation(); toggleSelectCustomer(cust.name, cust.invoices); }}
                                        className="cursor-pointer text-slate-400 hover:text-brand-500"
                                    >
                                        {isAllSelected ? <CheckSquare className="w-5 h-5 text-brand-500" /> : <Square className="w-5 h-5" />}
                                    </div>
                                    
                                    <div 
                                        className="flex items-center gap-4 cursor-pointer flex-1"
                                        onClick={() => toggleCustomer(cust.name)}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${expandedCustomer === cust.name ? 'bg-brand-100 text-brand-600 rotate-90' : 'bg-slate-100 text-slate-400'}`}>
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                {cust.name}
                                                <span className="text-xs font-normal bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">
                                                    {cust.invoiceCount} 筆                                                </span>
                                            </h3>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <div className="flex items-center justify-end gap-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const filename = `${cust.name}_對帳單_${selectedMonth}`;
                                                executeExcelExport(cust.invoices, filename, cust.name);
                                            }}
                                            className="text-xs flex items-center bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-50 hover:text-brand-600 transition-colors shadow-sm"
                                            title="匯出此客戶對帳單"
                                        >
                                            <FileText className="w-3 h-3 mr-1" />
                                            匯出報表
                                        </button>
                                        <div className="flex flex-col items-end">
                                    <span className="text-xs text-slate-400 uppercase tracking-wide font-medium mr-2">Total</span>
                                    <span className="text-lg font-bold text-slate-800 font-mono">{formatCurrency(cust.totalAmount)}</span>
                                        </div>
              </div>
                                </div>
                            </div>

                            {/* Expanded Invoices List */}
                            {expandedCustomer === cust.name && (
                                <div className="bg-brand-50/30 p-4 sm:p-6 border-t border-slate-100 animate-slideDown">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-stone-50 text-slate-500 font-medium">
                                                <tr>
                                                    <th className="px-4 py-3 w-10"></th>
                                                    <th className="px-4 py-3 text-left font-medium w-28">單號</th>
                                                    <th className="px-4 py-3 text-left font-medium w-28">日期</th>
                                                    <th className="px-4 py-3 text-left font-medium w-24">下單人員</th>
                                                    <th className="px-4 py-3 text-left font-medium w-24">服務客戶</th>
                                                    {searchTerm && <th className="px-4 py-3 text-left font-medium flex-1">備註/說明</th>}
                                                    <th className="px-4 py-3 text-right font-medium w-24">金額</th>
                                                    <th className="px-4 py-3 text-center font-medium w-24">狀態</th>
                                                    <th className="px-4 py-3 text-center font-medium w-20">動作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {cust.invoices
                                                  .filter(inv => {
                                                    if (!searchTerm) return true;
                                                    const term = searchTerm.toLowerCase();
                                                    return (
                                                      inv.serialNumber.includes(term) ||
                                                      (inv.notes && inv.notes.toLowerCase().includes(term)) ||
                                                      (inv.remarks && inv.remarks.toLowerCase().includes(term)) ||
                                                      inv.items.some(item => item.remark && item.remark.toLowerCase().includes(term))
                                                    );
                                                  })
                                                  .map(inv => {
                                                    // Determine what note to display
                                                    // Priority: Match search term -> Remarks -> Notes -> Item Remarks
                                                    let displayNote = inv.remarks || inv.notes || '';
                                                    let noteSource = inv.remarks ? '備註' : (inv.notes ? '注意事項' : '');
                                                    
                                                    // If searching, prioritize showing the matching content
                                                    if (searchTerm) {
                                                      const term = searchTerm.toLowerCase();
                                                      if (inv.remarks && inv.remarks.toLowerCase().includes(term)) {
                                                        displayNote = inv.remarks;
                                                        noteSource = '備註';
                                                      } else if (inv.notes && inv.notes.toLowerCase().includes(term)) {
                                                        displayNote = inv.notes;
                                                        noteSource = '注意事項';
                                                      } else {
                                                        // Check items
                                                        const matchedItem = inv.items.find(item => item.remark && item.remark.toLowerCase().includes(term));
                                                        if (matchedItem) {
                                                          displayNote = `[${matchedItem.description}] ${matchedItem.remark}`;
                                                          noteSource = '品項備註';
                                                        }
                                                      }
                                                    }
                                                    
                                                    // Highlight search term
                                                    const highlightText = (text: string, term: string) => {
                                                      if (!term || !text) return text;
                                                      const parts = text.split(new RegExp(`(${term})`, 'gi'));
                                                      return parts.map((part, i) => 
                                                        part.toLowerCase() === term.toLowerCase() 
                                                          ? <span key={i} className="bg-yellow-200 text-slate-900 font-bold px-0.5 rounded">{part}</span> 
                                                          : part
                                                      );
                                                    };

                                                    return (
                                                    <tr key={inv.id} className="hover:bg-brand-50/30 transition-colors group/row cursor-pointer" onClick={() => onSelectInvoice(inv)}>
                                                        <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleSelectInvoice(inv.id); }}>
                                                            {selectedInvoiceIds.has(inv.id) ? <CheckSquare className="w-4 h-4 text-brand-500" /> : <Square className="w-4 h-4 text-slate-300" />}
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-slate-600 font-medium text-xs sm:text-sm">{highlightText(inv.serialNumber, searchTerm)}</td>
                                                        <td className="px-4 py-3 text-slate-500 text-xs sm:text-sm">{inv.date}</td>
                                                        <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm">{inv.contactPerson || '-'}</td>
                                                        <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm">{inv.serviceClient || '-'}</td>
                                                        {searchTerm && (
                                                          <td className="px-4 py-3 text-slate-600 text-xs sm:text-sm max-w-xs truncate">
                                                            {displayNote ? (
                                                              <div className="flex flex-col">
                                                                <span className="truncate" title={displayNote}>
                                                                  {searchTerm ? highlightText(displayNote, searchTerm) : displayNote}
                                                                </span>
                                                                {noteSource && <span className="text-[10px] text-slate-400">{noteSource}</span>}
                                                              </div>
                                                            ) : (
                                                              <span className="text-slate-300">-</span>
                                                            )}
                                                          </td>
                                                        )}
                                                        <td className="px-4 py-3 text-right font-medium text-slate-800 text-xs sm:text-sm">{formatCurrency(inv.totalAmount)}</td>
                                                        <td className="px-4 py-3 text-center whitespace-nowrap">
                                                            {inv.status === 'completed' ? (
                                                                <span className="inline-flex items-center text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                                                                    <CheckCircle className="w-3 h-3 mr-1" /> 已簽收
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                                                                    <Clock className="w-3 h-3 mr-1" /> 待簽收
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <button className="text-brand-600 hover:text-brand-800 text-sm font-medium hover:underline opacity-0 group-hover/row:opacity-100 transition-opacity">
                                                            詳情
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    );
                                                  })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            ) : (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                    <Filter className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="font-medium">找不到相關資料</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
