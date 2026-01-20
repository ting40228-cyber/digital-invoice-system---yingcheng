import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Invoice, CustomerStat, CompanySettings, RevenueTarget, Customer } from '../types';
import { 
  getMonthKey, 
  formatCurrency, 
  getQuarterKey, 
  getYearKey, 
  getQuarterMonths, 
  parseQuarterKey,
  getAvailableQuarters,
  getAvailableYears,
  calculateGrowthRate,
  formatGrowthRate
} from '../utils/helpers';
import { Calendar, DollarSign, TrendingUp, FileText, BarChart3, PieChart, ChevronDown, ChevronLeft, Lightbulb, Sparkles, Award, ArrowRight, Download } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';

// Register Chart.js components
try {
  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
  );
} catch (e) {
  console.debug('Chart.js already registered');
}

interface ReportsProps {
  invoices: Invoice[];
  companySettings?: CompanySettings;
  revenueTargets?: RevenueTarget[];
  customers?: Customer[];
  onBack?: () => void;
}

type ReportType = 'month' | 'quarter' | 'year';

const Reports: React.FC<ReportsProps> = ({ invoices, companySettings, revenueTargets = [], customers = [], onBack }) => {
  const [reportType, setReportType] = useState<ReportType>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(getMonthKey(new Date().toISOString()));
  const [selectedQuarter, setSelectedQuarter] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedCustomerForChart, setSelectedCustomerForChart] = useState<string>('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  
  // Chart refs for PDF export
  const customerChartRef = useRef<any>(null);
  const dailyChartRef = useRef<any>(null);
  const serviceClientChartRef = useRef<any>(null);
  const contactPersonChartRef = useRef<any>(null);
  const monthlyTrendChartRef = useRef<any>(null);
  const quarterlyChartRef = useRef<any>(null);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    invoices.forEach(inv => months.add(getMonthKey(inv.date)));
    months.add(getMonthKey(new Date().toISOString()));
    return Array.from(months).sort().reverse();
  }, [invoices]);

  const availableQuarters = useMemo(() => getAvailableQuarters(invoices), [invoices]);
  const availableYears = useMemo(() => getAvailableYears(invoices), [invoices]);

  useEffect(() => {
    if (availableQuarters.length > 0 && !selectedQuarter) {
      const currentQuarter = getQuarterKey(new Date().toISOString());
      setSelectedQuarter(availableQuarters.includes(currentQuarter) ? currentQuarter : availableQuarters[0]);
    }
    if (availableYears.length > 0 && !selectedYear) {
      const currentYear = getYearKey(new Date().toISOString());
      setSelectedYear(availableYears.includes(currentYear) ? currentYear : availableYears[0]);
    }
  }, [availableQuarters, availableYears, selectedQuarter, selectedYear]);

  useEffect(() => {
    // 當切換報表類型時，清空客戶選擇
    if (reportType === 'month') {
      // 月報表也允許選擇客戶，不清空
      // setSelectedCustomerForChart('');
    } else {
      setSelectedCustomerForChart('');
    }
  }, [reportType, selectedQuarter, selectedYear]);

  const filteredInvoices = useMemo(() => {
    switch (reportType) {
      case 'month':
        return invoices.filter(inv => getMonthKey(inv.date) === selectedMonth);
      case 'quarter':
        if (!selectedQuarter) return [];
        const { year, quarter } = parseQuarterKey(selectedQuarter);
        const quarterMonths = getQuarterMonths(quarter, year);
        return invoices.filter(inv => quarterMonths.includes(getMonthKey(inv.date)));
      case 'year':
        if (!selectedYear) return [];
        return invoices.filter(inv => getYearKey(inv.date) === selectedYear);
      default:
        return invoices.filter(inv => getMonthKey(inv.date) === selectedMonth);
    }
  }, [invoices, reportType, selectedMonth, selectedQuarter, selectedYear]);

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

  const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

  const customerRevenueDistribution = useMemo(() => {
    if (!customerStats || customerStats.length === 0) return null;
    
    // 如果選擇了特定客戶，只顯示該客戶
    let statsToShow = customerStats;
    let revenueToCalculate = totalRevenue;
    
    if (selectedCustomerForChart) {
      const selectedCustomerStat = customerStats.find(c => c.name === selectedCustomerForChart);
      if (!selectedCustomerStat) return null;
      statsToShow = [selectedCustomerStat];
      revenueToCalculate = selectedCustomerStat.totalAmount;
    }
    
    if (revenueToCalculate === 0) return null;
    
    return statsToShow.map(cust => ({
      name: cust.name,
      revenue: cust.totalAmount,
      percentage: (cust.totalAmount / revenueToCalculate) * 100,
      count: cust.invoiceCount || 0
    })).sort((a, b) => b.revenue - a.revenue);
  }, [customerStats, totalRevenue, selectedCustomerForChart]);

  // 服務客戶分析（僅當選擇康士藤客戶時顯示）
  const serviceClientDistribution = useMemo(() => {
    // 在月報表、季報表或年報表且選擇了客戶時計算
    if (!selectedCustomerForChart) return null;
    
    // 檢查選中的客戶是否為康士藤客戶
    const selectedCustomer = customers.find(c => c.name === selectedCustomerForChart);
    const isKangshiting = selectedCustomer && 
      ((selectedCustomer.customerTier || selectedCustomer.priceCategory) === 'kangshiting');
    
    if (!isKangshiting) return null;
    
    // 篩選出該康士藤客戶的單據（僅包含有服務客戶欄位的單據）
    const customerInvoices = filteredInvoices.filter(inv => 
      inv.customerName === selectedCustomerForChart && inv.serviceClient
    );
    
    if (customerInvoices.length === 0) return null;
    
    // 計算該客戶的總營收
    const customerTotalRevenue = filteredInvoices
      .filter(inv => inv.customerName === selectedCustomerForChart)
      .reduce((sum, inv) => sum + inv.totalAmount, 0);
    
    if (customerTotalRevenue === 0) return null;
    
    // 按服務客戶分組統計
    const serviceClientStats: Record<string, { name: string; revenue: number; count: number }> = {};
    
    customerInvoices.forEach(inv => {
      const serviceClient = inv.serviceClient || '未指定';
      if (!serviceClientStats[serviceClient]) {
        serviceClientStats[serviceClient] = {
          name: serviceClient,
          revenue: 0,
          count: 0
        };
      }
      serviceClientStats[serviceClient].revenue += inv.totalAmount;
      serviceClientStats[serviceClient].count += 1;
    });
    
    // 轉換為陣列並計算佔比
    const distribution = Object.values(serviceClientStats)
      .map(stat => ({
        name: stat.name,
        revenue: stat.revenue,
        count: stat.count,
        percentage: (stat.revenue / customerTotalRevenue) * 100
      }))
      .sort((a, b) => b.revenue - a.revenue);
    
    return {
      distribution,
      totalRevenue: customerTotalRevenue,
      totalInvoices: customerInvoices.length,
      customerName: selectedCustomerForChart
    };
  }, [reportType, selectedMonth, selectedCustomerForChart, filteredInvoices, customers]);

  // 下單人員分析（僅當選擇康士藤客戶時顯示）
  const contactPersonDistribution = useMemo(() => {
    // 在月報表、季報表或年報表且選擇了客戶時計算
    if (!selectedCustomerForChart) return null;
    
    // 檢查選中的客戶是否為康士藤客戶
    const selectedCustomer = customers.find(c => c.name === selectedCustomerForChart);
    const isKangshiting = selectedCustomer && 
      ((selectedCustomer.customerTier || selectedCustomer.priceCategory) === 'kangshiting');
    
    if (!isKangshiting) return null;
    
    // 篩選出該康士藤客戶的所有單據
    const customerInvoices = filteredInvoices.filter(inv => 
      inv.customerName === selectedCustomerForChart
    );
    
    if (customerInvoices.length === 0) return null;
    
    // 計算該客戶的總營收
    const customerTotalRevenue = customerInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    
    if (customerTotalRevenue === 0) return null;
    
    // 按下單人員分組統計
    const contactPersonStats: Record<string, { name: string; revenue: number; count: number }> = {};
    
    customerInvoices.forEach(inv => {
      const contactPerson = inv.contactPerson || '未指定';
      if (!contactPersonStats[contactPerson]) {
        contactPersonStats[contactPerson] = {
          name: contactPerson,
          revenue: 0,
          count: 0
        };
      }
      contactPersonStats[contactPerson].revenue += inv.totalAmount;
      contactPersonStats[contactPerson].count += 1;
    });
    
    // 轉換為陣列並計算佔比
    const distribution = Object.values(contactPersonStats)
      .map(stat => ({
        name: stat.name,
        revenue: stat.revenue,
        count: stat.count,
        percentage: (stat.revenue / customerTotalRevenue) * 100
      }))
      .sort((a, b) => b.revenue - a.revenue);
    
    return {
      distribution,
      totalRevenue: customerTotalRevenue,
      totalInvoices: customerInvoices.length,
      customerName: selectedCustomerForChart
    };
  }, [reportType, selectedMonth, selectedCustomerForChart, filteredInvoices, customers]);

  const growthRateData = useMemo(() => {
    if (reportType === 'quarter' && selectedQuarter) {
      const { year, quarter } = parseQuarterKey(selectedQuarter);
      const currentQuarterMonths = getQuarterMonths(quarter, year);
      const currentQuarterTotal = invoices
        .filter(inv => currentQuarterMonths.includes(getMonthKey(inv.date)))
        .reduce((sum, inv) => sum + inv.totalAmount, 0);
      
      let prevQuarter: number, prevYear: number;
      if (quarter === 1) {
        prevQuarter = 4;
        prevYear = year - 1;
      } else {
        prevQuarter = quarter - 1;
        prevYear = year;
      }
      const prevQuarterMonths = getQuarterMonths(prevQuarter, prevYear);
      const prevQuarterTotal = invoices
        .filter(inv => prevQuarterMonths.includes(getMonthKey(inv.date)))
        .reduce((sum, inv) => sum + inv.totalAmount, 0);
      
      return {
        current: currentQuarterTotal,
        previous: prevQuarterTotal,
        rate: calculateGrowthRate(currentQuarterTotal, prevQuarterTotal)
      };
    }
    
    if (reportType === 'year' && selectedYear) {
      const currentYear = parseInt(selectedYear, 10);
      const currentYearTotal = invoices
        .filter(inv => getYearKey(inv.date) === selectedYear)
        .reduce((sum, inv) => sum + inv.totalAmount, 0);
      
      const prevYear = String(currentYear - 1);
      const prevYearTotal = invoices
        .filter(inv => getYearKey(inv.date) === prevYear)
        .reduce((sum, inv) => sum + inv.totalAmount, 0);
      
      return {
        current: currentYearTotal,
        previous: prevYearTotal,
        rate: calculateGrowthRate(currentYearTotal, prevYearTotal)
      };
    }
    
    return null;
  }, [reportType, selectedQuarter, selectedYear, invoices]);

  const availableCustomersForChart = useMemo(() => {
    if (reportType === 'month' && selectedMonth) {
      const monthInvoices = invoices.filter(inv => getMonthKey(inv.date) === selectedMonth);
      const customerNames = new Set(monthInvoices.map(inv => inv.customerName).filter(Boolean));
      return Array.from(customerNames).sort();
    }
    
    if (reportType === 'quarter' && selectedQuarter) {
      const { year, quarter } = parseQuarterKey(selectedQuarter);
      const quarterMonths = getQuarterMonths(quarter, year);
      const quarterInvoices = invoices.filter(inv => quarterMonths.includes(getMonthKey(inv.date)));
      const customerNames = new Set(quarterInvoices.map(inv => inv.customerName).filter(Boolean));
      return Array.from(customerNames).sort();
    }
    
    if (reportType === 'year' && selectedYear) {
      const yearInvoices = invoices.filter(inv => getYearKey(inv.date) === selectedYear);
      const customerNames = new Set(yearInvoices.map(inv => inv.customerName).filter(Boolean));
      return Array.from(customerNames).sort();
    }
    
    return [];
  }, [reportType, selectedMonth, selectedQuarter, selectedYear, invoices]);

  // Monthly breakdown for quarter/year reports (not for month reports)
  const monthlyBreakdown = useMemo(() => {
    if (reportType === 'quarter' && selectedQuarter) {
      const { year, quarter } = parseQuarterKey(selectedQuarter);
      const quarterMonths = getQuarterMonths(quarter, year);
      return quarterMonths.map(monthKey => {
        let monthInvoices = invoices.filter(inv => getMonthKey(inv.date) === monthKey);
        if (selectedCustomerForChart) {
          monthInvoices = monthInvoices.filter(inv => inv.customerName === selectedCustomerForChart);
        }
        return {
          month: monthKey,
          revenue: monthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
          count: monthInvoices.length
        };
      });
    }
    
    if (reportType === 'year' && selectedYear) {
      const yearNum = parseInt(selectedYear, 10);
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const monthKey = `${yearNum}-${String(month).padStart(2, '0')}`;
        let monthInvoices = invoices.filter(inv => getMonthKey(inv.date) === monthKey);
        if (selectedCustomerForChart) {
          monthInvoices = monthInvoices.filter(inv => inv.customerName === selectedCustomerForChart);
        }
        return {
          month: monthKey,
          revenue: monthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
          count: monthInvoices.length
        };
      });
    }
    
    return null;
  }, [reportType, selectedQuarter, selectedYear, invoices, selectedCustomerForChart]);

  // ------------------------------------------------------------------
  // Daily Revenue Breakdown (月報表專用：每日營收趨勢)
  // ------------------------------------------------------------------
  const dailyBreakdown = useMemo(() => {
    if (reportType !== 'month' || !selectedMonth) return null;

    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    // 初始化每日數據
    const dailyData = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      revenue: 0,
      count: 0
    }));

    // 根據選中的客戶過濾單據
    let invoicesToProcess = filteredInvoices;
    if (selectedCustomerForChart) {
      invoicesToProcess = filteredInvoices.filter(inv => inv.customerName === selectedCustomerForChart);
    }

    // 填入發票數據
    invoicesToProcess.forEach(inv => {
      const date = new Date(inv.date);
      // 確保日期是屬於選定月份 (雙重檢查)
      if (date.getMonth() + 1 === month && date.getFullYear() === year) {
        const day = date.getDate();
        if (dailyData[day - 1]) {
          dailyData[day - 1].revenue += inv.totalAmount;
          dailyData[day - 1].count += 1;
        }
      }
    });

    return dailyData;
  }, [reportType, selectedMonth, filteredInvoices, selectedCustomerForChart]);

  // Previous year monthly breakdown (similar logic to Dashboard)
  const previousYearMonthlyBreakdown = useMemo(() => {
    if (reportType === 'quarter' && selectedQuarter) {
      const { year, quarter } = parseQuarterKey(selectedQuarter);
      const prevYear = year - 1;
      const prevQuarterMonths = getQuarterMonths(quarter, prevYear);
      
      const customerId = selectedCustomerForChart ? customers.find(c => c.name === selectedCustomerForChart)?.id : undefined;
      
      const prevYearMonthlyTargets = customerId
        ? revenueTargets.filter(t => 
            t.year === prevYear && 
            !t.quarter && 
            t.month &&
            t.customerId === customerId
          )
        : revenueTargets.filter(t => 
            t.year === prevYear && 
            !t.quarter && 
            t.month
          );
      
      const hasAnyMonthlyData = prevYearMonthlyTargets.length > 0;
      
      return prevQuarterMonths.map(monthKey => {
        const [yearStr, monthStr] = monthKey.split('-');
        const month = parseInt(monthStr, 10);
        
        if (hasAnyMonthlyData) {
          const monthTargets = prevYearMonthlyTargets.filter(t => t.month === month);
          if (monthTargets.length > 0) {
            const totalRevenue = monthTargets.reduce((sum, t) => {
              const amount = t.actualAmount !== undefined && t.actualAmount !== null ? t.actualAmount : 0;
              return sum + amount;
            }, 0);
            
            return {
              month: monthKey,
              revenue: totalRevenue,
              count: 0
            };
          }
        }
        
        if (selectedCustomerForChart) {
          return {
            month: monthKey,
            revenue: 0,
            count: 0
          };
        }
        
        if (hasAnyMonthlyData) {
          return {
            month: monthKey,
            revenue: 0,
            count: 0
          };
        }
        
        const monthInvoices = invoices.filter(inv => 
          getMonthKey(inv.date) === monthKey
        );
        
        return {
          month: monthKey,
          revenue: monthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
          count: monthInvoices.length
        };
      });
    }
    
    if (reportType === 'year' && selectedYear) {
      const currentYear = parseInt(selectedYear, 10);
      const prevYear = currentYear - 1;
      
      const customerId = selectedCustomerForChart ? customers.find(c => c.name === selectedCustomerForChart)?.id : undefined;
      
      const prevYearMonthlyTargets = customerId
        ? revenueTargets.filter(t => 
            t.year === prevYear && 
            !t.quarter && 
            t.month &&
            t.customerId === customerId
          )
        : revenueTargets.filter(t => 
            t.year === prevYear && 
            !t.quarter && 
            t.month
          );
      
      const prevYearAnnualTarget = revenueTargets.find(t => 
        t.year === prevYear && 
        !t.quarter && 
        !t.month &&
        (customerId ? t.customerId === customerId : !t.customerId)
      );
      
      const calculatedAnnualFromMonthly = prevYearMonthlyTargets.length > 0
        ? prevYearMonthlyTargets.reduce((sum, t) => {
            return sum + (t.actualAmount !== undefined && t.actualAmount !== null ? t.actualAmount : 0);
          }, 0)
        : 0;
      
      const hasAnyMonthlyData = prevYearMonthlyTargets.length > 0;
      const hasAnnualManualData = prevYearAnnualTarget && 
        prevYearAnnualTarget.actualAmount !== undefined && 
        prevYearAnnualTarget.actualAmount !== null &&
        prevYearAnnualTarget.actualAmount > 0;
      
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const monthKey = `${prevYear}-${String(month).padStart(2, '0')}`;
        
        if (hasAnyMonthlyData) {
          const monthTargets = prevYearMonthlyTargets.filter(t => t.month === month);
          if (monthTargets.length > 0) {
            const totalRevenue = monthTargets.reduce((sum, t) => {
              const amount = t.actualAmount !== undefined && t.actualAmount !== null ? t.actualAmount : 0;
              return sum + amount;
            }, 0);
            
            return {
              month: monthKey,
              revenue: totalRevenue,
              count: 0
            };
          }
        }
        
        if (!selectedCustomerForChart && hasAnnualManualData && !hasAnyMonthlyData && prevYearAnnualTarget && calculatedAnnualFromMonthly === 0) {
          return {
            month: monthKey,
            revenue: (prevYearAnnualTarget.actualAmount || 0) / 12,
            count: 0
          };
        }
        
        if (selectedCustomerForChart) {
          return {
            month: monthKey,
            revenue: 0,
            count: 0
          };
        }
        
        if (hasAnyMonthlyData) {
          return {
            month: monthKey,
            revenue: 0,
            count: 0
          };
        }
        
        const monthInvoices = invoices.filter(inv => getMonthKey(inv.date) === monthKey);
        
        return {
          month: monthKey,
          revenue: monthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
          count: monthInvoices.length
        };
      });
    }
    
    return null;
  }, [reportType, selectedQuarter, selectedYear, invoices, selectedCustomerForChart, revenueTargets, customers]);

  const quarterlyBreakdown = useMemo(() => {
    if (reportType === 'year' && selectedYear) {
      const yearNum = parseInt(selectedYear, 10);
      return [1, 2, 3, 4].map(quarter => {
        const quarterMonths = getQuarterMonths(quarter, yearNum);
        const quarterInvoices = invoices.filter(inv => 
          quarterMonths.includes(getMonthKey(inv.date))
        );
        return {
          quarter: `Q${quarter}`,
          revenue: quarterInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
          count: quarterInvoices.length
        };
      });
    }
    return null;
  }, [reportType, selectedYear, invoices]);

  const previousYearQuarterlyBreakdown = useMemo(() => {
    if (reportType === 'year' && selectedYear) {
      const currentYear = parseInt(selectedYear, 10);
      const prevYear = currentYear - 1;
      
      const prevYearQuarterlyTargets = revenueTargets.filter(t => t.year === prevYear && t.quarter);
      const hasManualData = prevYearQuarterlyTargets.some(t => t.actualAmount !== undefined && t.actualAmount !== null);
      
      const prevYearInvoices = invoices.filter(inv => {
        const invYear = parseInt(getYearKey(inv.date), 10);
        return invYear === prevYear;
      });
      const hasInvoiceData = prevYearInvoices.length > 0;
      
      if (!hasManualData && !hasInvoiceData) return null;
      
      return [1, 2, 3, 4].map(quarter => {
        const quarterTarget = prevYearQuarterlyTargets.find(t => t.quarter === quarter);
        if (quarterTarget && quarterTarget.actualAmount !== undefined && quarterTarget.actualAmount !== null) {
          return {
            quarter: `Q${quarter}`,
            revenue: quarterTarget.actualAmount,
            count: 0
          };
        }
        
        const quarterMonths = getQuarterMonths(quarter, prevYear);
        const quarterInvoices = invoices.filter(inv => 
          quarterMonths.includes(getMonthKey(inv.date))
        );
        return {
          quarter: `Q${quarter}`,
          revenue: quarterInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
          count: quarterInvoices.length
        };
      });
    }
    return null;
  }, [reportType, selectedYear, invoices, revenueTargets]);

  // Excel Export Function
  const handleExportExcel = () => {
    try {
      // 計算統計數據
      const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalInvoices = filteredInvoices.length;

      // 獲取時間範圍標籤
      let timeLabel = '';
      if (reportType === 'month') {
        timeLabel = selectedMonth;
      } else if (reportType === 'quarter' && selectedQuarter) {
        const { year, quarter } = parseQuarterKey(selectedQuarter);
        timeLabel = `${year}年 Q${quarter}`;
      } else if (reportType === 'year' && selectedYear) {
        timeLabel = `${selectedYear}年`;
      }

      let excelHTML = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
          <title>營收報表數據</title>
          <style>
            body { 
              font-family: 'Microsoft JhengHei', 'Noto Sans TC', Arial, sans-serif; 
              margin: 20px;
              background-color: #ffffff;
            }
            h1 { 
              font-size: 24px; 
              font-weight: bold; 
              color: #1e293b; 
              margin-bottom: 10px;
              text-align: center;
            }
            h2 { 
              font-size: 18px; 
              font-weight: bold; 
              color: #1e293b; 
              margin-top: 30px; 
              margin-bottom: 15px;
              padding-bottom: 8px;
              border-bottom: 2px solid #f97316;
            }
            p { 
              text-align: center; 
              color: #64748b; 
              font-size: 14px;
              margin-bottom: 20px;
            }
            table { 
              border-collapse: collapse; 
              width: 100%; 
              margin-bottom: 20px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
            .number-cell {
              text-align: right;
              font-family: 'Courier New', monospace;
            }
            .percentage-cell {
              text-align: right;
              font-weight: 600;
              color: #f97316;
            }
            .center-cell {
              text-align: center;
            }
          </style>
        </head>
        <body>
          <h1>營收報表數據 - ${timeLabel}</h1>
          <p><strong>總營收:</strong> ${formatCurrency(totalRevenue)} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>單據數量:</strong> ${totalInvoices} 筆</p>
      `;

      // 客戶營收統計表
      if (customerRevenueDistribution && customerRevenueDistribution.length > 0) {
        excelHTML += `
          <h2 style="margin-top: 30px; color: #1e293b;">客戶營收統計</h2>
          <table>
            <thead>
              <tr>
                <th>客戶名稱</th>
                <th>營收金額</th>
                <th>占比 (%)</th>
                <th>單據數量</th>
              </tr>
            </thead>
            <tbody>
        `;
        customerRevenueDistribution.forEach(customer => {
          excelHTML += `
            <tr>
              <td style="font-weight: 500;">${customer.name}</td>
              <td class="number-cell">${formatCurrency(customer.revenue)}</td>
              <td class="percentage-cell">${customer.percentage.toFixed(2)}%</td>
              <td class="center-cell">${customer.count || 0} 筆</td>
            </tr>
          `;
        });
        excelHTML += `
            </tbody>
          </table>
        `;
      }

      // 服務客戶分析表（如有）
      if (serviceClientDistribution && serviceClientDistribution.distribution.length > 0) {
        excelHTML += `
          <h2 style="margin-top: 30px; color: #1e293b;">${serviceClientDistribution.customerName} - 服務客戶分析</h2>
          <table>
            <thead>
              <tr>
                <th>服務客戶</th>
                <th>營收金額</th>
                <th>占比 (%)</th>
                <th>單據數量</th>
              </tr>
            </thead>
            <tbody>
        `;
        serviceClientDistribution.distribution.forEach(sc => {
          excelHTML += `
            <tr>
              <td>${sc.name}</td>
              <td style="text-align: right;">${formatCurrency(sc.revenue)}</td>
              <td style="text-align: right;">${sc.percentage.toFixed(2)}%</td>
              <td style="text-align: center;">${sc.count} 筆</td>
            </tr>
          `;
        });
        excelHTML += `
            </tbody>
          </table>
        `;
      }

      // 下單人員分析表（如有）
      if (contactPersonDistribution && contactPersonDistribution.distribution.length > 0) {
        excelHTML += `
          <h2 style="margin-top: 30px; color: #1e293b;">${contactPersonDistribution.customerName} - 下單人員分析</h2>
          <table>
            <thead>
              <tr>
                <th>下單人員</th>
                <th>營收金額</th>
                <th>占比 (%)</th>
                <th>單據數量</th>
              </tr>
            </thead>
            <tbody>
        `;
        contactPersonDistribution.distribution.forEach(cp => {
          excelHTML += `
            <tr>
              <td style="font-weight: 500;">${cp.name}</td>
              <td class="number-cell">${formatCurrency(cp.revenue)}</td>
              <td class="percentage-cell" style="color: #16a34a;">${cp.percentage.toFixed(2)}%</td>
              <td class="center-cell">${cp.count || 0} 筆</td>
            </tr>
          `;
        });
        excelHTML += `
            </tbody>
          </table>
        `;
      }

      // 季度/年度月份趨勢表（如有）
      if ((reportType === 'quarter' || reportType === 'year') && monthlyBreakdown && monthlyBreakdown.length > 0) {
        excelHTML += `
          <h2 style="margin-top: 30px; color: #1e293b;">${reportType === 'quarter' ? '季度' : '年度'}月份趨勢</h2>
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th>本期營收</th>
                ${previousYearMonthlyBreakdown ? '<th>去年同期</th><th>成長率 (%)</th>' : ''}
              </tr>
            </thead>
            <tbody>
        `;
        monthlyBreakdown.forEach((item, index) => {
          const prevItem = previousYearMonthlyBreakdown ? previousYearMonthlyBreakdown[index] : null;
          const prevRevenue = prevItem ? prevItem.revenue : 0;
          const growthRate = calculateGrowthRate(item.revenue, prevRevenue);
          const growthColor = growthRate > 0 ? '#10b981' : growthRate < 0 ? '#ef4444' : '#64748b';
          excelHTML += `
            <tr>
              <td style="font-weight: 500;">${item.month}</td>
              <td class="number-cell">${formatCurrency(item.revenue)}</td>
              ${previousYearMonthlyBreakdown ? `
                <td class="number-cell">${prevRevenue > 0 ? formatCurrency(prevRevenue) : '-'}</td>
                <td class="percentage-cell" style="color: ${growthColor};">${prevRevenue > 0 ? (growthRate > 0 ? '+' : '') + growthRate.toFixed(2) + '%' : '-'}</td>
              ` : ''}
            </tr>
          `;
        });
        excelHTML += `
            </tbody>
          </table>
        `;
      }

      // 年度季度趨勢表（如有）
      if (reportType === 'year' && quarterlyBreakdown && quarterlyBreakdown.length > 0) {
        excelHTML += `
          <h2 style="margin-top: 30px; color: #1e293b;">年度季度趨勢</h2>
          <table>
            <thead>
              <tr>
                <th>季度</th>
                <th>營收金額</th>
                <th>單據數量</th>
              </tr>
            </thead>
            <tbody>
        `;
        quarterlyBreakdown.forEach(item => {
          excelHTML += `
            <tr>
              <td style="font-weight: 500;">${item.quarter}</td>
              <td class="number-cell">${formatCurrency(item.revenue)}</td>
              <td class="center-cell">${item.count || 0} 筆</td>
            </tr>
          `;
        });
        excelHTML += `
            </tbody>
          </table>
        `;
      }

      // 每日營收明細表（月報表）- 放在最下方
      if (reportType === 'month' && dailyBreakdown && dailyBreakdown.length > 0) {
        excelHTML += `
          <h2 style="margin-top: 30px; color: #1e293b;">每日營收明細</h2>
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>營收金額</th>
                <th>單據數量</th>
              </tr>
            </thead>
            <tbody>
        `;
        dailyBreakdown.forEach(day => {
          excelHTML += `
            <tr>
              <td style="font-weight: 500;">${selectedMonth}-${String(day.day).padStart(2, '0')}</td>
              <td class="number-cell">${formatCurrency(day.revenue)}</td>
              <td class="center-cell">${day.count || 0} 筆</td>
            </tr>
          `;
        });
        excelHTML += `
            </tbody>
          </table>
        `;
      }

      excelHTML += `
        </body>
        </html>
      `;

      const blob = new Blob([excelHTML], { type: 'application/vnd.ms-excel' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `營收報表數據_${timeLabel.replace(/[\/\\:*?"<>|]/g, '_')}.xls`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Excel export error:', error);
      alert('匯出 Excel 時發生錯誤，請稍後再試。');
    }
  };

  // PDF Export Function (只包含圖表)
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const html2pdf = (window as any).html2pdf;
      if (!html2pdf) {
        alert("PDF 產生器尚未載入，請稍後再試或重新整理頁面。");
        setIsExportingPDF(false);
        return;
      }

      // 計算統計數據
      const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalInvoices = filteredInvoices.length;

      // 獲取時間範圍標籤
      let timeLabel = '';
      if (reportType === 'month') {
        timeLabel = selectedMonth;
      } else if (reportType === 'quarter' && selectedQuarter) {
        const { year, quarter } = parseQuarterKey(selectedQuarter);
        timeLabel = `${year}年 Q${quarter}`;
      } else if (reportType === 'year' && selectedYear) {
        timeLabel = `${selectedYear}年`;
      }

      // 獲取圖表圖片（如果圖表存在）
      const getChartImage = (chartRef: React.RefObject<any>): Promise<string | null> => {
        return new Promise((resolve) => {
          if (!chartRef.current) {
            resolve(null);
            return;
          }
          try {
            // react-chartjs-2 的 ref 結構可能是 chartInstance 或直接是 chart 實例
            let chartInstance = null;
            if (chartRef.current.chartInstance) {
              chartInstance = chartRef.current.chartInstance;
            } else if (chartRef.current.chart) {
              chartInstance = chartRef.current.chart;
            } else if (chartRef.current && typeof chartRef.current.toBase64Image === 'function') {
              chartInstance = chartRef.current;
            }
            
            if (chartInstance && typeof chartInstance.toBase64Image === 'function') {
              const image = chartInstance.toBase64Image('image/png', 1);
              resolve(image);
            } else {
              resolve(null);
            }
          } catch (e) {
            console.error('Error getting chart image:', e);
            resolve(null);
          }
        });
      };

      // 等待圖表渲染完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 獲取所有圖表圖片
      const customerChartImg = await getChartImage(customerChartRef);
      const dailyChartImg = await getChartImage(dailyChartRef);
      const serviceClientChartImg = await getChartImage(serviceClientChartRef);
      const contactPersonChartImg = await getChartImage(contactPersonChartRef);
      const monthlyTrendChartImg = await getChartImage(monthlyTrendChartRef);
      const quarterlyChartImg = await getChartImage(quarterlyChartRef);

      // 創建 PDF HTML 內容（只包含圖表，簡化排版）
      let pdfHTML = `
        <div style="font-family: 'Noto Sans TC', 'Microsoft JhengHei', Arial, sans-serif; padding: 20px; width: 100%; background: white; color: #1e293b; box-sizing: border-box;">
          <div style="text-align: center; margin-bottom: 20px; border-bottom: 3px solid #f97316; padding-bottom: 15px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #1e293b; margin: 0;">營收報表圖表</h1>
            <p style="font-size: 16px; color: #64748b; margin: 8px 0 0 0;">${timeLabel}</p>
          </div>
      `;

      // 客戶營收占比圖表（僅圖表，無表格）
      if (customerRevenueDistribution && customerRevenueDistribution.length > 0 && customerChartImg) {
        pdfHTML += `
          <div style="page-break-inside: avoid; margin-bottom: 30px; break-inside: avoid;">
            <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 15px; text-align: center;">
              ${selectedCustomerForChart ? selectedCustomerForChart + ' - ' : ''}客戶營收占比
            </h2>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${customerChartImg}" style="max-width: 90%; height: auto; display: block; margin: 0 auto;" />
            </div>
          </div>
        `;
      }

      // 每日營收走勢圖表（僅月報表，僅圖表）
      if (reportType === 'month' && dailyBreakdown && dailyBreakdown.length > 0 && dailyChartImg) {
        pdfHTML += `
          <div style="page-break-inside: avoid; margin-bottom: 30px; break-inside: avoid;">
            <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 15px; text-align: center;">
              ${selectedCustomerForChart ? selectedCustomerForChart + ' - ' : ''}每日營收走勢
            </h2>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${dailyChartImg}" style="max-width: 90%; height: auto; display: block; margin: 0 auto;" />
            </div>
          </div>
        `;
      }

      // 服務客戶分析圖表（僅圖表）
      if (serviceClientDistribution && serviceClientDistribution.distribution.length > 0 && serviceClientChartImg) {
        pdfHTML += `
          <div style="page-break-inside: avoid; margin-bottom: 30px; break-inside: avoid;">
            <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 15px; text-align: center;">
              ${serviceClientDistribution.customerName} - 服務客戶營收占比
            </h2>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${serviceClientChartImg}" style="max-width: 90%; height: auto; display: block; margin: 0 auto;" />
            </div>
          </div>
        `;
      }

      // 下單人員分析圖表（僅圖表）
      if (contactPersonDistribution && contactPersonDistribution.distribution.length > 0 && contactPersonChartImg) {
        pdfHTML += `
          <div style="page-break-inside: avoid; margin-bottom: 30px; break-inside: avoid;">
            <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 15px; text-align: center;">
              ${contactPersonDistribution.customerName} - 下單人員營收占比
            </h2>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${contactPersonChartImg}" style="max-width: 90%; height: auto; display: block; margin: 0 auto;" />
            </div>
          </div>
        `;
      }

      // 季度/年度月份趨勢圖表（僅圖表）
      if ((reportType === 'quarter' || reportType === 'year') && monthlyBreakdown && monthlyBreakdown.length > 0 && monthlyTrendChartImg) {
        pdfHTML += `
          <div style="page-break-inside: avoid; margin-bottom: 30px; break-inside: avoid;">
            <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 15px; text-align: center;">
              ${reportType === 'quarter' ? '季度月份趨勢' : '年度月份趨勢'}
            </h2>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${monthlyTrendChartImg}" style="max-width: 90%; height: auto; display: block; margin: 0 auto;" />
            </div>
          </div>
        `;
      }

      // 年度季度趨勢圖表（僅圖表）
      if (reportType === 'year' && quarterlyBreakdown && quarterlyBreakdown.length > 0 && quarterlyChartImg) {
        pdfHTML += `
          <div style="page-break-inside: avoid; margin-bottom: 30px; break-inside: avoid;">
            <h2 style="font-size: 18px; font-weight: bold; color: #1e293b; margin-bottom: 15px; text-align: center;">
              年度季度趨勢
            </h2>
            <div style="text-align: center; margin: 20px 0;">
              <img src="${quarterlyChartImg}" style="max-width: 90%; height: auto; display: block; margin: 0 auto;" />
            </div>
          </div>
        `;
      }

      pdfHTML += `
        </div>
      `;

      // 新方法：創建一個臨時的可見容器，確保 html2canvas 能正確捕獲
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = pdfHTML;
      
      // 設置樣式 - 關鍵：元素必須在視窗內且可見
      Object.assign(tempDiv.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '210mm',
        minHeight: '297mm',
        backgroundColor: 'white',
        color: '#1e293b',
        fontFamily: "'Noto Sans TC', 'Microsoft JhengHei', Arial, sans-serif",
        zIndex: '999999',
        visibility: 'visible',
        opacity: '1',
        pointerEvents: 'none',
        overflow: 'auto',
        boxSizing: 'border-box',
        padding: '20px',
        // 確保元素在視窗內
        transform: 'translateZ(0)', // 強制 GPU 加速
      });
      
      document.body.appendChild(tempDiv);

      // 強制重排
      void tempDiv.offsetHeight;
      void tempDiv.scrollHeight;

      // 等待內容渲染
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 檢查內容
      const hasContent = tempDiv.textContent && tempDiv.textContent.trim().length > 0;
      if (!hasContent) {
        alert('報表內容為空，無法匯出 PDF。請確認已選擇時間範圍並有數據。');
        document.body.removeChild(tempDiv);
        setIsExportingPDF(false);
        return;
      }

      // 載入圖片
      const images = tempDiv.querySelectorAll('img');
      if (images.length > 0) {
        await Promise.all(Array.from(images).map((img) => {
          return new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve(null);
            } else {
              img.onload = () => resolve(null);
              img.onerror = () => resolve(null);
              setTimeout(() => resolve(null), 3000);
            }
          });
        }));
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 獲取實際尺寸
      const rect = tempDiv.getBoundingClientRect();
      const width = Math.max(tempDiv.scrollWidth || 794, 794);
      const height = Math.max(tempDiv.scrollHeight || 1123, 1123);

      console.log('Element dimensions:', { 
        width, 
        height, 
        scrollWidth: tempDiv.scrollWidth, 
        scrollHeight: tempDiv.scrollHeight,
        rect: { width: rect.width, height: rect.height }
      });

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `營收報表_${timeLabel.replace(/[\/\\:*?"<>|]/g, '_')}.pdf`,
        image: { type: 'png', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: false,
          backgroundColor: '#ffffff',
          width: width,
          height: height,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
          useCORS: true,
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' 
        },
        pagebreak: { mode: ['avoid-all', 'css'], avoid: ['img', '.page-break-avoid'] }
      };

      try {
        console.log('Starting PDF generation...');
        await html2pdf().set(opt).from(tempDiv).save();
        console.log('PDF generation completed');
      } catch (error) {
        console.error('PDF generation error:', error);
        alert('匯出 PDF 時發生錯誤：' + (error instanceof Error ? error.message : String(error)));
        throw error;
      } finally {
        if (tempDiv.parentNode) {
          document.body.removeChild(tempDiv);
        }
      }
    } catch (error) {
      console.error('PDF export error:', error);
      alert('匯出 PDF 時發生錯誤，請稍後再試。');
    } finally {
      setIsExportingPDF(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-slate-500 hover:text-brand-600 transition-colors p-1"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">報表分析 Reports</h1>
          </div>
          <p className="text-slate-500 mt-1">查看月報表、季報表與年度報表</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Download className="w-4 h-4" />
            {isExportingPDF ? '匯出中...' : '匯出圖表 PDF'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isExportingPDF}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <FileText className="w-4 h-4" />
            匯出數據 Excel
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setReportType('month')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
              reportType === 'month'
                ? 'bg-brand-500 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            月報表
          </button>
          <button
            onClick={() => setReportType('quarter')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
              reportType === 'quarter'
                ? 'bg-brand-500 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            季報表
          </button>
          <button
            onClick={() => setReportType('year')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
              reportType === 'year'
                ? 'bg-brand-500 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            年報表
          </button>
        </div>

        {/* Time Period Selector */}
        <div className="bg-stone-50 rounded-lg p-4">
          <label className="text-sm text-slate-600 font-medium block mb-2">
            {reportType === 'month' ? '選擇月份' : reportType === 'quarter' ? '選擇季度' : '選擇年份'}
          </label>
          <div className="relative">
            {reportType === 'month' && (
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="appearance-none w-full bg-white border border-stone-200 text-slate-800 text-lg font-bold rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            {reportType === 'quarter' && (
              <select 
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="appearance-none w-full bg-white border border-stone-200 text-slate-800 text-lg font-bold rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer"
              >
                {availableQuarters.map(q => {
                  const { year, quarter } = parseQuarterKey(q);
                  return (
                    <option key={q} value={q}>{year}年 第{quarter}季 (Q{quarter})</option>
                  );
                })}
              </select>
            )}
            {reportType === 'year' && (
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="appearance-none w-full bg-white border border-stone-200 text-slate-800 text-lg font-bold rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
            )}
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-6 rounded-2xl shadow-lg shadow-brand-900/10 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="p-3 rounded-xl bg-white/20 text-white">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-50">Revenue</span>
          </div>
          <div className="relative z-10">
            <p className="text-brand-50 font-medium mb-1">
              {reportType === 'month' ? '本月總營收 (未稅)' : 
               reportType === 'quarter' ? '本季總營收 (未稅)' : 
               '本年總營收 (未稅)'}
            </p>
            <h3 className="text-3xl font-bold tracking-tight">{formatCurrency(totalRevenue)}</h3>
            {growthRateData && growthRateData.rate !== null && (
              <p className="text-brand-50 text-sm mt-1 opacity-90">
                成長率: {formatGrowthRate(growthRateData.rate)}
              </p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between group hover:border-slate-300 transition-colors">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-slate-50 text-slate-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Activity</span>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium block mb-1">
              {reportType === 'month' ? '本月單據數量' : 
               reportType === 'quarter' ? '本季單據數量' : 
               '本年單據數量'}
            </p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold text-slate-800">{filteredInvoices.length}</h3>
              <span className="text-sm text-slate-400">筆交易</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between group hover:border-slate-300 transition-colors">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Customers</span>
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium block mb-1">客戶數量</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold text-slate-800">{customerStats.length}</h3>
              <span className="text-sm text-slate-400">位客戶</span>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Revenue Distribution Pie Chart & Daily Trend (Month Report) */}
      {reportType === 'month' && (
        <div className="space-y-6">
          {/* Customer Filter for Month Report */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 font-medium whitespace-nowrap">篩選客戶:</label>
              <select
                value={selectedCustomerForChart}
                onChange={(e) => setSelectedCustomerForChart(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-w-[180px]"
              >
                <option value="">全部客戶</option>
                {availableCustomersForChart && availableCustomersForChart.map(customerName => (
                  <option key={customerName} value={customerName}>{customerName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Customer Pie Chart */}
            {customerRevenueDistribution && customerRevenueDistribution.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-brand-500" />
                  {selectedCustomerForChart ? `${selectedCustomerForChart} - 客戶營收占比` : `客戶營收占比`} ({selectedMonth})
                </h3>
              <div className="flex-1 min-h-[300px] flex flex-col">
                <div className="h-64 mb-6">
                  <Pie
                    ref={customerChartRef}
                    data={{
                      labels: customerRevenueDistribution.map(c => c.name),
                      datasets: [
                        {
                          data: customerRevenueDistribution.map(c => c.revenue),
                          backgroundColor: [
                            'rgba(249, 115, 22, 0.8)',
                            'rgba(249, 115, 22, 0.6)',
                            'rgba(249, 115, 22, 0.4)',
                            'rgba(249, 115, 22, 0.2)',
                            'rgba(249, 115, 22, 0.1)',
                            'rgba(156, 163, 175, 0.8)',
                            'rgba(156, 163, 175, 0.6)',
                            'rgba(156, 163, 175, 0.4)',
                          ],
                          borderColor: '#ffffff',
                          borderWidth: 2,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (context) => {
                              const customer = customerRevenueDistribution[context.dataIndex];
                              return `${customer.name}: ${formatCurrency(customer.revenue)} (${customer.percentage.toFixed(1)}%)`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
                <div className="flex-1 overflow-y-auto max-h-60 space-y-2 pr-2 custom-scrollbar">
                  {customerRevenueDistribution.map((customer, index) => (
                    <div key={customer.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100/50">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: index < 8 
                              ? ['rgba(249, 115, 22, 0.8)', 'rgba(249, 115, 22, 0.6)', 'rgba(249, 115, 22, 0.4)', 'rgba(249, 115, 22, 0.2)', 'rgba(249, 115, 22, 0.1)', 'rgba(156, 163, 175, 0.8)', 'rgba(156, 163, 175, 0.6)', 'rgba(156, 163, 175, 0.4)'][index]
                              : 'rgba(156, 163, 175, 0.4)'
                          }}
                        ></div>
                        <span className="text-sm font-medium text-slate-700 truncate">{customer.name}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                        <span className="text-sm text-slate-600 font-mono">{formatCurrency(customer.revenue)}</span>
                        <span className="text-sm font-bold text-brand-600 w-14 text-right">{customer.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. Daily Revenue Trend Bar Chart (New Feature) */}
          {dailyBreakdown && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                {selectedCustomerForChart ? `${selectedCustomerForChart} - 每日營收走勢` : `每日營收走勢`} ({selectedMonth})
              </h3>
              <div className="flex-1 min-h-[300px] flex items-center justify-center">
                <Bar
                  ref={dailyChartRef}
                  data={{
                    labels: dailyBreakdown.map(d => `${d.day}日`),
                    datasets: [
                      {
                        label: '當日營收',
                        data: dailyBreakdown.map(d => d.revenue),
                        backgroundColor: (context) => {
                          const value = context.parsed.y;
                          // 週末或高營收可以用不同顏色 (這裡先用統一漸層藍)
                          return 'rgba(59, 130, 246, 0.7)'; 
                        },
                        borderRadius: 4,
                        hoverBackgroundColor: 'rgba(59, 130, 246, 1)',
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          title: (items) => `${selectedMonth}-${items[0].label.replace('日', '')}`,
                          label: (context) => {
                            const data = dailyBreakdown[context.dataIndex];
                            return [
                              `營收: ${formatCurrency(data.revenue)}`,
                              `單據: ${data.count} 筆`
                            ];
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: {
                          font: { size: 10 },
                          maxRotation: 0,
                          autoSkip: true,
                          maxTicksLimit: 15 // 避免日期太擠
                        }
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: {
                          callback: (value) => {
                            if (typeof value === 'number') {
                              return value >= 10000 ? `${(value / 10000).toFixed(0)}萬` : value;
                            }
                            return value;
                          },
                          font: { size: 10 }
                        },
                        border: { display: false }
                      },
                    },
                  }}
                />
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-slate-500 mb-1">最高單日</p>
                  <p className="text-sm font-bold text-slate-800">
                    {(() => {
                      const max = Math.max(...dailyBreakdown.map(d => d.revenue));
                      return max > 0 ? formatCurrency(max) : '-';
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">日均營收</p>
                  <p className="text-sm font-bold text-slate-800">
                    {(() => {
                      const daysInMonth = new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]), 0).getDate();
                      const revenueToCalculate = selectedCustomerForChart 
                        ? filteredInvoices.filter(inv => inv.customerName === selectedCustomerForChart).reduce((sum, inv) => sum + inv.totalAmount, 0)
                        : totalRevenue;
                      return formatCurrency(revenueToCalculate / daysInMonth);
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">活躍天數</p>
                  <p className="text-sm font-bold text-slate-800">
                    {dailyBreakdown.filter(d => d.revenue > 0).length} 天
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3. Service Client Distribution (僅當選擇康士藤客戶時顯示) */}
          {serviceClientDistribution && serviceClientDistribution.distribution.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col lg:col-span-2">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-500" />
                {serviceClientDistribution.customerName} - 服務客戶營收占比 ({serviceClientDistribution.timeLabel})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 圓餅圖 */}
                <div className="flex-1 min-h-[300px] flex flex-col">
                  <div className="h-64 mb-6">
                    <Pie
                      ref={serviceClientChartRef}
                      data={{
                        labels: serviceClientDistribution.distribution.map(sc => sc.name),
                        datasets: [
                          {
                            data: serviceClientDistribution.distribution.map(sc => sc.revenue),
                            backgroundColor: [
                              'rgba(168, 85, 247, 0.8)',
                              'rgba(168, 85, 247, 0.6)',
                              'rgba(168, 85, 247, 0.4)',
                              'rgba(168, 85, 247, 0.2)',
                              'rgba(168, 85, 247, 0.1)',
                              'rgba(139, 92, 246, 0.8)',
                              'rgba(139, 92, 246, 0.6)',
                              'rgba(139, 92, 246, 0.4)',
                            ],
                            borderColor: '#ffffff',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                const serviceClient = serviceClientDistribution.distribution[context.dataIndex];
                                return `${serviceClient.name}: ${formatCurrency(serviceClient.revenue)} (${serviceClient.percentage.toFixed(1)}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
                
                {/* 服務客戶列表 */}
                <div className="flex-1 overflow-y-auto max-h-80 space-y-2 pr-2 custom-scrollbar">
                  <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-purple-700">{serviceClientDistribution.customerName} 總營收</span>
                      <span className="text-lg font-bold text-purple-800">{formatCurrency(serviceClientDistribution.totalRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-purple-600">單據數量</span>
                      <span className="text-sm font-semibold text-purple-700">{serviceClientDistribution.totalInvoices} 筆</span>
                    </div>
                  </div>
                  {serviceClientDistribution.distribution.map((serviceClient, index) => (
                    <div key={serviceClient.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100/50 hover:bg-purple-50/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: index < 8 
                              ? ['rgba(168, 85, 247, 0.8)', 'rgba(168, 85, 247, 0.6)', 'rgba(168, 85, 247, 0.4)', 'rgba(168, 85, 247, 0.2)', 'rgba(168, 85, 247, 0.1)', 'rgba(139, 92, 246, 0.8)', 'rgba(139, 92, 246, 0.6)', 'rgba(139, 92, 246, 0.4)'][index]
                              : 'rgba(139, 92, 246, 0.4)'
                          }}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700 block truncate">{serviceClient.name}</span>
                          <span className="text-xs text-slate-500">{serviceClient.count} 筆單據</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                        <div className="text-right">
                          <div className="text-sm text-slate-600 font-mono">{formatCurrency(serviceClient.revenue)}</div>
                          <div className="text-xs text-purple-600 font-semibold">{serviceClient.percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4. Contact Person Distribution (僅當選擇康士藤客戶時顯示) */}
          {contactPersonDistribution && contactPersonDistribution.distribution.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col lg:col-span-2">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-green-500" />
                {contactPersonDistribution.customerName} - 下單人員營收占比 ({contactPersonDistribution.timeLabel})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 圓餅圖 */}
                <div className="flex-1 min-h-[300px] flex flex-col">
                  <div className="h-64 mb-6">
                    <Pie
                      ref={contactPersonChartRef}
                      data={{
                        labels: contactPersonDistribution.distribution.map(cp => cp.name),
                        datasets: [
                          {
                            data: contactPersonDistribution.distribution.map(cp => cp.revenue),
                            backgroundColor: [
                              'rgba(34, 197, 94, 0.8)',
                              'rgba(34, 197, 94, 0.6)',
                              'rgba(34, 197, 94, 0.4)',
                              'rgba(34, 197, 94, 0.2)',
                              'rgba(34, 197, 94, 0.1)',
                              'rgba(22, 163, 74, 0.8)',
                              'rgba(22, 163, 74, 0.6)',
                              'rgba(22, 163, 74, 0.4)',
                            ],
                            borderColor: '#ffffff',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                const contactPerson = contactPersonDistribution.distribution[context.dataIndex];
                                return `${contactPerson.name}: ${formatCurrency(contactPerson.revenue)} (${contactPerson.percentage.toFixed(1)}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
                
                {/* 下單人員列表 */}
                <div className="flex-1 overflow-y-auto max-h-80 space-y-2 pr-2 custom-scrollbar">
                  <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-700">{contactPersonDistribution.customerName} 總營收</span>
                      <span className="text-lg font-bold text-green-800">{formatCurrency(contactPersonDistribution.totalRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-green-600">單據數量</span>
                      <span className="text-sm font-semibold text-green-700">{contactPersonDistribution.totalInvoices} 筆</span>
                    </div>
                  </div>
                  {contactPersonDistribution.distribution.map((contactPerson, index) => (
                    <div key={contactPerson.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100/50 hover:bg-green-50/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: index < 8 
                              ? ['rgba(34, 197, 94, 0.8)', 'rgba(34, 197, 94, 0.6)', 'rgba(34, 197, 94, 0.4)', 'rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0.1)', 'rgba(22, 163, 74, 0.8)', 'rgba(22, 163, 74, 0.6)', 'rgba(22, 163, 74, 0.4)'][index]
                              : 'rgba(22, 163, 74, 0.4)'
                          }}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700 block truncate">{contactPerson.name}</span>
                          <span className="text-xs text-slate-500">{contactPerson.count} 筆單據</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                        <div className="text-right">
                          <div className="text-sm text-slate-600 font-mono">{formatCurrency(contactPerson.revenue)}</div>
                          <div className="text-xs text-green-600 font-semibold">{contactPerson.percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* Charts Section - Show for quarter and year reports only (NOT for month reports) */}
      {(reportType === 'quarter' || reportType === 'year') && (monthlyBreakdown || previousYearMonthlyBreakdown) && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-500" />
              {reportType === 'quarter' ? '季度月份趨勢' : '年度月份趨勢'}
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 font-medium whitespace-nowrap">篩選客戶:</label>
              <select
                value={selectedCustomerForChart}
                onChange={(e) => setSelectedCustomerForChart(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-w-[180px]"
              >
                <option value="">全部客戶</option>
                {availableCustomersForChart && availableCustomersForChart.map(customerName => (
                  <option key={customerName} value={customerName}>{customerName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="h-64">
            <Line
              ref={monthlyTrendChartRef}
              data={{
                labels: (monthlyBreakdown || previousYearMonthlyBreakdown || []).map(m => {
                  const [year, month] = m.month.split('-');
                  return `${parseInt(month, 10)}月`;
                }).filter((label, index, self) => self.indexOf(label) === index),
                datasets: [
                  {
                    label: reportType === 'year' 
                      ? (selectedCustomerForChart ? `${selectedCustomerForChart} ${selectedYear}年營收` : `${selectedYear}年總營收`)
                      : (selectedCustomerForChart ? `${selectedCustomerForChart} ${selectedQuarter}營收` : `${selectedQuarter}總營收`),
                    data: (monthlyBreakdown || []).map(m => m.revenue),
                    borderColor: 'rgb(249, 115, 22)',
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    tension: 0.4,
                  },
                  ...(previousYearMonthlyBreakdown ? [{
                    label: reportType === 'year'
                      ? (selectedCustomerForChart ? `${selectedCustomerForChart} ${parseInt(selectedYear, 10) - 1}年營收` : `${parseInt(selectedYear, 10) - 1}年總營收`)
                      : (() => {
                          const { year } = parseQuarterKey(selectedQuarter);
                          const prevYear = year - 1;
                          return selectedCustomerForChart
                            ? `${selectedCustomerForChart} ${prevYear} Q${parseQuarterKey(selectedQuarter).quarter}營收`
                            : `${prevYear} Q${parseQuarterKey(selectedQuarter).quarter}總營收`;
                        })(),
                    data: previousYearMonthlyBreakdown.map(m => m.revenue),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderDash: [],
                    borderWidth: 2,
                    tension: 0.4,
                  }] : []),
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: true,
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => `${context.dataset.label || '營收'}: ${formatCurrency(context.parsed.y)}`,
                    },
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => formatCurrency(value as number),
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Detailed Data Analysis Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
             <h3 className="font-bold text-slate-800 flex items-center gap-2">
               <FileText className="w-5 h-5 text-brand-500" />
               詳細數據分析表
             </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 font-semibold">月份</th>
                  <th className="px-6 py-3 font-semibold text-right">本期營收</th>
                  <th className="px-6 py-3 font-semibold text-right">去年同期</th>
                  <th className="px-6 py-3 font-semibold text-right">差異金額</th>
                  <th className="px-6 py-3 font-semibold text-right">成長率</th>
                </tr>
              </thead>
              <tbody>
                {(monthlyBreakdown || []).map((item, index) => {
                  const prevItem = previousYearMonthlyBreakdown ? previousYearMonthlyBreakdown[index] : null;
                  const currentRevenue = item.revenue;
                  const prevRevenue = prevItem ? prevItem.revenue : 0;
                  const diff = currentRevenue - prevRevenue;
                  const growthRate = calculateGrowthRate(currentRevenue, prevRevenue);
                  const [year, month] = item.month.split('-');

                  return (
                    <tr key={item.month} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {parseInt(month, 10)}月
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                        {formatCurrency(currentRevenue)}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-500">
                        {prevRevenue > 0 ? formatCurrency(prevRevenue) : '-'}
                      </td>
                      <td className={`px-6 py-4 text-right font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {prevRevenue > 0 ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            growthRate > 0 ? 'bg-green-100 text-green-800' : growthRate < 0 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {growthRate > 0 ? '+' : ''}{growthRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="bg-slate-50 font-bold border-t border-slate-200">
                  <td className="px-6 py-4 text-slate-900">總計</td>
                  <td className="px-6 py-4 text-right text-brand-600">
                    {formatCurrency((monthlyBreakdown || []).reduce((sum, item) => sum + item.revenue, 0))}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600">
                    {formatCurrency((previousYearMonthlyBreakdown || []).reduce((sum, item) => sum + item.revenue, 0))}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {(() => {
                      const totalCurrent = (monthlyBreakdown || []).reduce((sum, item) => sum + item.revenue, 0);
                      const totalPrev = (previousYearMonthlyBreakdown || []).reduce((sum, item) => sum + item.revenue, 0);
                      const diff = totalCurrent - totalPrev;
                      return (
                        <span className={`${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                          {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-right">
                     {(() => {
                      const totalCurrent = (monthlyBreakdown || []).reduce((sum, item) => sum + item.revenue, 0);
                      const totalPrev = (previousYearMonthlyBreakdown || []).reduce((sum, item) => sum + item.revenue, 0);
                      const rate = calculateGrowthRate(totalCurrent, totalPrev);
                      return totalPrev > 0 ? (
                        <span className={`${rate > 0 ? 'text-green-600' : rate < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                           {rate > 0 ? '+' : ''}{rate.toFixed(1)}%
                        </span>
                      ) : '-';
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* Quarterly Breakdown Chart for Year Reports */}
      {reportType === 'year' && quarterlyBreakdown && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-brand-500" />
            季度分布 {previousYearQuarterlyBreakdown && `(${selectedYear} vs ${parseInt(selectedYear, 10) - 1})`}
          </h3>
          <div className="h-64">
            <Bar
              ref={quarterlyChartRef}
              data={{
                labels: quarterlyBreakdown.map(q => q.quarter),
                datasets: [
                  {
                    label: `${selectedYear}年季度營收`,
                    data: quarterlyBreakdown.map(q => q.revenue),
                    backgroundColor: [
                      'rgba(249, 115, 22, 0.8)',
                      'rgba(249, 115, 22, 0.6)',
                      'rgba(249, 115, 22, 0.4)',
                      'rgba(249, 115, 22, 0.2)',
                    ],
                    borderColor: [
                      'rgb(249, 115, 22)',
                      'rgb(249, 115, 22)',
                      'rgb(249, 115, 22)',
                      'rgb(249, 115, 22)',
                    ],
                    borderWidth: 1,
                  },
                  ...(previousYearQuarterlyBreakdown ? [{
                    label: `${parseInt(selectedYear, 10) - 1}年季度營收`,
                    data: previousYearQuarterlyBreakdown.map(q => q.revenue),
                    backgroundColor: [
                      'rgba(156, 163, 175, 0.8)',
                      'rgba(156, 163, 175, 0.6)',
                      'rgba(156, 163, 175, 0.4)',
                      'rgba(156, 163, 175, 0.2)',
                    ],
                    borderColor: [
                      'rgb(156, 163, 175)',
                      'rgb(156, 163, 175)',
                      'rgb(156, 163, 175)',
                      'rgb(156, 163, 175)',
                    ],
                    borderWidth: 1,
                  }] : []),
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: previousYearQuarterlyBreakdown !== null,
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => `${context.dataset.label || '季度營收'}: ${formatCurrency(context.parsed.y)}`,
                    },
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => formatCurrency(value as number),
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Service Client & Contact Person Distribution (季報表/年報表 - 僅當選擇康士藤客戶時顯示) */}
      {(reportType === 'quarter' || reportType === 'year') && (
        <div className="space-y-6">
          {/* Service Client Distribution */}
          {serviceClientDistribution && serviceClientDistribution.distribution.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-500" />
                {serviceClientDistribution.customerName} - 服務客戶營收占比 ({serviceClientDistribution.timeLabel})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 圓餅圖 */}
                <div className="flex-1 min-h-[300px] flex flex-col">
                  <div className="h-64 mb-6">
                    <Pie
                      data={{
                        labels: serviceClientDistribution.distribution.map(sc => sc.name),
                        datasets: [
                          {
                            data: serviceClientDistribution.distribution.map(sc => sc.revenue),
                            backgroundColor: [
                              'rgba(168, 85, 247, 0.8)',
                              'rgba(168, 85, 247, 0.6)',
                              'rgba(168, 85, 247, 0.4)',
                              'rgba(168, 85, 247, 0.2)',
                              'rgba(168, 85, 247, 0.1)',
                              'rgba(139, 92, 246, 0.8)',
                              'rgba(139, 92, 246, 0.6)',
                              'rgba(139, 92, 246, 0.4)',
                            ],
                            borderColor: '#ffffff',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                const serviceClient = serviceClientDistribution.distribution[context.dataIndex];
                                return `${serviceClient.name}: ${formatCurrency(serviceClient.revenue)} (${serviceClient.percentage.toFixed(1)}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
                
                {/* 服務客戶列表 */}
                <div className="flex-1 overflow-y-auto max-h-80 space-y-2 pr-2 custom-scrollbar">
                  <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-purple-700">{serviceClientDistribution.customerName} 總營收</span>
                      <span className="text-lg font-bold text-purple-800">{formatCurrency(serviceClientDistribution.totalRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-purple-600">單據數量</span>
                      <span className="text-sm font-semibold text-purple-700">{serviceClientDistribution.totalInvoices} 筆</span>
                    </div>
                  </div>
                  {serviceClientDistribution.distribution.map((serviceClient, index) => (
                    <div key={serviceClient.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100/50 hover:bg-purple-50/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: index < 8 
                              ? ['rgba(168, 85, 247, 0.8)', 'rgba(168, 85, 247, 0.6)', 'rgba(168, 85, 247, 0.4)', 'rgba(168, 85, 247, 0.2)', 'rgba(168, 85, 247, 0.1)', 'rgba(139, 92, 246, 0.8)', 'rgba(139, 92, 246, 0.6)', 'rgba(139, 92, 246, 0.4)'][index]
                              : 'rgba(139, 92, 246, 0.4)'
                          }}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700 block truncate">{serviceClient.name}</span>
                          <span className="text-xs text-slate-500">{serviceClient.count} 筆單據</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                        <div className="text-right">
                          <div className="text-sm text-slate-600 font-mono">{formatCurrency(serviceClient.revenue)}</div>
                          <div className="text-xs text-purple-600 font-semibold">{serviceClient.percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Contact Person Distribution */}
          {contactPersonDistribution && contactPersonDistribution.distribution.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-green-500" />
                {contactPersonDistribution.customerName} - 下單人員營收占比 ({contactPersonDistribution.timeLabel})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 圓餅圖 */}
                <div className="flex-1 min-h-[300px] flex flex-col">
                  <div className="h-64 mb-6">
                    <Pie
                      data={{
                        labels: contactPersonDistribution.distribution.map(cp => cp.name),
                        datasets: [
                          {
                            data: contactPersonDistribution.distribution.map(cp => cp.revenue),
                            backgroundColor: [
                              'rgba(34, 197, 94, 0.8)',
                              'rgba(34, 197, 94, 0.6)',
                              'rgba(34, 197, 94, 0.4)',
                              'rgba(34, 197, 94, 0.2)',
                              'rgba(34, 197, 94, 0.1)',
                              'rgba(22, 163, 74, 0.8)',
                              'rgba(22, 163, 74, 0.6)',
                              'rgba(22, 163, 74, 0.4)',
                            ],
                            borderColor: '#ffffff',
                            borderWidth: 2,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                const contactPerson = contactPersonDistribution.distribution[context.dataIndex];
                                return `${contactPerson.name}: ${formatCurrency(contactPerson.revenue)} (${contactPerson.percentage.toFixed(1)}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
                
                {/* 下單人員列表 */}
                <div className="flex-1 overflow-y-auto max-h-80 space-y-2 pr-2 custom-scrollbar">
                  <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-700">{contactPersonDistribution.customerName} 總營收</span>
                      <span className="text-lg font-bold text-green-800">{formatCurrency(contactPersonDistribution.totalRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-green-600">單據數量</span>
                      <span className="text-sm font-semibold text-green-700">{contactPersonDistribution.totalInvoices} 筆</span>
                    </div>
                  </div>
                  {contactPersonDistribution.distribution.map((contactPerson, index) => (
                    <div key={contactPerson.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100/50 hover:bg-green-50/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div 
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: index < 8 
                              ? ['rgba(34, 197, 94, 0.8)', 'rgba(34, 197, 94, 0.6)', 'rgba(34, 197, 94, 0.4)', 'rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0.1)', 'rgba(22, 163, 74, 0.8)', 'rgba(22, 163, 74, 0.6)', 'rgba(22, 163, 74, 0.4)'][index]
                              : 'rgba(22, 163, 74, 0.4)'
                          }}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-700 block truncate">{contactPerson.name}</span>
                          <span className="text-xs text-slate-500">{contactPerson.count} 筆單據</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                        <div className="text-right">
                          <div className="text-sm text-slate-600 font-mono">{formatCurrency(contactPerson.revenue)}</div>
                          <div className="text-xs text-green-600 font-semibold">{contactPerson.percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;
