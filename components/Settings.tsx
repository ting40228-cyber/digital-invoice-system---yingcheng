import React, { useState, useEffect } from 'react';
import { CompanySettings, Product, Customer, PricingRule, PricingRuleHistory, RevenueTarget, PricingTier, PriceCategory, CustomerTier } from '../types';
import { AdminSettings } from '../services/db';
import { generateId } from '../utils/helpers';
import { Save, Plus, Trash2, Download, Building, Package, User, DollarSign, ChevronDown, ChevronRight, Ruler, X, History, Copy, Target, Calendar, Layers, Lock, ShieldCheck, Database, Users } from 'lucide-react';
import { createUser, updateUserRole, changePassword } from '../services/db';
import { toast } from '../utils/toast';
import { handleError } from '../utils/errorHandler';
import { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../firebase';

interface SettingsProps {
  companySettings: CompanySettings;
  products: Product[];
  customers: Customer[];
  invoices: any[]; // Used for backup
  pricingRules: PricingRule[];
  pricingHistory: PricingRuleHistory[];
  revenueTargets: RevenueTarget[];
  onSaveCompanySettings: (settings: CompanySettings) => void;
  onUpdateProducts: (products: Product[]) => void;
  onUpdateCustomers: (customers: Customer[]) => void;
  onUpdatePricingRules: (rules: PricingRule[]) => void;
  onAddPricingHistory: (history: PricingRuleHistory) => void;
  onUpdateRevenueTargets: (targets: RevenueTarget[]) => void;
  adminSettings?: AdminSettings | null;
  onUpdateAdminSettings?: (settings: AdminSettings) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  companySettings, 
  products, 
  customers, 
  invoices,
  pricingRules,
  pricingHistory,
  revenueTargets,
  onSaveCompanySettings, 
  onUpdateProducts, 
  onUpdateCustomers, 
  onUpdatePricingRules,
  onAddPricingHistory,
  onUpdateRevenueTargets,
  adminSettings,
  onUpdateAdminSettings
}) => {
  const [activeTab, setActiveTab] = useState<'company' | 'products' | 'customers' | 'pricing' | 'targets' | 'backup' | 'security'>('company');
  
  // Local state for editing
  const [localCompany, setLocalCompany] = useState<CompanySettings>(companySettings);
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers);
  
  // UI State for expansion
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const toggleProductExpansion = (productId: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const toggleCustomerExpansion = (customerId: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customerId)) {
      newExpanded.delete(customerId);
    } else {
      newExpanded.add(customerId);
    }
    setExpandedCustomers(newExpanded);
  };
  
  // State for new size option input per product (stored in a map by product ID)
  const [newSizeOptionInputs, setNewSizeOptionInputs] = useState<Record<string, string>>({});
  
  // Pricing Management State
  const [localPricingRules, setLocalPricingRules] = useState<PricingRule[]>(pricingRules);
  const [pricingSubTab, setPricingSubTab] = useState<'categories' | 'customers' | 'history'>('categories');
  const [selectedCustomerForPricing, setSelectedCustomerForPricing] = useState<string | null>(null);
  const [expandedPriceRule, setExpandedPriceRule] = useState<string | null>(null);

  // Revenue Targets State
  const [localRevenueTargets, setLocalRevenueTargets] = useState<RevenueTarget[]>(revenueTargets);

  // Security State
  const [ownerPassword, setOwnerPassword] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [staffEmail, setStaffEmail] = useState('');

  // Sync with props and migrate old data format
  useEffect(() => { setLocalCompany(companySettings); }, [companySettings]);
  useEffect(() => { setLocalProducts(products); }, [products]);
  useEffect(() => { setLocalPricingRules(pricingRules); }, [pricingRules]);
  useEffect(() => { setLocalRevenueTargets(revenueTargets); }, [revenueTargets]);
  useEffect(() => {
    if (adminSettings?.owner?.email) setOwnerEmail(adminSettings.owner.email);
    if (adminSettings?.staff?.email) setStaffEmail(adminSettings.staff.email);
  }, [adminSettings]);
  useEffect(() => { 
    // Migrate old customer format (contactPerson -> contactPersons, priceCategory -> customerTier)
    const migratedCustomers = customers.map((c: any) => {
      const migrated: any = {
        ...c,
        contactPersons: Array.isArray(c.contactPersons) 
          ? c.contactPersons 
          : (c.contactPerson ? [c.contactPerson] : []),
        // Migrate priceCategory to customerTier, but keep priceCategory for backward compatibility
        // Convert old priceCategory values: 'industry' -> 'industry', others -> 'general'
        customerTier: c.customerTier || (c.priceCategory === 'industry' ? 'industry' : 'general'),
        priceCategory: c.priceCategory || undefined // Keep for backward compatibility
      };
      return migrated as Customer;
    });
    setLocalCustomers(migratedCustomers);
  }, [customers]);

  const handleCompanySave = () => {
    onSaveCompanySettings(localCompany);
    // Toast 通知由 App.tsx 的 handleSaveCompanySettings 處理
  };

  // --- Product Logic ---
  const addProduct = () => {
    setLocalProducts([...localProducts, { id: generateId(), name: '', category: '', specification: '', price: 0, sizeOptions: [] }]);
  };

  const addSizeOption = (productId: string, sizeOption: string) => {
    if (!sizeOption.trim()) return;
    setLocalProducts(localProducts.map(p => 
      p.id === productId 
        ? { ...p, sizeOptions: [...(p.sizeOptions || []), sizeOption.trim()] }
        : p
    ));
  };

  const removeSizeOption = (productId: string, index: number) => {
    setLocalProducts(localProducts.map(p => 
      p.id === productId 
        ? { ...p, sizeOptions: (p.sizeOptions || []).filter((_, i) => i !== index) }
        : p
    ));
  };

  const updateProduct = (id: string, field: keyof Product, value: any) => {
    setLocalProducts(localProducts.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const removeProduct = (id: string) => {
    setLocalProducts(localProducts.filter(p => p.id !== id));
  };

  const saveProducts = () => {
    onUpdateProducts(localProducts);
    // Toast 通知由 App.tsx 的 handleUpdateProducts 處理
  };

  // --- Customer Logic ---
  const addCustomer = () => {
    setLocalCustomers([...localCustomers, { 
      id: generateId(), 
      name: '', 
      address: '', 
      phone: '', 
      taxId: '',
      contactPersons: [], 
      startSerialNumber: undefined,
      customerTier: 'general' // Default to general tier
    }]);
  };

  const addContactPerson = (customerId: string, personName: string) => {
    if (!personName.trim()) return;
    setLocalCustomers(localCustomers.map(c => 
      c.id === customerId 
        ? { ...c, contactPersons: [...c.contactPersons, personName.trim()] }
        : c
    ));
  };

  const removeContactPerson = (customerId: string, index: number) => {
    setLocalCustomers(localCustomers.map(c => 
      c.id === customerId 
        ? { ...c, contactPersons: c.contactPersons.filter((_, i) => i !== index) }
        : c
    ));
  };

  const updateCustomer = (id: string, field: keyof Customer, value: any) => {
    setLocalCustomers(prev => prev.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const removeCustomer = (id: string) => {
    setLocalCustomers(localCustomers.filter(c => c.id !== id));
  };

  const saveCustomers = () => {
    onUpdateCustomers(localCustomers);
    // Toast 通知由 App.tsx 的 handleUpdateCustomers 處理
  };

  // --- Pricing Rule Logic ---
  const getPriceCategories = (): PriceCategory[] => {
    const categories = new Set<PriceCategory>();
    localPricingRules.forEach(rule => {
      if (rule.priceCategory) categories.add(rule.priceCategory);
    });
    return Array.from(categories);
  };

  const addPricingRule = (productId: string, customerId?: string, priceCategory?: PriceCategory, specification?: string) => {
    const newRule: PricingRule = {
      id: generateId(),
      productId,
      customerId,
      priceCategory,
      specification,
      basePrice: products.find(p => p.id === productId)?.price || 0,
      tiers: [],
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setLocalPricingRules([...localPricingRules, newRule]);
  };

  const updatePricingRule = (id: string, field: keyof PricingRule, value: any) => {
    setLocalPricingRules(localPricingRules.map(rule => 
      rule.id === id ? { ...rule, [field]: value, updatedAt: Date.now() } : rule
    ));
  };

  const addPricingTier = (ruleId: string) => {
    const rule = localPricingRules.find(r => r.id === ruleId);
    if (!rule) return;
    if (rule.tiers.length >= 5) {
      toast.warning('階梯數量最多5階');
      return;
    }
    const maxMinQty = rule.tiers.length > 0 
      ? Math.max(...rule.tiers.map(t => t.maxQuantity || t.minQuantity))
      : 0;
    const newTier: PricingTier = {
      id: generateId(),
      minQuantity: maxMinQty + 1,
      maxQuantity: undefined,
      price: rule.basePrice
    };
    updatePricingRule(ruleId, 'tiers', [...rule.tiers, newTier]);
  };

  const updatePricingTier = (ruleId: string, tierIndex: number, field: keyof PricingTier, value: any) => {
    const rule = localPricingRules.find(r => r.id === ruleId);
    if (!rule) return;
    const newTiers = rule.tiers.map((tier, idx) => 
      idx === tierIndex ? { ...tier, [field]: value } : tier
    );
    updatePricingRule(ruleId, 'tiers', newTiers);
  };

  const removePricingTier = (ruleId: string, tierIndex: number) => {
    const rule = localPricingRules.find(r => r.id === ruleId);
    if (!rule) return;
    const newTiers = rule.tiers.filter((_, idx) => idx !== tierIndex);
    updatePricingRule(ruleId, 'tiers', newTiers);
  };

  const removePricingRule = (id: string) => {
    setLocalPricingRules(localPricingRules.filter(r => r.id !== id));
  };

  const copyPricingRule = (sourceRuleId: string, targetProductId: string, targetCustomerId?: string, targetPriceCategory?: PriceCategory, targetSpecification?: string) => {
    const sourceRule = localPricingRules.find(r => r.id === sourceRuleId);
    if (!sourceRule) return;
    
    const newRule: PricingRule = {
      id: generateId(),
      productId: targetProductId,
      customerId: targetCustomerId,
      priceCategory: targetPriceCategory,
      specification: targetSpecification,
      basePrice: sourceRule.basePrice,
      tiers: sourceRule.tiers.map(t => ({ ...t })),
      isActive: sourceRule.isActive,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setLocalPricingRules([...localPricingRules, newRule]);
    toast.success('價格規則已複製');
  };

  const savePricingRules = () => {
    onUpdatePricingRules(localPricingRules);
    // Toast 通知由 App.tsx 的 handleUpdatePricingRules 處理
  };

  // --- Revenue Targets Logic ---
  const [selectedCustomerForTarget, setSelectedCustomerForTarget] = useState<string>(''); // 用於選擇客戶以輸入歷史數據
  const [expandedHistoryCustomers, setExpandedHistoryCustomers] = useState<Set<string>>(new Set()); // 用於控制客戶歷史數據的展開/收合

  const toggleHistoryExpansion = (customerId: string) => {
    const newExpanded = new Set(expandedHistoryCustomers);
    if (newExpanded.has(customerId)) {
      newExpanded.delete(customerId);
    } else {
      newExpanded.add(customerId);
    }
    setExpandedHistoryCustomers(newExpanded);
  };
  
  const addRevenueTarget = (year: number, quarter?: number, month?: number, customerId?: string) => {
    // Check for duplicates
    const exists = localRevenueTargets.some(t => 
      t.year === year && 
      t.quarter === quarter && 
      t.month === month && 
      t.customerId === customerId
    );

    if (exists) {
      toast.warning(`${year}年 ${month ? `${month}月` : (quarter ? `Q${quarter}` : '年度')} 的資料已存在，請直接修改現有欄位即可。`);
      return;
    }

    const newTarget: RevenueTarget = {
      id: generateId(),
      year,
      quarter,
      month,
      customerId,
      targetAmount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setLocalRevenueTargets(prev => [...prev, newTarget]);
  };

  // 批量新增函數 (解決一次只能新增一筆的問題)
  const batchAddRevenueTargets = (targets: Omit<RevenueTarget, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    const newTargets = targets.map(t => ({
      ...t,
      id: generateId(),
      targetAmount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));
    setLocalRevenueTargets(prev => [...prev, ...newTargets]);
  };

  const updateRevenueTarget = (id: string, field: keyof RevenueTarget, value: any) => {
    setLocalRevenueTargets(localRevenueTargets.map(target => 
      target.id === id ? { ...target, [field]: value, updatedAt: Date.now() } : target
    ));
  };

  const removeRevenueTarget = (id: string) => {
    setLocalRevenueTargets(localRevenueTargets.filter(target => target.id !== id));
  };

  const saveRevenueTargets = () => {
    onUpdateRevenueTargets(localRevenueTargets);
    // Toast 通知由 App.tsx 的 handleUpdateRevenueTargets 處理
  };

  // --- Backup Logic ---
  const handleBackup = () => {
    const data = {
      timestamp: new Date().toISOString(),
      companySettings,
      products,
      customers,
      pricingRules,
      pricingHistory,
      invoices
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  // --- Security Logic ---
  const handleUpdateAccount = async (role: 'owner' | 'staff', email: string, password: string) => {
    if (!email.trim()) {
      toast.warning('Email 不能為空');
      return;
    }
    
    try {
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        toast.error('請先登入');
        return;
      }
      
      // 如果提供了新密碼，更新密碼
      if (password && password.trim().length > 0) {
        if (password.length < 6) {
          toast.warning('密碼長度至少需要6個字元');
          return;
        }
        await changePassword(currentUser, password);
        toast.success('密碼已更新');
      }
      
      // 更新角色（如果郵件改變，需要創建新用戶）
      // 注意：Firebase Auth 不允許直接更改郵件，需要重新創建
      // 這裡我們只更新 Firestore 中的角色記錄
      const existingEmail = role === 'owner' ? ownerEmail : staffEmail;
      if (email !== existingEmail) {
        // 嘗試創建新用戶或更新角色
        try {
          await createUser(email, password || 'temp123456', role);
          toast.success(`${role === 'owner' ? '管理員' : '員工'}帳號已創建`);
        } catch (error: any) {
          if (error.code === 'auth/email-already-in-use') {
            // 用戶已存在，只更新角色
            await updateUserRole(email, role);
            toast.success(`${role === 'owner' ? '管理員' : '員工'}角色已更新`);
          } else {
            throw error;
          }
        }
      } else {
        // 只更新角色
        await updateUserRole(email, role);
        toast.success(`${role === 'owner' ? '管理員' : '員工'}角色已更新`);
      }
      
      // 更新本地狀態
      if (role === 'owner') {
        setOwnerEmail(email);
        setOwnerPassword('');
      } else {
        setStaffEmail(email);
        setStaffPassword('');
      }
      
      // 更新 AdminSettings（僅儲存郵件）
      if (onUpdateAdminSettings) {
        await onUpdateAdminSettings({
          ownerEmail: role === 'owner' ? email : adminSettings?.ownerEmail,
          staffEmail: role === 'staff' ? email : adminSettings?.staffEmail,
        });
      }
    } catch (error) {
      handleError(error, '更新帳號失敗');
    }
  };

  // Price category labels
  const getPriceCategoryLabel = (category?: PriceCategory): string => {
    if (!category) return '通用';
    const labels: Partial<Record<PriceCategory, string>> = {
      'wholesale': '批發價',
      'retail': '零售價',
      'industry': '同業價',
      'vip': 'VIP價',
      'custom': '自訂',
      'default': '預設價格',
      '': '通用'
    };
    return labels[category] || category;
  };

  // Helper function to render a pricing rule card
  const renderPricingRuleCard = (
    rule: PricingRule | undefined,
    key: string,
    title: string,
    onAdd: () => void,
    category?: PriceCategory,
    specification?: string,
    isCustomerSpecific: boolean = false
  ) => {
    const isExpanded = expandedPriceRule === key;
    return (
      <div key={key} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpandedPriceRule(isExpanded ? null : key)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <h3 className="font-semibold text-slate-800">{title}</h3>
            {!rule && <span className="text-xs text-slate-400">（未設定）</span>}
          </div>
          {!rule && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              className="text-sm text-brand-600 hover:text-brand-700 flex items-center"
            >
              <Plus className="w-3 h-3 mr-1" /> 新增規則
            </button>
          )}
        </div>

        {rule && isExpanded && (
          <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
            {specification !== undefined && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">規格/尺寸</label>
                <input
                  type="text"
                  value={rule.specification || ''}
                  onChange={(e) => updatePricingRule(rule.id, 'specification', e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                  placeholder="規格說明"
                  disabled={true}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">基準價格</label>
                <input
                  type="number"
                  value={rule.basePrice}
                  onChange={(e) => updatePricingRule(rule.id, 'basePrice', Number(e.target.value))}
                  className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={(e) => updatePricingRule(rule.id, 'isActive', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">啟用此規則</span>
                </label>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <label className="block text-xs font-medium text-slate-600 mb-2">數量階梯價格</label>
              <div className="space-y-2">
                {rule.tiers.map((tier, idx) => (
                  <div key={tier.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded">
                    <input
                      type="number"
                      value={tier.minQuantity}
                      onChange={(e) => updatePricingTier(rule.id, idx, 'minQuantity', Number(e.target.value))}
                      className="w-20 p-1 border border-slate-200 rounded text-sm text-center"
                      placeholder="Min"
                    />
                    <span className="text-xs text-slate-500">~</span>
                    <input
                      type="number"
                      value={tier.maxQuantity || ''}
                      onChange={(e) => updatePricingTier(rule.id, idx, 'maxQuantity', e.target.value ? Number(e.target.value) : undefined)}
                      className="w-20 p-1 border border-slate-200 rounded text-sm text-center"
                      placeholder="∞"
                    />
                    <span className="text-xs text-slate-500">數量</span>
                    <span className="text-xs text-slate-500">=</span>
                    <input
                      type="number"
                      value={tier.price}
                      onChange={(e) => updatePricingTier(rule.id, idx, 'price', Number(e.target.value))}
                      className="flex-1 p-1 border border-slate-200 rounded text-sm"
                      placeholder="單價"
                    />
                    <button
                      onClick={() => removePricingTier(rule.id, idx)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {rule.tiers.length < 5 && (
                  <button
                    onClick={() => addPricingTier(rule.id)}
                    className="text-xs text-brand-600 hover:text-brand-700 flex items-center mt-2"
                  >
                    <Plus className="w-3 h-3 mr-1" /> 新增階梯
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-4">
              {!isCustomerSpecific && (
                <button
                  onClick={() => {
                    const targetProduct = prompt('請輸入目標商品ID (開發測試用)');
                    if (targetProduct) copyPricingRule(rule.id, targetProduct);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
                >
                  <Copy className="w-3 h-3 mr-1" /> 複製到其他商品
                </button>
              )}
              <button
                onClick={() => removePricingRule(rule.id)}
                className="text-sm text-red-500 hover:text-red-700 flex items-center"
              >
                <Trash2 className="w-3 h-3 mr-1" /> 刪除規則
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-xl shadow-sm min-h-[80vh]">
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center">
        <Database className="w-6 h-6 mr-2 text-brand-500" />
        系統設定 System Settings
      </h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full md:w-64 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('company')}
            className={`flex items-center px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'company' ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Building className="w-5 h-5 mr-3" /> 公司資訊
          </button>
          <button 
            onClick={() => setActiveTab('products')}
            className={`flex items-center px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'products' ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Package className="w-5 h-5 mr-3" /> 商品管理
          </button>
          <button 
            onClick={() => setActiveTab('customers')}
            className={`flex items-center px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'customers' ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Users className="w-5 h-5 mr-3" /> 客戶管理
          </button>
          <button 
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'pricing' ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <DollarSign className="w-5 h-5 mr-3" /> 客戶價格
          </button>
          <button 
            onClick={() => setActiveTab('targets')}
            className={`flex items-center px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'targets' ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Target className="w-5 h-5 mr-3" /> 營收目標管理
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`flex items-center px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'security' ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <ShieldCheck className="w-5 h-5 mr-3" /> 帳號安全
          </button>
          <button 
            onClick={() => setActiveTab('backup')}
            className={`flex items-center px-4 py-3 rounded-lg text-left font-medium transition-colors ${activeTab === 'backup' ? 'bg-brand-50 text-brand-600 border border-brand-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Download className="w-5 h-5 mr-3" /> 資料備份
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 bg-stone-50 rounded-xl p-6 border border-slate-200">
          
          {/* Company Settings */}
          {activeTab === 'company' && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className="text-xl font-bold text-slate-800">公司基本資訊</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">公司名稱</label>
                  <input 
                    type="text" 
                    value={localCompany.name}
                    onChange={(e) => setLocalCompany({...localCompany, name: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">電話</label>
                  <input 
                    type="text" 
                    value={localCompany.phone}
                    onChange={(e) => setLocalCompany({...localCompany, phone: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">地址</label>
                  <input 
                    type="text" 
                    value={localCompany.address}
                    onChange={(e) => setLocalCompany({...localCompany, address: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                </div>
                <button 
                  onClick={handleCompanySave}
                  className="flex items-center px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 shadow-sm"
                >
                  <Save className="w-4 h-4 mr-2" /> 儲存變更
                </button>
              </div>
            </div>
          )}

          {/* Products */}
          {activeTab === 'products' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">商品資料庫</h2>
                <button onClick={saveProducts} className="flex items-center text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors">
                    <Save className="w-4 h-4 mr-1" /> 儲存
                </button>
              </div>
              
              <div className="space-y-4">
                {localProducts.map(p => {
                  const isExpanded = expandedProducts.has(p.id);
                  return (
                    <div key={p.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                      <div 
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => toggleProductExpansion(p.id)}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                          <div>
                            <h3 className="font-semibold text-slate-800">{p.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                              <span className="bg-slate-100 px-2 py-0.5 rounded">{p.category || '未分類'}</span>
                              <span>NT$ {p.price}</span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProduct(p.id);
                          }}
                          className="text-slate-400 hover:text-red-500 p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/30 animate-fadeIn">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">品項名稱</label>
                              <input 
                                value={p.name}
                                onChange={(e) => updateProduct(p.id, 'name', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="例如：大圖輸出"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">分類</label>
                              <input 
                                value={p.category || ''}
                                onChange={(e) => updateProduct(p.id, 'category', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="例如：印刷"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">預設規格</label>
                              <input 
                                value={p.specification || ''}
                                onChange={(e) => updateProduct(p.id, 'specification', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="例如：A4"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">基準單價</label>
                              <input 
                                type="number"
                                value={p.price}
                                onChange={(e) => updateProduct(p.id, 'price', Number(e.target.value))}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="0"
                              />
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-200 pt-4">
                            <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center">
                              <Ruler className="w-4 h-4 mr-1" />
                              尺寸選項 ({(p.sizeOptions || []).length})
                            </label>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {(p.sizeOptions || []).map((size, index) => (
                                <span 
                                  key={index}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-sm border border-slate-200"
                                >
                                  {size}
                                  <button
                                    onClick={() => removeSizeOption(p.id, index)}
                                    className="text-slate-500 hover:text-red-600 ml-1"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                              {(!p.sizeOptions || p.sizeOptions.length === 0) && (
                                <span className="text-sm text-slate-400 italic">尚未新增尺寸選項</span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                value={newSizeOptionInputs[p.id] || ''}
                                onChange={(e) => setNewSizeOptionInputs({ ...newSizeOptionInputs, [p.id]: e.target.value })}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const inputValue = newSizeOptionInputs[p.id] || '';
                                    if (inputValue.trim()) {
                                      addSizeOption(p.id, inputValue);
                                      setNewSizeOptionInputs({ ...newSizeOptionInputs, [p.id]: '' });
                                    }
                                  }
                                }}
                                className="flex-1 p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="輸入尺寸後按 Enter 或點擊新增"
                              />
                              <button
                                onClick={() => {
                                  const inputValue = newSizeOptionInputs[p.id] || '';
                                  if (inputValue.trim()) {
                                    addSizeOption(p.id, inputValue);
                                    setNewSizeOptionInputs({ ...newSizeOptionInputs, [p.id]: '' });
                                  }
                                }}
                                className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 text-sm font-medium flex items-center"
                              >
                                <Plus className="w-4 h-4 mr-1" /> 新增
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button 
                onClick={addProduct}
                className="flex items-center text-slate-500 hover:text-brand-600 font-medium"
              >
                <Plus className="w-4 h-4 mr-1" /> 新增商品
              </button>
            </div>
          )}

          {/* Customers */}
          {activeTab === 'customers' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">客戶資料庫</h2>
                <button onClick={saveCustomers} className="flex items-center text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors">
                    <Save className="w-4 h-4 mr-1" /> 儲存
                </button>
              </div>
              
              <div className="space-y-4">
                {localCustomers.map(c => {
                  const isExpanded = expandedCustomers.has(c.id);
                  return (
                    <div key={c.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                      <div 
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => toggleCustomerExpansion(c.id)}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                          <div>
                            <h3 className="font-semibold text-slate-800">{c.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                              <span className={`px-2 py-0.5 rounded ${
                                (c.customerTier || c.priceCategory || 'general') === 'industry' ? 'bg-indigo-50 text-indigo-700' : 
                                (c.customerTier || c.priceCategory || 'general') === 'kangshiting' ? 'bg-purple-50 text-purple-700' : 
                                'bg-slate-100'
                              }`}>
                                {(c.customerTier || c.priceCategory || 'general') === 'industry' ? '同業' : 
                                 (c.customerTier || c.priceCategory || 'general') === 'kangshiting' ? '康士藤' : 
                                 '一般'}
                              </span>
                              <span>{c.taxId ? `統編:${c.taxId}` : '無統編'}</span>
                              <span className="text-slate-300">|</span>
                              <span>{c.phone || '無電話'}</span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomer(c.id);
                          }}
                          className="text-slate-400 hover:text-red-500 p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/30 animate-fadeIn">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">客戶名稱</label>
                              <input 
                                value={c.name}
                                onChange={(e) => updateCustomer(c.id, 'name', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="公司名稱"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">統一編號</label>
                              <input 
                                value={c.taxId || ''}
                                onChange={(e) => updateCustomer(c.id, 'taxId', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm font-mono"
                                placeholder="8碼統編"
                                maxLength={8}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">電話</label>
                              <input 
                                value={c.phone}
                                onChange={(e) => updateCustomer(c.id, 'phone', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="電話"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">地址</label>
                              <input 
                                value={c.address}
                                onChange={(e) => updateCustomer(c.id, 'address', e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                                placeholder="地址"
                              />
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-200 pt-4 mb-4">
                            <div className="mb-3">
                              <label className="block text-xs font-medium text-slate-600 mb-1">顧客分級</label>
                              <select
                                value={(c.customerTier || c.priceCategory || 'general') === 'industry' ? 'industry' : (c.customerTier || c.priceCategory || 'general') === 'kangshiting' ? 'kangshiting' : 'general'}
                                onChange={(e) => {
                                  const value = e.target.value as CustomerTier;
                                  // Save customerTier: 'general' can be undefined (default), others must be saved
                                  updateCustomer(c.id, 'customerTier', value === 'general' ? undefined : value);
                                  // Also update priceCategory for backward compatibility
                                  updateCustomer(c.id, 'priceCategory', value === 'general' ? undefined : value);
                                }}
                                className="w-full p-2 border border-slate-200 rounded focus:border-brand-500 text-sm"
                              >
                                <option value="general">一般</option>
                                <option value="industry">同業</option>
                                <option value="kangshiting">康士藤</option>
                              </select>
                              <p className="text-xs text-slate-400 mt-1">顧客分級將影響流水編號前綴（一般：CP / 同業：TC / 康士藤：CP）</p>
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-200 pt-4">
                            <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center">
                              <Users className="w-4 h-4 mr-1" />
                              下單人員歷史記錄 ({c.contactPersons.length})
                            </label>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
                              <p className="text-xs text-slate-600 mb-2">
                                <strong>說明：</strong>下單人員現在可以直接在對帳單中輸入，系統會自動儲存。此處僅顯示歷史記錄，供參考使用。
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {c.contactPersons.map((person, index) => (
                                <span 
                                  key={index}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-sm border border-slate-200"
                                >
                                  {person}
                                  <button
                                    onClick={() => removeContactPerson(c.id, index)}
                                    className="text-slate-500 hover:text-red-600 ml-1"
                                    title="刪除此歷史記錄"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                              {c.contactPersons.length === 0 && (
                                <span className="text-sm text-slate-400 italic">尚無下單人員歷史記錄</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button 
                onClick={addCustomer}
                className="flex items-center text-slate-500 hover:text-brand-600 font-medium"
              >
                <Plus className="w-4 h-4 mr-1" /> 新增客戶
              </button>
            </div>
          )}

          {/* Customer Pricing Management */}
          {activeTab === 'pricing' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">客戶價格管理</h2>
                <button onClick={savePricingRules} className="flex items-center text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors">
                  <Save className="w-4 h-4 mr-1" /> 儲存
                </button>
              </div>

              {/* Pricing Sub-tabs */}
              <div className="flex gap-2 border-b border-slate-200">
                <button
                  onClick={() => setPricingSubTab('customers')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    pricingSubTab === 'customers' 
                      ? 'border-brand-500 text-brand-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <User className="w-4 h-4 inline mr-1" /> 客戶價格規則
                </button>
                <button
                  onClick={() => setPricingSubTab('history')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    pricingSubTab === 'history' 
                      ? 'border-brand-500 text-brand-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <History className="w-4 h-4 inline mr-1" /> 價格歷史
                </button>
              </div>

              {/* Customer Pricing */}
              {pricingSubTab === 'customers' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-600">為特定客戶設定專屬價格規則</p>
                    <select
                      value={selectedCustomerForPricing || ''}
                      onChange={(e) => setSelectedCustomerForPricing(e.target.value || null)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="">選擇客戶...</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedCustomerForPricing ? (
                    <div className="space-y-4">
                      {products.map(product => {
                        const sizeOptions = product.sizeOptions || [];
                        const customerRules = localPricingRules.filter(r => 
                          r.productId === product.id && 
                          r.customerId === selectedCustomerForPricing
                        );
                        
                        // Get general rule (no specification)
                        const generalRule = customerRules.find(r => !r.specification);
                        
                        // Get size-specific rules
                        const sizeRules = customerRules.filter(r => r.specification);

                        return (
                          <div key={product.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-semibold text-slate-800">{product.name}</h3>
                              {!generalRule && sizeRules.length === 0 && (
                                <button
                                  onClick={() => addPricingRule(product.id, selectedCustomerForPricing)}
                                  className="text-sm text-brand-600 hover:text-brand-700 flex items-center"
                                >
                                  <Plus className="w-3 h-3 mr-1" /> 新增通用規則
                                </button>
                              )}
                            </div>

                            {/* General Rule (No Specification) */}
                            {renderPricingRuleCard(
                              generalRule,
                              `${selectedCustomerForPricing}-${product.id}-general`,
                              '通用價格規則（所有尺寸）',
                              () => addPricingRule(product.id, selectedCustomerForPricing),
                              undefined,
                              undefined,
                              true // isCustomerSpecific
                            )}

                            {/* Size-Specific Rules */}
                            {sizeOptions.length > 0 && (
                              <div className="mt-4 border-t border-slate-200 pt-4">
                                <div className="flex items-center justify-between mb-3">
                                  <label className="block text-sm font-medium text-slate-700 flex items-center">
                                    <Ruler className="w-4 h-4 mr-1" />
                                    尺寸專屬價格規則
                                  </label>
                                  <button
                                    onClick={() => {
                                      // Show a prompt to select size
                                      const size = prompt('請輸入尺寸名稱：');
                                      if (size && size.trim()) {
                                        addPricingRule(product.id, selectedCustomerForPricing, undefined, size.trim());
                                      }
                                    }}
                                    className="text-xs text-brand-600 hover:text-brand-700 flex items-center"
                                  >
                                    <Plus className="w-3 h-3 mr-1" /> 新增尺寸規則
                                  </button>
                                </div>
                                
                                {sizeRules.length === 0 ? (
                                  <div className="text-sm text-slate-400 italic p-3 bg-slate-50 rounded">
                                    尚未設定尺寸專屬價格規則
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {sizeRules.map(rule => (
                                      <div key={rule.id}>
                                        {renderPricingRuleCard(
                                          rule,
                                          `${selectedCustomerForPricing}-${product.id}-${rule.specification}`,
                                          `尺寸：${rule.specification}`,
                                          () => addPricingRule(product.id, selectedCustomerForPricing, undefined, rule.specification),
                                          undefined,
                                          rule.specification,
                                          true // isCustomerSpecific
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>請先選擇客戶以查看或設定專屬價格規則</p>
                    </div>
                  )}
                </div>
              )}

              {/* Pricing History */}
              {pricingSubTab === 'history' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-semibold text-slate-800">價格變更記錄</h3>
                      <span className="text-xs text-slate-500">
                        一般記錄保留 1-2 年，重要記錄長期保存
                      </span>
                    </div>
                    {pricingHistory.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>尚無價格變更記錄</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {pricingHistory.map(history => (
                          <div 
                            key={history.id} 
                            className={`p-3 rounded-lg border ${
                              history.isImportant 
                                ? 'bg-amber-50 border-amber-200' 
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                {history.isImportant && (
                                  <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded font-medium">
                                    重要
                                  </span>
                                )}
                                <span className="text-xs text-slate-500">
                                  {new Date(history.timestamp).toLocaleString('zh-TW')}
                                </span>
                              </div>
                            </div>
                            <div className="text-sm text-slate-700">
                              <p>商品：{products.find(p => {
                                const rule = localPricingRules.find(r => r.id === history.pricingRuleId);
                                return rule && p.id === rule.productId;
                              })?.name || '未知商品'}</p>
                              {history.reason && (
                                <p className="text-xs text-slate-500 mt-1">原因：{history.reason}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Revenue Targets */}
          {activeTab === 'targets' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">營收目標管理</h2>
                <button onClick={saveRevenueTargets} className="flex items-center text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors">
                  <Save className="w-4 h-4 mr-1" /> 儲存
                </button>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-emerald-800">
                  <strong>說明：</strong>此功能僅用於輸入去年的歷史數據。您可以輸入年度數據或每個月份的實際營收，也可選擇特定客戶輸入該客戶的歷史數據。這些數據將用於年報表中與今年數據進行比較。
                </p>
              </div>

              {/* Year Selection for Adding Historical Data (Last Year Only) */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">新增去年歷史數據</h3>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                    {new Date().getFullYear() - 1}年
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-600 mb-2">月份（選填，留空為年度數據）</label>
                      <select
                        id="target-month-select"
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                        defaultValue=""
                      >
                        <option value="">年度數據</option>
                        {Array.from({ length: 12 }, (_, i) => {
                          const month = i + 1;
                          return <option key={month} value={month}>{month}月</option>;
                        })}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-600 mb-2">客戶（選填，用於記錄特定客戶的歷史數據）</label>
                      <select
                        value={selectedCustomerForTarget}
                        onChange={(e) => setSelectedCustomerForTarget(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                      >
                        <option value="">全公司</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => {
                        const monthSelect = document.getElementById('target-month-select') as HTMLSelectElement;
                        const lastYear = new Date().getFullYear() - 1;
                        const month = monthSelect.value ? parseInt(monthSelect.value, 10) : undefined;
                        addRevenueTarget(lastYear, undefined, month, selectedCustomerForTarget || undefined);
                        monthSelect.value = ''; // Reset month selector
                      }}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center"
                    >
                      <Plus className="w-4 h-4 mr-1" /> 新增單月數據
                    </button>
                    <button
                      onClick={() => {
                        const lastYear = new Date().getFullYear() - 1;
                        const targetsToAdd: any[] = [];
                        
                        // Check which months need to be added
                        for (let m = 1; m <= 12; m++) {
                          const exists = localRevenueTargets.some(t => 
                            t.year === lastYear && 
                            t.month === m && 
                            t.customerId === (selectedCustomerForTarget || undefined)
                          );
                          
                          if (!exists) {
                            targetsToAdd.push({
                              year: lastYear,
                              month: m,
                              customerId: selectedCustomerForTarget || undefined
                            });
                          }
                        }
                        
                        if (targetsToAdd.length > 0) {
                          batchAddRevenueTargets(targetsToAdd);
                          // 如果是特定客戶，自動展開該客戶的歷史數據
                          if (selectedCustomerForTarget) {
                            setExpandedHistoryCustomers(prev => new Set(prev).add(selectedCustomerForTarget));
                          }
                        } else {
                          toast.warning('該年度的所有月份數據已存在。');
                        }
                      }}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium flex items-center"
                    >
                      <Layers className="w-4 h-4 mr-1" /> 一鍵新增 1-12 月
                    </button>
                  </div>
                </div>
              </div>

              {/* Historical Data List (Last Year Only) */}
              <div className="space-y-4">
                {(() => {
                  const lastYear = new Date().getFullYear() - 1;
                  const lastYearTargets = localRevenueTargets.filter(t => t.year === lastYear);
                  
                  // 分組：全公司數據和客戶特定數據
                  const companyTargets = lastYearTargets.filter(t => !t.customerId);
                  const customerTargetsMap = new Map<string, RevenueTarget[]>();
                  lastYearTargets.filter(t => t.customerId).forEach(t => {
                    const customerId = t.customerId!;
                    if (!customerTargetsMap.has(customerId)) {
                      customerTargetsMap.set(customerId, []);
                    }
                    customerTargetsMap.get(customerId)!.push(t);
                  });
                  
                  // 全公司：年度和月份數據
                  const annualTarget = companyTargets.find(t => !t.quarter && !t.month);
                  const monthlyTargets = companyTargets.filter(t => !t.quarter && t.month).sort((a, b) => (a.month || 0) - (b.month || 0));

                  return (
                    <div key={lastYear} className="bg-white rounded-lg border border-slate-200 shadow-sm">
                      <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200">
                        <h3 className="font-bold text-lg text-emerald-800">{lastYear}年 歷史數據</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* Annual Historical Data */}
                        {(() => {
                          // 自動計算單月數據的總和
                          const calculatedAnnualAmount = monthlyTargets.reduce((sum, t) => {
                            return sum + (t.actualAmount !== undefined && t.actualAmount !== null ? t.actualAmount : 0);
                          }, 0);
                          
                          return annualTarget ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <label className="font-semibold text-emerald-800 flex items-center">
                                  <Calendar className="w-4 h-4 mr-2" />
                                  年度實際營收
                                </label>
                                <button
                                  onClick={() => removeRevenueTarget(annualTarget.id)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  value={annualTarget.actualAmount || ''}
                                  onChange={(e) => updateRevenueTarget(annualTarget.id, 'actualAmount', e.target.value ? Number(e.target.value) : undefined)}
                                  className="flex-1 p-2 border border-emerald-300 rounded-lg text-right font-mono text-lg bg-white"
                                  placeholder="輸入年度實際營收"
                                />
                                <span className="text-sm text-emerald-600">元</span>
                                {calculatedAnnualAmount > 0 && (
                                  <span className="text-xs text-slate-500">（單月總和：{calculatedAnnualAmount.toLocaleString()}元）</span>
                                )}
                              </div>
                            </div>
                          ) : calculatedAnnualAmount > 0 ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <label className="font-semibold text-emerald-800 flex items-center">
                                  <Calendar className="w-4 h-4 mr-2" />
                                  年度實際營收（自動計算）
                                </label>
                              </div>
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={calculatedAnnualAmount.toLocaleString()}
                                  disabled
                                  className="flex-1 p-2 border border-emerald-300 rounded-lg text-right font-mono text-lg bg-emerald-100 text-emerald-700"
                                />
                                <span className="text-sm text-emerald-600">元</span>
                                <span className="text-xs text-slate-500">（由單月數據自動統計）</span>
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Monthly Historical Data */}
                        {monthlyTargets.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-medium text-emerald-700 text-sm flex items-center">
                              <Calendar className="w-4 h-4 mr-1" />
                              月份實際營收
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {monthlyTargets.map(target => (
                                <div key={target.id} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="font-medium text-emerald-800 text-sm">
                                      {target.month}月
                                    </label>
                                    <button
                                      onClick={() => removeRevenueTarget(target.id)}
                                      className="text-red-400 hover:text-red-600 p-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={target.actualAmount || ''}
                                      onChange={(e) => updateRevenueTarget(target.id, 'actualAmount', e.target.value ? Number(e.target.value) : undefined)}
                                      className="flex-1 p-1.5 border border-emerald-300 rounded text-right font-mono text-sm bg-white"
                                      placeholder="輸入營收"
                                    />
                                    <span className="text-xs text-emerald-600">元</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Customer Specific Historical Data */}
                        {Array.from(customerTargetsMap.entries()).map(([customerId, customerYearTargets]) => {
                          const customer = customers.find(c => c.id === customerId);
                          const customerAnnualTarget = customerYearTargets.find(t => !t.quarter && !t.month);
                          const customerMonthlyTargets = customerYearTargets.filter(t => !t.quarter && t.month).sort((a, b) => (a.month || 0) - (b.month || 0));
                          const isExpanded = expandedHistoryCustomers.has(customerId);
                          
                          return (
                            <div key={customerId} className="mt-4 pt-4 border-t-2 border-emerald-300 bg-emerald-50/50 rounded-lg overflow-hidden">
                              <div 
                                className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-emerald-100/50 transition-colors"
                                onClick={() => toggleHistoryExpansion(customerId)}
                              >
                                <h4 className="font-semibold text-emerald-800 flex items-center">
                                  <User className="w-4 h-4 mr-2" />
                                  {customer?.name || '未知客戶'} - 歷史數據
                                </h4>
                                <ChevronDown className={`w-5 h-5 text-emerald-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                              
                              {isExpanded && (
                                <div className="p-4 pt-0 animate-fadeIn">
                                  {/* 年度實際營收：優先顯示手動輸入的年度數據，否則自動計算單月總和 */}
                                  {(() => {
                                    // 自動計算單月數據的總和
                                    const calculatedAnnualAmount = customerMonthlyTargets.reduce((sum, t) => {
                                      return sum + (t.actualAmount !== undefined && t.actualAmount !== null ? t.actualAmount : 0);
                                    }, 0);
                                    
                                    return (
                                      <div className="mb-3 mt-2">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-xs text-emerald-700 font-medium whitespace-nowrap">年度實際營收：</span>
                                          {customerAnnualTarget ? (
                                            <>
                                              <input
                                                type="number"
                                                value={customerAnnualTarget.actualAmount || ''}
                                                onChange={(e) => updateRevenueTarget(customerAnnualTarget.id, 'actualAmount', e.target.value ? Number(e.target.value) : undefined)}
                                                className="flex-1 p-2 border border-emerald-300 rounded-lg text-right font-mono text-sm bg-white min-w-0"
                                                placeholder="輸入實際營收"
                                              />
                                              <span className="text-xs text-emerald-600 whitespace-nowrap">元</span>
                                              {calculatedAnnualAmount > 0 && (
                                                <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">（單月總和：{calculatedAnnualAmount.toLocaleString()}元）</span>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              <input
                                                type="text"
                                                value={calculatedAnnualAmount > 0 ? calculatedAnnualAmount.toLocaleString() : '0'}
                                                disabled
                                                className="flex-1 p-2 border border-emerald-300 rounded-lg text-right font-mono text-sm bg-emerald-50 text-emerald-700 min-w-0"
                                              />
                                              <span className="text-xs text-emerald-600 whitespace-nowrap">元</span>
                                              <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">（自動計算自單月數據）</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  
                                  {customerMonthlyTargets.length > 0 && (
                                    <div className="space-y-2">
                                      <h5 className="text-xs font-medium text-emerald-700 mb-2">月份實際營收：</h5>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {customerMonthlyTargets.map(target => (
                                          <div key={target.id} className="flex items-center gap-2">
                                            <span className="text-xs text-emerald-700 w-8">{target.month}月：</span>
                                            <input
                                              type="number"
                                              value={target.actualAmount || ''}
                                              onChange={(e) => updateRevenueTarget(target.id, 'actualAmount', e.target.value ? Number(e.target.value) : undefined)}
                                              className="flex-1 p-1.5 border border-emerald-300 rounded text-right font-mono text-xs bg-white min-w-0"
                                              placeholder="實際營收"
                                            />
                                            <span className="text-xs text-emerald-600 whitespace-nowrap">元</span>
                                            <button
                                              onClick={() => removeRevenueTarget(target.id)}
                                              className="text-slate-400 hover:text-red-500 p-1 flex-shrink-0"
                                              title="刪除此月份數據"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {localRevenueTargets.filter(t => t.year === new Date().getFullYear() - 1).length === 0 && (
                  <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-slate-200">
                    <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>尚未新增去年歷史數據</p>
                    <p className="text-sm mt-1">請使用上方的新增歷史數據功能開始輸入</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Security Settings */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className="text-xl font-bold text-slate-800">帳號安全設定</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Admin Password */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-brand-100 p-2 rounded-full text-brand-600">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">管理員帳號</h3>
                      <p className="text-xs text-slate-500">擁有完整系統權限</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">電子郵件 (帳號)</label>
                      <input 
                        type="email" 
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg"
                        placeholder="請輸入 Email"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">重設密碼 (留空則不修改)</label>
                      <input 
                        type="password" 
                        value={ownerPassword}
                        onChange={(e) => setOwnerPassword(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg"
                        placeholder="請輸入新密碼"
                      />
                    </div>
                    <button 
                      onClick={() => handleUpdateAccount('owner', ownerEmail, ownerPassword)}
                      className="w-full bg-brand-600 text-white py-2 rounded-lg hover:bg-brand-700 transition-colors font-medium text-sm"
                    >
                      更新管理員帳號
                    </button>
                  </div>
                </div>

                {/* Staff Password */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-slate-100 p-2 rounded-full text-slate-600">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">員工帳號</h3>
                      <p className="text-xs text-slate-500">僅能開立單據，無法修改設定</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">電子郵件 (帳號)</label>
                      <input 
                        type="email" 
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg"
                        placeholder="請輸入 Email"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">重設密碼 (留空則不修改)</label>
                      <input 
                        type="password" 
                        value={staffPassword}
                        onChange={(e) => setStaffPassword(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg"
                        placeholder="請輸入新密碼"
                      />
                    </div>
                    <button 
                      onClick={() => handleUpdateAccount('staff', staffEmail, staffPassword)}
                      className="w-full bg-slate-600 text-white py-2 rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm"
                    >
                      更新員工帳號
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6">
                <p className="text-sm text-amber-800 flex items-center">
                  <Lock className="w-4 h-4 mr-2" />
                  <strong>注意：</strong> 修改密碼後，請通知相關人員使用新密碼登入。預設帳號為 admin@example.com (管理員) 和 staff@example.com (員工)。
                </p>
              </div>
            </div>
          )}

          {/* Backup */}
          {activeTab === 'backup' && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className="text-xl font-bold text-slate-800">資料備份與匯出</h2>
              <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                <p className="text-slate-600 mb-4">
                  您可以匯出系統中的所有資料（包含設定、商品、客戶、價格規則與所有單據）為 JSON 格式。
                  建議定期備份以防資料遺失。
                </p>
                <button 
                  onClick={handleBackup}
                  className="flex items-center px-5 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-900 shadow-lg transition-all transform hover:scale-[1.02]"
                >
                  <Download className="w-5 h-5 mr-2" /> 匯出完整備份檔 (.json)
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Settings;
