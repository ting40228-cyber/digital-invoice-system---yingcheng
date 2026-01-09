// CSV 解析工具，支援批量匯入
export interface CSVRecord {
  date: string; // YYYY-MM-DD 格式
  vendorName: string;
  amount: number;
}

// 解析 CSV 文字內容
export const parseCSV = (csvText: string): CSVRecord[] => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // 跳過標題行（如果有）
  const startIndex = lines[0].includes('date') || lines[0].includes('日期') ? 1 : 0;
  const records: CSVRecord[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 處理 CSV 格式（支援逗號分隔）
    const columns = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
    
    if (columns.length >= 3) {
      const date = columns[0];
      const vendorName = columns[1];
      const amount = parseFloat(columns[2]);

      if (date && vendorName && !isNaN(amount)) {
        records.push({
          date,
          vendorName,
          amount
        });
      }
    }
  }

  return records;
};

// 將 CSV 記錄轉換為 RevenueRecord 格式
export const csvRecordsToRevenueRecords = (csvRecords: CSVRecord[]): Omit<import('../types').RevenueRecord, 'id' | 'createdAt' | 'updatedAt'>[] => {
  return csvRecords.map((csvRecord) => {
    const date = new Date(csvRecord.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    return {
      date,
      vendorName: csvRecord.vendorName,
      amount: csvRecord.amount,
      year,
      month
    };
  });
};
