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
  updateDoc
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  updatePassword as firebaseUpdatePassword,
  User,
  onAuthStateChanged
} from 'firebase/auth';
import { db } from '../firebase'; // Removed auth import as we use custom auth logic
import { Invoice, Customer, Product, CompanySettings, RevenueTarget, PricingRule, PricingRuleHistory } from '../types';

// Collection Names
const COLL_INVOICES = 'invoices';
const COLL_CUSTOMERS = 'customers';
const COLL_PRODUCTS = 'products';
const COLL_SETTINGS = 'settings';
const COLL_REVENUE_TARGETS = 'revenueTargets';
const COLL_PRICING_RULES = 'pricingRules';
const COLL_PRICING_HISTORY = 'pricingRuleHistory';

// --- Auth (Simplified for Firestore-based Auth) ---
// Note: Ideally use Firebase Auth, but this is a quick custom implementation 
// storing credentials in Firestore 'settings/auth' document.

export const login = async (email: string, password: string): Promise<'owner' | 'staff'> => {
  const authRef = doc(db, COLL_SETTINGS, 'auth');
  const authSnap = await getDocs(query(collection(db, COLL_SETTINGS), where('__name__', '==', 'auth')));
  
  let authData: any = {};
  
  if (authSnap.empty) {
    // First time login, create default admin
    authData = {
      owner: { email: 'admin@example.com', password: 'admin123' },
      staff: { email: 'staff@example.com', password: 'staff123' }
    };
    await setDoc(authRef, authData);
  } else {
    authData = authSnap.docs[0].data();
  }

  // Check Owner
  if (authData.owner && authData.owner.email === email && authData.owner.password === password) {
    return 'owner';
  }
  
  // Check Staff
  if (authData.staff && authData.staff.email === email && authData.staff.password === password) {
    return 'staff';
  }

  throw new Error('Invalid credentials');
};

export const updateAuthCredentials = async (role: 'owner' | 'staff', newEmail?: string, newPassword?: string) => {
  const authRef = doc(db, COLL_SETTINGS, 'auth');
  const authSnap = await getDocs(query(collection(db, COLL_SETTINGS), where('__name__', '==', 'auth')));
  
  if (authSnap.empty) return; // Should exist if logged in
  
  const authData = authSnap.docs[0].data();
  const currentCreds = authData[role] || {};
  
  const updatedCreds = {
    email: newEmail || currentCreds.email,
    password: newPassword || currentCreds.password
  };
  
  await setDoc(authRef, {
    ...authData,
    [role]: updatedCreds
  });
};

export const logout = async () => {
  // No-op for custom auth, handled by App state
};

// Removed subscribeAuth as we manage state in App.tsx for this simple version
/*
export const subscribeAuth = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const changePassword = async (user: User, newPassword: string) => {
  await firebaseUpdatePassword(user, newPassword);
};
*/

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
  await setDoc(ref, invoice);
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
  await setDoc(ref, customer);
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
  await setDoc(ref, product);
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
  await setDoc(ref, settings);
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
  await setDoc(ref, target);
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
  await setDoc(ref, rule);
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
  await setDoc(ref, history);
};

// --- Batch Operations (for initialization or bulk updates) ---
export const batchSaveInvoices = async (invoices: Invoice[]) => {
  // Note: For large batches, we should use writeBatch, but for simplicity in migration we iterate
  // Firestore limits batch to 500 operations.
  const promises = invoices.map(inv => saveInvoice(inv));
  await Promise.all(promises);
};

export const batchSaveCustomers = async (customers: Customer[]) => {
  const promises = customers.map(c => saveCustomer(c));
  await Promise.all(promises);
};

export const batchSaveProducts = async (products: Product[]) => {
  const promises = products.map(p => saveProduct(p));
  await Promise.all(promises);
};
