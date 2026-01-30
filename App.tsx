import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Invoice, COMPANY_INFO, Product, Customer, CompanySettings, DEFAULT_COMPANY_INFO, PricingRule, PricingRuleHistory, RevenueTarget } from './types';
import { generateId, generateCustomerSerialNumber } from './utils/helpers';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import InvoiceSheet from './components/InvoiceSheet';
import Login from './components/Login';
import SettingsView from './components/Settings';
import { Settings, ChevronLeft, LogOut, BarChart3 } from 'lucide-react';
import { ToastContainer, Toast } from './components/Toast';
import { registerToastCallback, toast } from './utils/toast';
import { handleError, handleFirestoreError, handleBatchError } from './utils/errorHandler';

// DB Service imports
import { 
  subscribeInvoices, saveInvoice, deleteInvoice, 
  subscribeCustomers, saveCustomer,
  subscribeProducts, saveProduct,
  subscribeCompanySettings, saveCompanySettings,
  subscribeRevenueTargets, saveRevenueTarget,
  subscribePricingRules, savePricingRule,
  subscribePricingHistory, savePricingHistory,
  subscribeAdminSettings, saveAdminSettings, AdminSettings,
  batchSaveProducts,
  batchSaveCustomers,
  batchSavePricingRules,
  batchSaveRevenueTargets,
  logout as firebaseLogout
} from './services/db';

