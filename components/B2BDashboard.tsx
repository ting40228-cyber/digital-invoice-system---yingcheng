import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RevenueRecord } from '../types';
import { 
  createRevenueRecord, 
  updateRevenueRecord, 
  deleteRevenueRecord,
  uploadHistoricalData,
  subscribeRevenueRecords,
  getAllVendorNames
} from '../utils/revenueService';
import { parseCSV, csvRecordsToRevenueRecords } from '../utils/csvParser';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, Edit2, Upload, Download, TrendingUp, TrendingDown, DollarSign, Calendar, Building2 } from 'lucide-react';

// Mock Data（用於 Demo，當 Firebase 尚未配置時）
const MOCK_RECORDS: RevenueRecord[] = [
  { id: '1', date: new Date('2025-01-15'), vendorName: '廠商A', amount: 500000, year: 2025, month: 1 },
  { id: '2', date: new Date('2025-01-20'), vendorName: '廠商B', amount: 300000, year: 2025, month: 1 },
  { id: '3', date: new Date('2025-01-25'), vendorName: '廠商A', amount: 450000, year: 2025, month: 1 },
  { id: '4', date: new Date('2024-01-15'), vendorName: '廠商A', amount: 480000, year: 2024, month: 1 },
  { id: '5', date: new Date('2024-01-20'), vendorName: '廠商B', amount: 320000, year: 2024, month: 1 },
  { id: '6', date: new Date('2025-02-10'), vendorName: '廠商C', amount: 600000, year: 2025, month: 2 },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const B2BDashboard: React.FC = () => {
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [vendorNames, setVendorNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [useMockData, setUseMockData] = useState(true); // 預設使用 Mock Data

  // 表單狀態
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formVendorName, setFormVendorName] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [vendorSuggestions, setVendorSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 編輯狀態
  const [editingId, setEditingId] = useState<string | null>(null);

  // 報表篩選
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [viewMode, setViewMode] = useState<'month' | 'quarter'>('month');
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.ceil((new Date().getMonth() + 1) / 3));

  // CSV 匯入
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化：載入數據
  useEffect(() => {
    if (useMockData) {
      setRecords(MOCK_RECORDS);
      setVendorNames(['廠商A', '廠商B', '廠商C']);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // 訂閱數據變更
    const unsubscribe = subscribeRevenueRecords((newRecords) => {
      setRecords(newRecords);
      setIsLoading(false);
    }, selectedYear, viewMode === 'month' ? selectedMonth : undefined);

    // 載入廠商名稱
    getAllVendorNames().then(names => {
      setVendorNames(names);
    }).catch(error => {
      console.error('Error loading vendor names:', error);
    });

    return () => unsubscribe();
  }, [useMockData, selectedYear, selectedMonth, viewMode]);

  // 自動完成建議
  useEffect(() => {
    if (formVendorName.trim()) {
      const filtered = vendorNames.filter(name => 
        name.toLowerCase().includes(formVendorName.toLowerCase())
      );
      setVendorSuggestions(filtered.slice(0, 5));
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [formVendorName, vendorNames]);

  // 計算當前期間數據
  const currentPeriodData = useMemo(() => {
    if (viewMode === 'month') {
      return records.filter(r => r.year === selectedYear && r.month === selectedMonth);
    } else {
      const quarterMonths = [
        [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]
      ][selectedQuarter - 1];
      return records.filter(r => r.year === selectedYear && quarterMonths.includes(r.month));
    }
  }, [records, selectedYear, selectedMonth, selectedQuarter, viewMode]);

  // 計算去年同期數據
  const lastYearPeriodData = useMemo(() => {
    const lastYear = selectedYear - 1;
    if (viewMode === 'month') {
      return records.filter(r => r.year === lastYear && r.month === selectedMonth);
    } else {
      const quarterMonths = [
        [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]
      ][selectedQuarter - 1];
      return records.filter(r => r.year === lastYear && quarterMonths.includes(r.month));
    }
  }, [records, selectedYear, selectedMonth, selectedQuarter, viewMode]);

  // 圓餅圖數據（當月各廠商營收佔比）
  const pieChartData = useMemo(() => {
    if (viewMode === 'quarter') return []; // 季度不顯示圓餅圖

    const vendorTotals: Record<string, number> = {};
    currentPeriodData.forEach(record => {
      vendorTotals[record.vendorName] = (vendorTotals[record.vendorName] || 0) + record.amount;
    });

    const total = Object.values(vendorTotals).reduce((sum, val) => sum + val, 0);
    
    return Object.entries(vendorTotals)
      .map(([name, amount]) => ({
        name,
        value: amount,
        percentage: total > 0 ? ((amount / total) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.value - a.value);
  }, [currentPeriodData, viewMode]);

  // 對比分析數據（群組長條圖）
  const comparisonData = useMemo(() => {
    const currentTotals: Record<string, number> = {};
    const lastYearTotals: Record<string, number> = {};

    currentPeriodData.forEach(record => {
      currentTotals[record.vendorName] = (currentTotals[record.vendorName] || 0) + record.amount;
    });

    lastYearPeriodData.forEach(record => {
      lastYearTotals[record.vendorName] = (lastYearTotals[record.vendorName] || 0) + record.amount;
    });

    // 合併所有廠商名稱
    const allVendors = new Set([...Object.keys(currentTotals), ...Object.keys(lastYearTotals)]);

    return Array.from(allVendors).map(vendorName => {
      const current = currentTotals[vendorName] || 0;
      const lastYear = lastYearTotals[vendorName] || 0;
      const growth = lastYear > 0 ? ((current - lastYear) / lastYear) * 100 : (current > 0 ? 100 : 0);

      return {
        vendorName,
        current: current,
        lastYear: lastYear,
        growth: growth.toFixed(1)
      };
    }).sort((a, b) => b.current - a.current);
  }, [currentPeriodData, lastYearPeriodData]);

  // 提交表單
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formVendorName.trim() || !formAmount) {
      alert('請填寫完整的資訊');
      return;
    }

    const date = new Date(formDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const amount = parseFloat(formAmount);

    if (isNaN(amount) || amount <= 0) {
      alert('請輸入有效的金額');
      return;
    }

    try {
      if (editingId) {
        // 更新記錄
        await updateRevenueRecord(editingId, {
          date,
          vendorName: formVendorName.trim(),
          amount,
          year,
          month
        });
        setEditingId(null);
      } else {
        // 創建記錄
        await createRevenueRecord({
          date,
          vendorName: formVendorName.trim(),
          amount,
          year,
          month
        });
      }

      // 重置表單
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormVendorName('');
      setFormAmount('');
    } catch (error) {
      console.error('Error saving record:', error);
      if (useMockData) {
        // Mock 模式：直接更新本地狀態
        const newRecord: RevenueRecord = {
          id: editingId || Date.now().toString(),
          date,
          vendorName: formVendorName.trim(),
          amount,
          year,
          month,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        if (editingId) {
          setRecords(records.map(r => r.id === editingId ? newRecord : r));
          setEditingId(null);
        } else {
          setRecords([...records, newRecord]);
        }

        if (!vendorNames.includes(formVendorName.trim())) {
          setVendorNames([...vendorNames, formVendorName.trim()].sort());
        }

        setFormDate(new Date().toISOString().split('T')[0]);
        setFormVendorName('');
        setFormAmount('');
      } else {
        alert('儲存失敗，請稍後再試');
      }
    }
  };

  // 刪除記錄
  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這筆記錄嗎？')) return;

    try {
      await deleteRevenueRecord(id);
    } catch (error) {
      console.error('Error deleting record:', error);
      if (useMockData) {
        setRecords(records.filter(r => r.id !== id));
      } else {
        alert('刪除失敗，請稍後再試');
      }
    }
  };

  // 編輯記錄
  const handleEdit = (record: RevenueRecord) => {
    setFormDate(record.date.toISOString().split('T')[0]);
    setFormVendorName(record.vendorName);
    setFormAmount(record.amount.toString());
    setEditingId(record.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // CSV 匯入處理
  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      try {
        const csvRecords = parseCSV(text);
        const revenueRecords = csvRecordsToRevenueRecords(csvRecords);

        if (useMockData) {
          // Mock 模式：直接添加到本地狀態
          const newRecords: RevenueRecord[] = revenueRecords.map((r, idx) => ({
            ...r,
            id: `mock-${Date.now()}-${idx}`,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }));
          setRecords([...records, ...newRecords]);

          const newVendors = new Set([...vendorNames, ...revenueRecords.map(r => r.vendorName)]);
          setVendorNames(Array.from(newVendors).sort());
        } else {
          await uploadHistoricalData(revenueRecords);
        }

        alert(`成功匯入 ${revenueRecords.length} 筆記錄`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Error importing CSV:', error);
        alert('匯入失敗，請檢查 CSV 格式');
      }
    };
    reader.readAsText(file);
  };

  // 分頁狀態
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  const totalPages = Math.ceil(records.length / recordsPerPage);
  const paginatedRecords = records.slice(
    (currentPage - 1) * recordsPerPage,
    currentPage * recordsPerPage
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Building2 className="w-8 h-8 text-blue-600" />
            B2B 廠商營收分析系統
          </h1>
          <p className="text-slate-600 mt-2">專業的廠商營收數據管理與視覺化分析</p>
          
          {/* Mock Data 提示 */}
          {useMockData && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-amber-800 text-sm">
                ⚠️ 目前使用 Mock Data 模式，請配置 Firebase 後關閉此模式
              </span>
              <button
                onClick={() => setUseMockData(false)}
                className="ml-auto text-amber-700 hover:text-amber-900 text-sm underline"
              >
                切換到 Firebase
              </button>
            </div>
          )}
        </div>

        {/* 數據錄入區 */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            數據錄入
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 日期選擇 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  對帳日期
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {/* 廠商名稱（帶自動完成） */}
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  廠商名稱
                </label>
                <input
                  type="text"
                  value={formVendorName}
                  onChange={(e) => setFormVendorName(e.target.value)}
                  onFocus={() => {
                    if (formVendorName && vendorSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="輸入或選擇廠商"
                  required
                />
                {showSuggestions && vendorSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-auto">
                    {vendorSuggestions.map((name, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setFormVendorName(name);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 金額 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  金額
                </label>
                <input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="輸入金額"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {editingId ? '更新記錄' : '新增記錄'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormDate(new Date().toISOString().split('T')[0]);
                    setFormVendorName('');
                    setFormAmount('');
                  }}
                  className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                >
                  取消編輯
                </button>
              )}
              <label className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium cursor-pointer flex items-center gap-2">
                <Upload className="w-4 h-4" />
                CSV 匯入
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                />
              </label>
            </div>
          </form>
        </div>

        {/* 報表篩選器 */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">報表篩選</h2>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* 年份選擇 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">年份</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* 月份/季度切換 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">查看模式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    viewMode === 'month' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  月份
                </button>
                <button
                  onClick={() => setViewMode('quarter')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    viewMode === 'quarter' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  季度
                </button>
              </div>
            </div>

            {/* 月份選擇 */}
            {viewMode === 'month' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">月份</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <option key={month} value={month}>{month} 月</option>
                  ))}
                </select>
              </div>
            )}

            {/* 季度選擇 */}
            {viewMode === 'quarter' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">季度</label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(parseInt(e.target.value))}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4].map(q => (
                    <option key={q} value={q}>Q{q}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* 月報模組 - 圓餅圖 */}
        {viewMode === 'month' && pieChartData.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">
              {selectedYear}年 {selectedMonth}月 各廠商營收佔比
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 圓餅圖 */}
              <div className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${name} ${percentage}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `NT$ ${value.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* 數據清單 */}
              <div className="lg:col-span-1">
                <div className="bg-slate-50 rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
                  {pieChartData.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="font-medium text-slate-800">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900">NT$ {item.value.toLocaleString()}</div>
                        <div className="text-sm text-slate-500">{item.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 對比分析模組 - 群組長條圖 */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">
            對比分析：{selectedYear}年 {viewMode === 'month' ? `${selectedMonth}月` : `Q${selectedQuarter}`} vs {selectedYear - 1}年同期
          </h2>

          {comparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="vendorName" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fill: '#64748b' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b' }}
                  tickFormatter={(value) => `NT$ ${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value: number) => `NT$ ${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="current" name={`${selectedYear}年${viewMode === 'month' ? `${selectedMonth}月` : `Q${selectedQuarter}`}`} fill="#3b82f6" />
                <Bar dataKey="lastYear" name={`${selectedYear - 1}年同期`} fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-slate-500">
              目前沒有數據可供對比
            </div>
          )}

          {/* 成長率標註 */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comparisonData.map((item) => {
              const growth = parseFloat(item.growth);
              const isPositive = growth > 0;
              
              return (
                <div key={item.vendorName} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-800">{item.vendorName}</span>
                    <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="font-bold">{Math.abs(growth).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 space-y-1">
                    <div>本期：NT$ {item.current.toLocaleString()}</div>
                    <div>去年同期：NT$ {item.lastYear.toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 數據管理列表 */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">數據管理</h2>

          {/* 分頁控制 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600">
                第 {currentPage} 頁，共 {totalPages} 頁（總計 {records.length} 筆）
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一頁
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一頁
                </button>
              </div>
            </div>
          )}

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">日期</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">廠商名稱</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">金額</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.length > 0 ? (
                  paginatedRecords.map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {record.date.toLocaleDateString('zh-TW')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">
                        {record.vendorName}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-slate-900">
                        NT$ {record.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEdit(record)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="編輯"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="刪除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      目前沒有數據
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default B2BDashboard;
