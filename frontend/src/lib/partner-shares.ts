type Partner = {
  capital: string;
  adicional: string;
  aporteTotal?: string;
  inversionActualizada?: string;
  newPartner?: boolean;
};

export function isNewPartner(partner: Partner, index: number): boolean {
  return partner.newPartner ?? (index >= 2 && Number(partner.capital || 0) + Number(partner.adicional || 0) === 0);
}

export function partnerContribution(partner: Partner, index: number): number {
  const value = isNewPartner(partner, index)
    ? Number(partner.aporteTotal ?? partner.inversionActualizada ?? 0)
    : Number(partner.capital || 0) + Number(partner.adicional || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Los aportes nuevos emiten acciones al valor actualizado; los fundadores conservan las suyas. */
export function issuePartnerShares(contributions: number[], newContributions: number[], totalShares: number, sharePrice: number) {
  const capital = contributions.reduce((sum, value) => sum + value, 0);
  const initial = contributions.map(value => capital > 0 ? value / capital * totalShares : 0);
  const invalid: number[] = [];
  const bought = contributions.map((_, index) => {
    const amount = newContributions[index] ?? 0;
    if (amount === 0) return 0;
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(sharePrice) || sharePrice <= 0 || totalShares <= 0) {
      invalid.push(index);
      return 0;
    }
    return amount / sharePrice;
  });
  const final = initial.map((value, index) => value + bought[index]);
  const finalTotal = final.reduce((sum, value) => sum + value, 0);
  return { initial, final, bought, finalTotal, invalid };
}
