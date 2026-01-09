import { InvoiceItem, PricingRule, PricingTier, PriceCategory } from '../types';

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

export const generateSerialNumber = (
  lastSerial?: string, 
  continuous: boolean = false,
  customerStartSerial?: number
): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const prefix = `${year}${month}${day}`;

  if (lastSerial) {
    if (continuous) {
      // Continuous mode: always increment from last sequence number regardless of date
      const sequence = parseInt(lastSerial.slice(-4), 10) || 0;
      return `${prefix}${String(sequence + 1).padStart(4, '0')}`;
    } else {
      // Original mode: only increment if same date prefix
      if (lastSerial.startsWith(prefix)) {
        const sequence = parseInt(lastSerial.slice(-4), 10);
        return `${prefix}${String(sequence + 1).padStart(4, '0')}`;
      }
    }
  }

  // If no last serial and customer has start serial, use it (minus 1, so first invoice will be startSerial)
  if (customerStartSerial !== undefined && customerStartSerial > 0) {
    const startSeq = Math.max(0, customerStartSerial - 1); // Subtract 1 so first invoice uses startSerial
    return `${prefix}${String(startSeq).padStart(4, '0')}`;
  }

  return `${prefix}0001`;
};

// Generate serial number for a specific customer based on their invoices
// Price lookup function - finds the appropriate price based on customer, specification, and quantity
export const findPriceForProduct = (
  productId: string,
  quantity: number,
  specification?: string,
  customerId?: string,
  customerPriceCategory?: PriceCategory,
  pricingRules: PricingRule[] = []
): number | null => {
  if (!pricingRules || pricingRules.length === 0) return null;
  
  // Filter active rules for this product
  const productRules = pricingRules.filter(rule => 
    rule.productId === productId && rule.isActive
  );
  
  if (productRules.length === 0) return null;
  
  // Priority order (with specification matching):
  // 1. Customer-specific + Specification
  // 2. Customer-specific (any specification)
  // 3. Price category + Specification
  // 4. Price category (any specification)
  // 5. General + Specification
  // 6. General (any specification)
  
  // Priority 1: Customer-specific rule with matching specification
  if (customerId && specification) {
    const customerSpecRule = productRules.find(rule => 
      rule.customerId === customerId && rule.specification === specification
    );
    if (customerSpecRule) {
      return findPriceInTiers(customerSpecRule.tiers, quantity, customerSpecRule.basePrice);
    }
  }
  
  // Priority 2: Customer-specific rule (any specification)
  if (customerId) {
    const customerRule = productRules.find(rule => 
      rule.customerId === customerId && !rule.specification
    );
    if (customerRule) {
      return findPriceInTiers(customerRule.tiers, quantity, customerRule.basePrice);
    }
  }
  
  // Priority 3: Price category rule with matching specification
  if (customerPriceCategory && specification) {
    const categorySpecRule = productRules.find(rule => 
      rule.priceCategory === customerPriceCategory && 
      !rule.customerId && 
      rule.specification === specification
    );
    if (categorySpecRule) {
      return findPriceInTiers(categorySpecRule.tiers, quantity, categorySpecRule.basePrice);
    }
  }
  
  // Priority 4: Price category rule (any specification)
  if (customerPriceCategory) {
    const categoryRule = productRules.find(rule => 
      rule.priceCategory === customerPriceCategory && 
      !rule.customerId && 
      !rule.specification
    );
    if (categoryRule) {
      return findPriceInTiers(categoryRule.tiers, quantity, categoryRule.basePrice);
    }
  }
  
  // Priority 5: General rule with matching specification
  if (specification) {
    const generalSpecRule = productRules.find(rule => 
      !rule.priceCategory && 
      !rule.customerId && 
      rule.specification === specification
    );
    if (generalSpecRule) {
      return findPriceInTiers(generalSpecRule.tiers, quantity, generalSpecRule.basePrice);
    }
  }
  
  // Priority 6: General rule (no category, no customer, no specification)
  const generalRule = productRules.find(rule => 
    !rule.priceCategory && 
    !rule.customerId && 
    !rule.specification
  );
  if (generalRule) {
    return findPriceInTiers(generalRule.tiers, quantity, generalRule.basePrice);
  }
  
  // Fallback: Return first available rule
  if (productRules.length > 0) {
    const fallbackRule = productRules[0];
    return findPriceInTiers(fallbackRule.tiers, quantity, fallbackRule.basePrice);
  }
  
  return null;
};

// Helper function to find price in tiers based on quantity
const findPriceInTiers = (
  tiers: PricingTier[],
  quantity: number,
  basePrice: number
): number => {
  if (!tiers || tiers.length === 0) return basePrice;
  
  // Sort tiers by minQuantity to ensure proper matching
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  
  // Find the matching tier
  for (let i = sortedTiers.length - 1; i >= 0; i--) {
    const tier = sortedTiers[i];
    if (quantity >= tier.minQuantity) {
      // Check if within maxQuantity (if specified)
      if (tier.maxQuantity === undefined || tier.maxQuantity === null || quantity <= tier.maxQuantity) {
        return tier.price;
      }
    }
  }
  
  // If no tier matches and quantity is less than the smallest tier, return base price
  if (quantity < sortedTiers[0].minQuantity) {
    return basePrice;
  }
  
  // If quantity exceeds all tiers' maxQuantity, use the last tier's price
  if (sortedTiers.length > 0) {
    const lastTier = sortedTiers[sortedTiers.length - 1];
    if (lastTier.maxQuantity !== undefined && lastTier.maxQuantity !== null && quantity > lastTier.maxQuantity) {
      return lastTier.price;
    }
  }
  
  return basePrice;
};

