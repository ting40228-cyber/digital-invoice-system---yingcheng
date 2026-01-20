import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  getDocs,
  Timestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  updatePassword as firebaseUpdatePassword,
  createUserWithEmailAndPassword,
  User,
  onAuthStateChanged
} from 'firebase/auth';
import { db, auth } from '../firebase';
import { Invoice, Customer, Product, CompanySettings, RevenueTarget, PricingRule, PricingRuleHistory } from '../types';
import { sanitizeForFirestore } from '../utils/helpers';

// Collection Names
const COLL_INVOICES = 'invoices';
const COLL_CUSTOMERS = 'customers';
const COLL_PRODUCTS = 'products';
const COLL_SETTINGS = 'settings';
const COLL_REVENUE_TARGETS = 'revenueTargets';
const COLL_PRICING_RULES = 'pricingRules';
const COLL_PRICING_HISTORY = 'pricingRuleHistory';
const COLL_USER_ROLES = 'userRoles'; // 儲存用戶角色對應

export interface UserRole {
  email: string;
  role: 'owner' | 'staff';
}

export interface AdminSettings {
  ownerEmail?: string;
  staffEmail?: string;
  // 保留向後兼容，但不再使用
  owner?: { email?: string; password?: string };
  staff?: { email?: string; password?: string };
}

// --- Firebase Authentication ---

/**
 * 登入並返回用戶角色
 */
export const login = async (email: string, password: string): Promise<'owner' | 'staff'> => {
  // 處理預設管理員密碼轉換：'admin' -> 'admin123' (Firebase 要求至少 6 個字元)
  const actualPassword = (email === 'admin@example.com' && password === 'admin') ? 'admin123' : password;
  
  try {
    // 先嘗試用實際密碼登入
    const userCredential = await signInWithEmailAndPassword(auth, email, actualPassword);
    const user = userCredential.user;
    
    // 從 Firestore 獲取用戶角色
    const roleDoc = await getDocs(
      query(collection(db, COLL_USER_ROLES), where('email', '==', email))
    );
    
    // 如果已有角色記錄，更新為 owner（確保所有用戶都是管理者）
    // 所有成功登入的用戶都是管理者
    if (!roleDoc.empty) {
      const roleData = roleDoc.docs[0].data() as UserRole;
      // 如果當前角色不是 owner，更新為 owner
      if (roleData.role !== 'owner') {
        await updateDoc(roleDoc.docs[0].ref, {
          role: 'owner',
          updatedAt: Timestamp.now()
        });
      }
      return 'owner';
    }
    
    // 如果沒有角色記錄，創建為管理者
    await setDoc(doc(db, COLL_USER_ROLES, user.uid), {
      email: user.email,
      role: 'owner', // 所有用戶都是管理者
      createdAt: Timestamp.now()
    });
    return 'owner';
  } catch (error: any) {
    // 直接拋出錯誤，不自動創建帳號
    throw error;
  }
};

/**
 * 登出
 */
export const logout = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

/**
 * 訂閱認證狀態變化
 */
export const subscribeAuth = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * 獲取當前用戶角色
 */
export const getCurrentUserRole = async (user: User): Promise<'owner' | 'staff' | null> => {
  const roleDoc = await getDocs(
    query(collection(db, COLL_USER_ROLES), where('email', '==', user.email))
  );
  
  if (!roleDoc.empty) {
    const roleData = roleDoc.docs[0].data() as UserRole;
    return roleData.role;
  }
  
  return null;
};

/**
 * 更新用戶密碼
 */
export const changePassword = async (user: User, newPassword: string): Promise<void> => {
  await firebaseUpdatePassword(user, newPassword);
};

/**
 * 創建新用戶（僅管理員可用）
 */
export const createUser = async (email: string, password: string, role: 'owner' | 'staff'): Promise<User> => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  
  // 儲存角色資訊（所有用戶都是管理者）
  await setDoc(doc(db, COLL_USER_ROLES, userCredential.user.uid), {
    email: email,
    role: 'owner', // 所有用戶都是管理者，忽略傳入的 role 參數
    createdAt: Timestamp.now()
  });
  
  return userCredential.user;
};