const App: React.FC = () => {
  const [user, setUser] = useState<{ role: 'owner' | 'staff' } | null>(null);
  const [view, setView] = useState<'dashboard' | 'reports' | 'create' | 'view' | 'sign-only' | 'login' | 'settings'>('login');
  
  // Data State
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_INFO);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [pricingHistory, setPricingHistory] = useState<PricingRuleHistory[]>([]);
  const [revenueTargets, setRevenueTargets] = useState<RevenueTarget[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);

  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Register toast callback
  useEffect(() => {
    registerToastCallback((toast) => {
      setToasts((prev) => [...prev, toast]);
    });
  }, []);
  
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // --- Firebase Subscriptions ---
  useEffect(() => {
    // 1. Invoices
    const unsubInvoices = subscribeInvoices((data) => {
      setInvoices(data);
      setIsLoading(false); // At least invoices are loaded
    });

    // 2. Customers
    const unsubCustomers = subscribeCustomers((data) => {
      setCustomers(data);
    });

    // 3. Products
    const unsubProducts = subscribeProducts((data) => {
      setProducts(data);
    });

    // 4. Settings
    const unsubSettings = subscribeCompanySettings((data) => {
      if (data) setCompanySettings(data);
    });

    // 5. Revenue Targets
    const unsubTargets = subscribeRevenueTargets((data) => {
      setRevenueTargets(data);
    });

    // 6. Pricing Rules
    const unsubRules = subscribePricingRules((data) => {
      setPricingRules(data);
    });

    // 7. Pricing History
    const unsubHistory = subscribePricingHistory((data) => {
      setPricingHistory(data);
    });

    // 8. Admin Settings
    const unsubAdmin = subscribeAdminSettings((data) => {
      setAdminSettings(data);
    });

    // Cleanup subscriptions on unmount
    return () => {
      unsubInvoices();
      unsubCustomers();
      unsubProducts();
      unsubSettings();
      unsubTargets();
      unsubRules();
      unsubHistory();
      unsubAdmin();
    };
  }, []);

  // --- Save Handlers (Connect to Firebase) ---

  const handleSaveCompanySettings = async (settings: CompanySettings) => {
    const previousSettings = companySettings;
    try {
      // Optimistic update
      setCompanySettings(settings); 
      await saveCompanySettings(settings);
      toast.success('公司資訊已儲存');
    } catch (error) {
      handleFirestoreError(error, '儲存公司資訊');
      // Revert optimistic update
      setCompanySettings(previousSettings);
    }
  };

  const handleUpdateProducts = async (newProducts: Product[]) => {
    const previousProducts = products;
    setProducts(newProducts); // Optimistic update
    
    try {
      await batchSaveProducts(newProducts);
      toast.success('商品資料已儲存');
    } catch (error) {
      handleBatchError(error, '儲存商品', 0, newProducts.length);
      // Revert optimistic update
      setProducts(previousProducts);
    }
  };

  const handleUpdateCustomers = async (newCustomers: Customer[]) => {
    const previousCustomers = customers;
    setCustomers(newCustomers); // Optimistic update
    
    try {
      await batchSaveCustomers(newCustomers);
      toast.success('客戶資料已儲存');
    } catch (error) {
      handleBatchError(error, '儲存客戶', 0, newCustomers.length);
      // Revert optimistic update
      setCustomers(previousCustomers);
    }
  };

  const handleUpdatePricingRules = async (newRules: PricingRule[]) => {
    const previousRules = pricingRules;
    setPricingRules(newRules); // Optimistic update
    
    try {
      await batchSavePricingRules(newRules);
      toast.success('價格規則已儲存');
    } catch (error) {
      handleBatchError(error, '儲存價格規則', 0, newRules.length);
      // Revert optimistic update
      setPricingRules(previousRules);
    }
  };

  const handleAddPricingHistory = async (history: PricingRuleHistory) => {
    const previousHistory = pricingHistory;
    try {
      setPricingHistory(prev => [history, ...prev]);
      await savePricingHistory(history);
    } catch (error) {
      handleFirestoreError(error, '儲存價格歷史');
      setPricingHistory(previousHistory);
    }
  };

  const handleUpdateRevenueTargets = async (targets: RevenueTarget[]) => {
    const previousTargets = revenueTargets;
    setRevenueTargets(targets); // Optimistic update
    
    try {
      await batchSaveRevenueTargets(targets);
      toast.success('營收目標已儲存');
    } catch (error) {
      handleBatchError(error, '儲存營收目標', 0, targets.length);
      // Revert optimistic update
      setRevenueTargets(previousTargets);
    }
  };

  const handleUpdateAdminSettings = async (settings: AdminSettings) => {
    const previousSettings = adminSettings;
    try {
      setAdminSettings(settings); // Optimistic
      await saveAdminSettings(settings);
      toast.success('管理員設定已儲存');
    } catch (error) {
      handleFirestoreError(error, '儲存管理員設定');
      setAdminSettings(previousSettings);
    }
  };

  // --- Invoice Logic ---

  // Handle URL Routing (Sign Link & Preview)
  useEffect(() => {
      if (isLoading) return;
      const params = new URLSearchParams(window.location.search);
      const signId = params.get('sign');
      const viewParam = params.get('view');


      // Handle sign link
      if (signId) {
          const targetInvoice = invoices.find(i => i.id === signId);
          if (targetInvoice) {
              setCurrentInvoice(targetInvoice);
              setView('sign-only');
          } else {
              if (view === 'sign-only') {
                  toast.error('無效的簽署連結或單據已刪除');
                  window.history.pushState({}, '', window.location.pathname);
                  if (user) setView('dashboard');
                  else setView('login');
              } else {
                  setView('sign-only');
              }
          }
      } else {
          if (view === 'sign-only' && !currentInvoice) {
              if (user) setView('dashboard');
              else setView('login');
          }
      }
  }, [invoices, isLoading, view, user]);

  // Handle view changes and update URL
  useEffect(() => {
      if (view !== 'sign-only' && view !== 'login') {
          // Clear view param for other views
          const params = new URLSearchParams(window.location.search);
          if (params.get('view') === 'preview') {
              params.delete('view');
              const newUrl = params.toString() 
                  ? `${window.location.pathname}?${params.toString()}`
                  : window.location.pathname;
              window.history.replaceState({}, '', newUrl);
          }
      }
  }, [view]);

  // Sync currentInvoice with latest data
  useEffect(() => {
      if (currentInvoice) {
          const freshData = invoices.find(i => i.id === currentInvoice.id);
          if (freshData) {
              setCurrentInvoice(freshData);
          }
      }
  }, [invoices]);

  // Customer Map for InvoiceSheet
  const customerMap = useMemo(() => {
    const map = new Map<string, { address: string, phone: string, taxId?: string, contactPersons: string[] }>();
    
    // Add customers from settings
    customers.forEach(customer => {
      map.set(customer.name, {
        address: customer.address,
        phone: customer.phone,
        taxId: customer.taxId,
        contactPersons: customer.contactPersons || []
      });
    });
    
    // Add from invoices (fallback)
    const sorted = [...invoices].sort((a, b) => a.createdAt - b.createdAt);
    sorted.forEach(inv => {
      if (inv.customerName && !map.has(inv.customerName)) {
        map.set(inv.customerName, {
          address: inv.customerAddress || '',
          phone: inv.customerPhone || '',
          taxId: inv.customerTaxId,
          contactPersons: inv.contactPerson ? [inv.contactPerson] : []
        });
      }
    });
    return map;
  }, [invoices, customers]);

  const customerList = useMemo(() => Array.from(customerMap.keys()).sort(), [customerMap]);

  const handleCreateNew = () => {
    const tempSerial = 'CP0000000000';
    const newInvoice: Invoice = {
      id: generateId(),
      serialNumber: tempSerial,
      customerName: '',
      customerAddress: '',
      customerPhone: '',
      contactPerson: '',
      date: new Date().toISOString().split('T')[0],
      items: [
        { id: generateId(), description: '', specification: '', quantity: 1, unitPrice: 0, amount: 0, remark: '' },
        { id: generateId(), description: '', specification: '', quantity: 1, unitPrice: 0, amount: 0, remark: '' },
        { id: generateId(), description: '', specification: '', quantity: 1, unitPrice: 0, amount: 0, remark: '' },
      ],
      totalAmount: 0,
      signatureBase64: null,
      notes: '本單據經簽收後即視為正式驗收憑證。', 
      createdAt: Date.now(),
      status: 'draft'
    };
    setCurrentInvoice(newInvoice);
    setView('create');
  };

  const handleSaveInvoice = async () => {
    if (!currentInvoice) return;
    
    const status: Invoice['status'] = currentInvoice.status === 'completed' ? 'completed' : 'pending';
    const invoiceToSave = { ...currentInvoice, status };

    try {
        await saveInvoice(invoiceToSave);
        toast.success('對帳單已儲存');
        setView('dashboard');
    } catch (error) {
        handleFirestoreError(error, '儲存對帳單');
    }
  };

  const handleDeleteInvoice = async () => {
    if (!currentInvoice) return;
    
    try {
        await deleteInvoice(currentInvoice.id);
        toast.success('對帳單已刪除');
        setView('dashboard');
    } catch (error) {
        handleFirestoreError(error, '刪除對帳單');
    }
  };

  const handleSignAndComplete = async (signatureBase64: string) => {
      if (!currentInvoice) return;

      const completedInvoice: Invoice = {
          ...currentInvoice,
          signatureBase64,
          status: 'completed'
      };

      try {
          await saveInvoice(completedInvoice);
          setCurrentInvoice(completedInvoice);
          toast.success('簽署成功！');
          if (view === 'sign-only') {
              toast.info('您可以關閉此頁面', 8000);
          }
      } catch (error) {
          handleFirestoreError(error, '簽署對帳單');
      }
  };

  // Batch sign multiple invoices
  const handleBatchSign = async (invoiceIds: string[], signatureBase64: string) => {
      if (invoiceIds.length === 0) return;

      try {
          const invoicesToSign = invoices.filter(inv => invoiceIds.includes(inv.id) && inv.status !== 'completed');
          
          if (invoicesToSign.length === 0) {
              toast.warning('所選單據皆已完成簽收');
              return;
          }

          // Update all invoices with signature
          const updatePromises = invoicesToSign.map(inv => {
              const completedInvoice: Invoice = {
                  ...inv,
                  signatureBase64,
                  status: 'completed'
              };
              return saveInvoice(completedInvoice);
          });

          await Promise.all(updatePromises);
          toast.success(`已成功簽收 ${invoicesToSign.length} 筆單據`);
      } catch (error) {
          handleFirestoreError(error, '批量簽收對帳單');
      }
  };

  const handleUpdateCurrentInvoice = (updated: Invoice) => {
    setCurrentInvoice(updated);
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    setCurrentInvoice(invoice);
    setView('view');
  };

  const handleLogin = (role: 'owner' | 'staff') => {
      setUser({ role });
      setView('dashboard');
  };

  const handleLogout = async () => {
      try {
          await firebaseLogout();
          setUser(null);
          setView('login');
          toast.success('已成功登出');
      } catch (error) {
          handleError(error, '登出失敗');
          // 即使登出失敗，也清除本地狀態
          setUser(null);
          setView('login');
      }
  };

  if (isLoading) {
      return <div className="min-h-screen flex items-center justify-center bg-stone-50 text-brand-600">載入中...</div>;
  }

  if (view === 'login') {
      return <Login onLogin={handleLogin} adminSettings={adminSettings} />;
  }


  // Remote Signing View
  if (view === 'sign-only' && currentInvoice) {
      return (
        <div className="min-h-screen bg-stone-100 py-8 px-4">
            <div className="max-w-[210mm] mx-auto bg-white shadow-xl rounded-xl overflow-hidden">
                <div className="bg-brand-500 text-white p-4 text-center">
                    <h2 className="font-bold text-lg">客戶簽署模式</h2>
                    <p className="text-sm opacity-90">請確認內容無誤後，於下方簽名。</p>
                </div>
                <div className="p-4 md:p-8 overflow-auto">
                    <InvoiceSheet 
                        invoice={currentInvoice}
                        existingCustomers={[]} 
                        products={products}
                        companySettings={companySettings}
                        customers={customers}
                        invoices={invoices}
                        pricingRules={pricingRules}
                        isEditing={false}
                        isRemoteSignMode={true}
                        onSignAndComplete={handleSignAndComplete}
                    />
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-slate-800 flex flex-col">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-brand-100 px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-sm print:hidden h-16">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="h-10 flex items-center justify-center w-10">
              <img 
                src="/logo.png" 
                onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = 'none';
                }}
                alt="Logo" 
                className="h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
                <span className="font-bold text-lg text-slate-800 tracking-tight leading-tight">{companySettings.name}</span>
                <span className="text-xs text-brand-500 font-medium">數位對帳單系統</span>
            </div>
        </div>
        
        <div className="flex items-center gap-4">
           {/* Navigation Links */}
           <div className="flex items-center gap-2 border-r border-slate-100 pr-4 mr-2">
             <button
               onClick={() => setView('dashboard')}
               className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                 view === 'dashboard' ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
               }`}
             >
               客戶對帳總表
             </button>
             <button
               onClick={() => setView('reports')}
               className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                 view === 'reports' ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
               }`}
             >
               <BarChart3 className="w-4 h-4" />
               報表分析
             </button>
           </div>
           
           {isDemoMode && (
               <div className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded border border-amber-200 font-medium hidden sm:block">
                   演示模式
               </div>
           )}
           <div className="text-xs text-slate-400 hidden md:block">
              {new Date().toLocaleDateString()}
           </div>
           
           {/* User Info & Actions */}
           <div className="flex items-center gap-3 pl-3 border-l border-slate-100">
                <div className="flex flex-col items-end mr-1 hidden sm:flex">
                    <span className="text-sm font-bold text-slate-700">{user?.role === 'owner' ? '管理員' : '員工'}</span>
                    <span className="text-xs text-slate-400">已登入</span>
                </div>
                
                {user?.role === 'owner' && (
                    <div 
                      onClick={() => setView('settings')}
                      className="w-8 h-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 cursor-pointer hover:bg-brand-100 transition-colors" 
                      title="設定"
                    >
                        <Settings className="w-4 h-4" />
                    </div>
                )}
                
                <button 
                    onClick={handleLogout}
                    className="flex items-center gap-1 text-slate-500 hover:text-red-600 text-sm font-medium px-2 py-1.5 rounded hover:bg-red-50 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">登出</span>
                </button>
           </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto">
        {view === 'dashboard' && (
          <div className="animate-fadeIn">
            <Dashboard 
              invoices={invoices}
              onCreateNew={handleCreateNew}
              onSelectInvoice={handleSelectInvoice}
              companySettings={companySettings}
              revenueTargets={revenueTargets}
              customers={customers}
              onBatchSign={handleBatchSign}
            />
          </div>
        )}

        {view === 'reports' && (
          <div className="animate-fadeIn">
            <Reports
              invoices={invoices}
              companySettings={companySettings}
              revenueTargets={revenueTargets}
              customers={customers}
              onBack={() => setView('dashboard')}
            />
          </div>
        )}

        {view === 'settings' && user?.role === 'owner' && (
          <div className="animate-fadeIn py-8 px-4">
            <button 
              onClick={() => setView('dashboard')} 
              className="flex items-center text-slate-500 hover:text-brand-600 transition-colors mb-4 font-medium"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              返回儀表板
            </button>
                  <SettingsView 
                    companySettings={companySettings}
                    products={products}
                    customers={customers}
                    invoices={invoices}
                    pricingRules={pricingRules}
                    pricingHistory={pricingHistory}
                    revenueTargets={revenueTargets}
                    adminSettings={adminSettings}
                    onSaveCompanySettings={handleSaveCompanySettings}
                    onUpdateProducts={handleUpdateProducts}
                    onUpdateCustomers={handleUpdateCustomers}
                    onUpdatePricingRules={handleUpdatePricingRules}
                    onAddPricingHistory={handleAddPricingHistory}
                    onUpdateRevenueTargets={handleUpdateRevenueTargets}
                    onUpdateAdminSettings={handleUpdateAdminSettings}
                  />
          </div>
        )}

        {(view === 'create' || view === 'view') && currentInvoice && (
          <div className="flex flex-col h-full bg-stone-50">
             {/* Toolbar */}
             <div className="bg-white/80 backdrop-blur border-b border-brand-100 px-4 md:px-8 py-3 flex items-center justify-between print:hidden sticky top-0 z-40">
               <button 
                  onClick={() => setView('dashboard')} 
                  className="flex items-center text-slate-500 hover:text-brand-600 transition-colors px-3 py-1.5 rounded-md hover:bg-brand-50 text-sm font-medium group"
                >
                 <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform" />
                 返回儀表板
               </button>
               
               <div className="flex items-center gap-2">
                 <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                    {currentInvoice.serialNumber}
                 </span>
                 {view === 'view' && (
                    <button onClick={() => setView('create')} className="text-sm text-brand-600 hover:text-brand-700 font-medium px-3 py-1.5 hover:bg-brand-50 rounded-md transition-colors">
                      {currentInvoice.status === 'completed' ? '修改單據' : '編輯此單據'}
                    </button>
                 )}
               </div>
             </div>

             {/* Document Workspace */}
             <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center print:bg-white print:p-0">
               <InvoiceSheet 
                 invoice={currentInvoice}
                 existingCustomers={customerList} 
                 customerMap={customerMap}
                 products={products}
                 companySettings={companySettings}
                 customers={customers}
                 invoices={invoices}
                 pricingRules={pricingRules}
                 isEditing={view === 'create'}
                 onUpdate={handleUpdateCurrentInvoice}
                 onSave={handleSaveInvoice}
                 onDelete={handleDeleteInvoice}
                 onSignAndComplete={handleSignAndComplete}
                 onCancel={() => setView('dashboard')}
               />
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
