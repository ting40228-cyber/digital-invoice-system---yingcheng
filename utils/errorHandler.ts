import { toast } from './toast';

export interface AppError {
  code?: string;
  message: string;
  originalError?: unknown;
}

/**
 * 統一錯誤處理函數
 * 將各種錯誤轉換為用戶友好的訊息並顯示 Toast
 */
export const handleError = (error: unknown, customMessage?: string): void => {
  console.error('Error:', error);

  let errorMessage = customMessage || '發生錯誤，請稍後再試';

  if (error instanceof Error) {
    // Firebase Auth 錯誤
    if ('code' in error) {
      const firebaseError = error as { code: string; message: string };
      switch (firebaseError.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          // 如果錯誤訊息包含 Firebase Console 提示，使用該訊息
          if (firebaseError.message && firebaseError.message.includes('Firebase Console')) {
            errorMessage = firebaseError.message;
          } else {
            errorMessage = '帳號或密碼錯誤。如果帳號不存在，系統會自動創建。請確認密碼正確，或前往 Firebase Console 重置密碼。';
          }
          break;
        case 'auth/email-already-in-use':
          errorMessage = '此電子郵件已被使用';
          break;
        case 'auth/weak-password':
          errorMessage = '密碼強度不足，請使用至少6個字元';
          break;
        case 'auth/too-many-requests':
          errorMessage = '嘗試次數過多，請稍後再試';
          break;
        case 'auth/network-request-failed':
          errorMessage = '網路連線失敗，請檢查您的網路';
          break;
        case 'permission-denied':
          errorMessage = '您沒有權限執行此操作';
          break;
        case 'unavailable':
          errorMessage = '服務暫時無法使用，請稍後再試';
          break;
        default:
          errorMessage = firebaseError.message || errorMessage;
      }
    } else {
      // 一般錯誤
      if (error.message) {
        errorMessage = error.message;
      }
    }
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  toast.error(errorMessage);
};

/**
 * 處理 Firestore 錯誤
 */
export const handleFirestoreError = (error: unknown, operation: string): void => {
  console.error(`Firestore ${operation} error:`, error);
  
  let errorMessage = `${operation}失敗，請檢查網路連線`;
  
  if (error instanceof Error && 'code' in error) {
    const firestoreError = error as { code: string };
    switch (firestoreError.code) {
      case 'permission-denied':
        errorMessage = `您沒有權限${operation}`;
        break;
      case 'unavailable':
        errorMessage = '服務暫時無法使用，請稍後再試';
        break;
      case 'deadline-exceeded':
        errorMessage = '操作逾時，請稍後再試';
        break;
      default:
        errorMessage = `${operation}失敗：${firestoreError.code}`;
    }
  }
  
  toast.error(errorMessage);
};

/**
 * 處理批量操作錯誤
 */
export const handleBatchError = (error: unknown, operation: string, successCount: number, totalCount: number): void => {
  console.error(`Batch ${operation} error:`, error);
  
  if (successCount === 0) {
    toast.error(`所有${operation}操作都失敗，請檢查網路連線`);
  } else if (successCount < totalCount) {
    toast.warning(`部分${operation}操作失敗（成功：${successCount}/${totalCount}）`);
  } else {
    toast.error(`${operation}失敗，請檢查網路連線`);
  }
};
