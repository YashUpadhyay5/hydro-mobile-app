import { useState } from 'react';

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  invoiceUrl: string;
  status: 'pending' | 'approved' | 'rejected';
}

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const addExpense = (expense: Expense) => {
    setExpenses((prev) => [expense, ...prev]);
  };

  return {
    expenses,
    addExpense,
  };
}