/**
 * 更新用戶角色（僅管理員可用）
 */
export const updateUserRole = async (email: string, role: 'owner' | 'staff'): Promise<void> => {
  const roleDoc = await getDocs(
    query(collection(db, COLL_USER_ROLES), where('email', '==', email))
  );
  
  if (!roleDoc.empty) {
    // 所有用戶都是管理者，強制設置為 owner
    await updateDoc(roleDoc.docs[0].ref, {
      role: 'owner',
      updatedAt: Timestamp.now()
    });
  } else {
    // 如果不存在，創建新記錄（需要先有 Firebase Auth 用戶）
    throw new Error('用戶不存在，請先創建 Firebase Auth 帳號');
  }
};

/**
 * 訂閱管理員設定（向後兼容）
 */
export const subscribeAdminSettings = (callback: (settings: AdminSettings | null) => void) => {
  const ref = doc(db, COLL_SETTINGS, 'auth');
  return onSnapshot(ref, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as AdminSettings);
    } else {
      callback(null);
    }
  });
};

/**
 * 儲存管理員設定（向後兼容，僅儲存郵件，不儲存密碼）
 */
export const saveAdminSettings = async (settings: AdminSettings) => {
  const ref = doc(db, COLL_SETTINGS, 'auth');
  // 只儲存郵件，不儲存密碼
  const safeSettings: AdminSettings = {
    ownerEmail: settings.ownerEmail || settings.owner?.email,
    staffEmail: settings.staffEmail || settings.staff?.email,
  };
  await setDoc(ref, sanitizeForFirestore(safeSettings), { merge: true });
};

// --- Invoices ---
export const subscribeInvoices = (callback: (invoices: Invoice[]) => void) => {
  const q = query(collection(db, COLL_INVOICES));
  return onSnapshot(q, (snapshot) => {
    const invoices = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice));
    // Sort locally because Firestore orderBy might need composite index
    invoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    callback(invoices);
  });
};

export const saveInvoice = async (invoice: Invoice) => {
  const ref = doc(db, COLL_INVOICES, invoice.id);
  await setDoc(ref, sanitizeForFirestore(invoice));
};

export const deleteInvoice = async (id: string) => {
  await deleteDoc(doc(db, COLL_INVOICES, id));
};

// --- Customers ---
export const subscribeCustomers = (callback: (customers: Customer[]) => void) => {
  const q = query(collection(db, COLL_CUSTOMERS));
  return onSnapshot(q, (snapshot) => {
    const customers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Customer));
    callback(customers);
  });
};

export const saveCustomer = async (customer: Customer) => {
  const ref = doc(db, COLL_CUSTOMERS, customer.id);
  await setDoc(ref, sanitizeForFirestore(customer));
};

export const deleteCustomer = async (id: string) => {
  await deleteDoc(doc(db, COLL_CUSTOMERS, id));
};

// --- Products ---
export const subscribeProducts = (callback: (products: Product[]) => void) => {
  const q = query(collection(db, COLL_PRODUCTS));
  return onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
    callback(products);
  });
};

export const saveProduct = async (product: Product) => {
  const ref = doc(db, COLL_PRODUCTS, product.id);
  await setDoc(ref, sanitizeForFirestore(product));
};

export const deleteProduct = async (id: string) => {
  await deleteDoc(doc(db, COLL_PRODUCTS, id));
};

// --- Settings ---
// We use a specific ID 'company_info' for the main company settings
export const subscribeCompanySettings = (callback: (settings: CompanySettings | null) => void) => {
  const ref = doc(db, COLL_SETTINGS, 'company_info');
  return onSnapshot(ref, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as CompanySettings);
    } else {
      callback(null);
    }
  });
};

export const saveCompanySettings = async (settings: CompanySettings) => {
  const ref = doc(db, COLL_SETTINGS, 'company_info');
  await setDoc(ref, sanitizeForFirestore(settings));
};

// --- Revenue Targets ---
export const subscribeRevenueTargets = (callback: (targets: RevenueTarget[]) => void) => {
  const q = query(collection(db, COLL_REVENUE_TARGETS));
  return onSnapshot(q, (snapshot) => {
    const targets = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as RevenueTarget));
    callback(targets);
  });
};

