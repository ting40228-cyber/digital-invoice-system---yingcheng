import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  writeBatch,
  Timestamp,
  onSnapshot,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { RevenueRecord } from '../types';

const REVENUE_COLLECTION = 'revenueRecords';

// 將 Date 轉換為 Firestore Timestamp
const dateToTimestamp = (date: Date): Timestamp => {
  return Timestamp.fromDate(date);
};

// 將 Firestore 文檔轉換為 RevenueRecord
const docToRecord = (docData: any): RevenueRecord => {
  const data = docData.data();
  return {
    id: docData.id,
    date: data.date?.toDate() || new Date(),
    vendorName: data.vendorName || '',
    amount: data.amount || 0,
    year: data.year || 0,
    month: data.month || 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

// 創建新記錄
export const createRevenueRecord = async (record: Omit<RevenueRecord, 'id'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, REVENUE_COLLECTION), {
      date: dateToTimestamp(record.date),
      vendorName: record.vendorName,
      amount: record.amount,
      year: record.year,
      month: record.month,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating revenue record:', error);
    throw error;
  }
};

// 更新記錄
export const updateRevenueRecord = async (id: string, updates: Partial<Omit<RevenueRecord, 'id'>>): Promise<void> => {
  try {
    const recordRef = doc(db, REVENUE_COLLECTION, id);
    const updateData: any = {
      ...updates,
      updatedAt: Date.now()
    };
    
    if (updates.date) {
      updateData.date = dateToTimestamp(updates.date);
    }
    
    await updateDoc(recordRef, updateData);
  } catch (error) {
    console.error('Error updating revenue record:', error);
    throw error;
  }
};

// 刪除記錄
export const deleteRevenueRecord = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, REVENUE_COLLECTION, id));
  } catch (error) {
    console.error('Error deleting revenue record:', error);
    throw error;
  }
};

// 批量匯入歷史數據
export const uploadHistoricalData = async (records: Omit<RevenueRecord, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<void> => {
  try {
    const batch = writeBatch(db);
    const now = Date.now();

    records.forEach((record) => {
      const docRef = doc(collection(db, REVENUE_COLLECTION));
      batch.set(docRef, {
        date: dateToTimestamp(record.date),
        vendorName: record.vendorName,
        amount: record.amount,
        year: record.year,
        month: record.month,
        createdAt: now,
        updatedAt: now
      });
    });

    await batch.commit();
  } catch (error) {
    console.error('Error uploading historical data:', error);
    throw error;
  }
};

// 查詢記錄（支援年份和月份篩選）
export const getRevenueRecords = async (
  year?: number,
  month?: number
): Promise<RevenueRecord[]> => {
  try {
    let q = query(collection(db, REVENUE_COLLECTION), orderBy('date', 'desc'));

    if (year !== undefined) {
      q = query(q, where('year', '==', year));
    }

    if (month !== undefined) {
      q = query(q, where('month', '==', month));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docToRecord);
  } catch (error) {
    console.error('Error fetching revenue records:', error);
    throw error;
  }
};

// 訂閱記錄變更（用於即時更新）
export const subscribeRevenueRecords = (
  callback: (records: RevenueRecord[]) => void,
  year?: number,
  month?: number
): (() => void) => {
  let q: any = query(collection(db, REVENUE_COLLECTION), orderBy('date', 'desc'));

  if (year !== undefined) {
    q = query(q, where('year', '==', year));
  }

  if (month !== undefined) {
    q = query(q, where('month', '==', month));
  }

  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot) => {
    const records = snapshot.docs.map(docToRecord);
    callback(records);
  });

  return unsubscribe;
};

// 獲取所有廠商名稱（用於自動完成）
export const getAllVendorNames = async (): Promise<string[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, REVENUE_COLLECTION));
    const vendorNames = new Set<string>();
    
    querySnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.vendorName) {
        vendorNames.add(data.vendorName);
      }
    });

    return Array.from(vendorNames).sort();
  } catch (error) {
    console.error('Error fetching vendor names:', error);
    throw error;
  }
};
