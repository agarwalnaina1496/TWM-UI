import { formatMoney, formatMoneyRange } from '../lib/formatters.js';

export const money = formatMoney;
export const moneyRange = formatMoneyRange;

export default function BudgetBar({ low, high, min, max }) {
  const span = Math.max(max - min, 1);
  const left = ((low - min) / span) * 100;
  const width = Math.max(((high - low) / span) * 100, 3);
  return <div className="budget-track"><div className="budget-fill" style={{ left: `${left}%`, width: `${width}%` }} /></div>;
}