export const saveRevenueTarget = async (target: RevenueTarget) => {
  const ref = doc(db, COLL_REVENUE_TARGETS, target.id);
  await setDoc(ref, sanitizeForFirestore(target));
};

export const deleteRevenueTarget = async (id: string) => {
  await deleteDoc(doc(db, COLL_REVENUE_TARGETS, id));
};

// --- Pricing Rules ---
export const subscribePricingRules = (callback: (rules: PricingRule[]) => void) => {
  const q = query(collection(db, COLL_PRICING_RULES));
  return onSnapshot(q, (snapshot) => {
    const rules = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PricingRule));
    callback(rules);
  });
};

export const savePricingRule = async (rule: PricingRule) => {
  const ref = doc(db, COLL_PRICING_RULES, rule.id);
  await setDoc(ref, sanitizeForFirestore(rule));
};

export const deletePricingRule = async (id: string) => {
  await deleteDoc(doc(db, COLL_PRICING_RULES, id));
};

// --- Pricing Rule History ---
export const subscribePricingHistory = (callback: (history: PricingRuleHistory[]) => void) => {
  const q = query(collection(db, COLL_PRICING_HISTORY), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const history = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PricingRuleHistory));
    callback(history);
  });
};

export const savePricingHistory = async (history: PricingRuleHistory) => {
  const ref = doc(db, COLL_PRICING_HISTORY, history.id);
  await setDoc(ref, sanitizeForFirestore(history));
};

// --- Batch Operations (for initialization or bulk updates) ---
const BATCH_LIMIT = 500; // Firestore batch limit

/**
 * 批量儲存對帳單（使用 Firestore batch）
 */
export const batchSaveInvoices = async (invoices: Invoice[]): Promise<void> => {
  if (invoices.length === 0) return;
  
  // 分批處理，每批最多 500 個
  for (let i = 0; i < invoices.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = invoices.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(invoice => {
      const ref = doc(db, COLL_INVOICES, invoice.id);
      batch.set(ref, sanitizeForFirestore(invoice));
    });
    
    await batch.commit();
  }
};

/**
 * 批量儲存客戶（使用 Firestore batch）
 */
export const batchSaveCustomers = async (customers: Customer[]): Promise<void> => {
  if (customers.length === 0) return;
  
  // 分批處理，每批最多 500 個
  for (let i = 0; i < customers.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = customers.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(customer => {
      const ref = doc(db, COLL_CUSTOMERS, customer.id);
      batch.set(ref, sanitizeForFirestore(customer));
    });
    
    await batch.commit();
  }
};

/**
 * 批量儲存商品（使用 Firestore batch）
 */
export const batchSaveProducts = async (products: Product[]): Promise<void> => {
  if (products.length === 0) return;
  
  // 分批處理，每批最多 500 個
  for (let i = 0; i < products.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = products.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(product => {
      const ref = doc(db, COLL_PRODUCTS, product.id);
      batch.set(ref, sanitizeForFirestore(product));
    });
    
    await batch.commit();
  }
};

/**
 * 批量儲存價格規則（使用 Firestore batch）
 */
export const batchSavePricingRules = async (rules: PricingRule[]): Promise<void> => {
  if (rules.length === 0) return;
  
  // 分批處理，每批最多 500 個
  for (let i = 0; i < rules.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = rules.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(rule => {
      const ref = doc(db, COLL_PRICING_RULES, rule.id);
      batch.set(ref, sanitizeForFirestore(rule));
    });
    
    await batch.commit();
  }
};

/**
 * 批量儲存營收目標（使用 Firestore batch）
 */
export const batchSaveRevenueTargets = async (targets: RevenueTarget[]): Promise<void> => {
  if (targets.length === 0) return;
  
  // 分批處理，每批最多 500 個
  for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = targets.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(target => {
      const ref = doc(db, COLL_REVENUE_TARGETS, target.id);
      batch.set(ref, sanitizeForFirestore(target));
    });
    
    await batch.commit();
  }
};