// Generate a short unique identifier from customer ID
const getCustomerCode = (customerId: string): string => {
  // Use first 4 characters of customer ID (uppercase, alphanumeric only)
  // If ID is shorter, pad with 0s
  const cleaned = customerId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.substring(0, 4).padEnd(4, '0');
};

export const generateCustomerSerialNumber = (
  customerName: string,
  customerId: string,
  customerInvoices: Array<{ serialNumber: string }>,
  customerStartSerial?: number, // 保留參數以向後兼容，但不再使用
  customerTier?: string
): string => {
  // Determine prefix based on customer tier
  // 'industry' = 同業 (Trade Customer) -> TC
  // Others = 一般公司 (Company) -> CP
  const tierPrefix = customerTier === 'industry' ? 'TC' : 'CP';
  
  // Get unique customer code (4 characters from customer ID)
  const customerCode = getCustomerCode(customerId);
  
  // Format: [TierPrefix][CustomerCode][SequenceNumber(5 digits)]
  // Example: CPABCD00001, TC123400001
  const basePrefix = `${tierPrefix}${customerCode}`;

  // Find the latest invoice for this customer with matching prefix
  if (customerInvoices.length > 0) {
    // Filter invoices with the same base prefix
    const matchingInvoices = customerInvoices.filter(inv => {
      return inv.serialNumber.startsWith(basePrefix);
    });

    if (matchingInvoices.length > 0) {
      // Extract sequence numbers (last 5 digits)
      const sortedInvoices = [...matchingInvoices].sort((a, b) => {
        const seqA = parseInt(a.serialNumber.slice(-5), 10) || 0;
        const seqB = parseInt(b.serialNumber.slice(-5), 10) || 0;
        return seqB - seqA;
      });
      const lastInvoice = sortedInvoices[0];
      const lastSequence = parseInt(lastInvoice.serialNumber.slice(-5), 10) || 0;
      return `${basePrefix}${String(lastSequence + 1).padStart(5, '0')}`;
    }
  }

  // No invoices yet - always start from 00001 (system auto-set)
  // Note: customerStartSerial parameter is kept for backward compatibility but no longer used
  return `${basePrefix}00001`;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const calculateTotal = (items: InvoiceItem[]): number => {
  return items.reduce((sum, item) => sum + item.amount, 0);
};

export const getMonthKey = (dateString: string): string => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Get quarter key from date string (format: YYYY-Q1, YYYY-Q2, etc.)
export const getQuarterKey = (dateString: string): string => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const quarter = Math.floor((month - 1) / 3) + 1; // 1-4
  return `${year}-Q${quarter}`;
};

// Get year key from date string (format: YYYY)
export const getYearKey = (dateString: string): string => {
  const date = new Date(dateString);
  return String(date.getFullYear());
};

// Get months in a quarter (returns array of month keys)
export const getQuarterMonths = (quarter: number, year: number): string[] => {
  const months: string[] = [];
  const startMonth = (quarter - 1) * 3 + 1; // Q1=1, Q2=4, Q3=7, Q4=10
  for (let i = 0; i < 3; i++) {
    const month = startMonth + i;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
};

// Parse quarter key to get quarter number and year
export const parseQuarterKey = (quarterKey: string): { year: number; quarter: number } => {
  const match = quarterKey.match(/^(\d{4})-Q(\d)$/);
  if (!match) throw new Error(`Invalid quarter key format: ${quarterKey}`);
  return { year: parseInt(match[1], 10), quarter: parseInt(match[2], 10) };
};

// Calculate growth rate (percentage change)
export const calculateGrowthRate = (current: number, previous: number): number | null => {
  if (previous === 0) return current > 0 ? 100 : null; // If previous is 0, return 100% if current > 0, else null
  return ((current - previous) / previous) * 100;
};

// Format growth rate as string with percentage and arrow
export const formatGrowthRate = (rate: number | null): string => {
  if (rate === null) return '-';
  const sign = rate >= 0 ? '+' : '';
  const arrow = rate >= 0 ? '↑' : '↓';
  return `${sign}${rate.toFixed(1)}% ${arrow}`;
};

// Get all available quarters from invoices
export const getAvailableQuarters = (invoices: Array<{ date: string }>): string[] => {
  const quarters = new Set<string>();
  invoices.forEach(inv => quarters.add(getQuarterKey(inv.date)));
  return Array.from(quarters).sort().reverse();
};

// Get all available years from invoices
export const getAvailableYears = (invoices: Array<{ date: string }>): string[] => {
  const years = new Set<string>();
  invoices.forEach(inv => years.add(getYearKey(inv.date)));
  return Array.from(years).sort().reverse();
};
