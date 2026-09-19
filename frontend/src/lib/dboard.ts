// src/lib/dboard.ts
// Tipos normalizados para dashboards (parsea raw del backend)

export interface FormattedDashboard {
  cards: { leadsMonth: number; salesMonth: number; income: number; expense: number; profit: number; campaignSpend: number };
  lots: Record<string, number>;
  salesByProject: { projectId: number; total: number; amount: number }[];
  investmentsByProject?: { projectId: number; amount: number }[];
  availableLotsByProject?: { projectId: number; total: number }[];
  paymentsSummary?: { key: string; label: string; value: number }[];
  agentRanking: { agentId: number; agentName: string; salesCount: number; salesAmount: number; commission: number }[];
  recentSales: any[];
  recentPayments: any[];
  leadsByChannel: { channel: string; total: number }[];
}

export interface AgentDashboard {
  cards: {
    salesMonth: number; salesAmount: number; commissionMonth: number;
    lotsSold: number; goalLots: number; goalAmount: number; progressLots: number;
  };
  leads: any[];
  salesByPeriod: { date: string; total: number; amount: number; commission: number }[];
  salesByProject?: { projectId: number; name: string; total: number; amount: number; commission: number }[];
}
