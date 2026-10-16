type Partner = {
  capital: string;
  adicional: string;
  aporteTotal?: string;
  inversionActualizada?: string;
};

export function partnerContribution(partner: Partner, index: number): number {
  const base = Number(partner.capital || 0) + Number(partner.adicional || 0);
  if (index < 2 || base > 0) return base;
  // Conserva el importe ingresado en la version anterior del formulario.
  const value = Number(partner.aporteTotal ?? partner.inversionActualizada ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Las compras transfieren acciones existentes; no cambian el capital fundador. */
export function transferPartnerShares(contributions: number[], purchases: number[], totalShares: number, sharePrice: number) {
  const capital = contributions.reduce((sum, value) => sum + value, 0);
  const initial = contributions.map(value => capital > 0 ? value / capital * totalShares : 0);
  const final = [...initial];
  const bought = contributions.map(() => 0);
  const invalid: number[] = [];
  purchases.forEach((amount, index) => {
    if (contributions[index] > 0 || amount === 0) return;
    const available = final.slice(0, index).reduce((sum, value) => sum + value, 0);
    const shares = sharePrice > 0 ? amount / sharePrice : 0;
    if (!Number.isFinite(amount) || amount < 0 || sharePrice <= 0 || shares > available + 1e-9) {
      invalid.push(index);
      return;
    }
    for (let seller = 0; seller < index; seller++) {
      final[seller] -= available > 0 ? shares * final[seller] / available : 0;
    }
    bought[index] = shares;
    final[index] += shares;
  });
  return { initial, final, bought, invalid };
}
