'use client';

import type { AccountingParameters } from '@/lib/accounting-parameters';
import { Modal } from '@/components/ui/ui';
import styles from './accounting.module.css';

export default function AccountingParametersPanel({ parameters, onClose }: { parameters: AccountingParameters; onClose: () => void }) {
  return <Modal open title="Parámetros de Contabilidad" width="max-w-lg" onClose={onClose}>
    <div className={styles.entry}><table className={styles.parametersTable}><thead><tr><th>Parámetro fijo</th><th>Valor</th></tr></thead><tbody>
      <tr><td>Tasa IGV</td><td>{parameters.igvRate}%</td></tr>
      <tr><td>Tasa detracción</td><td>{parameters.deductionRate}%</td></tr>
      <tr><td>Umbral detracción</td><td>S/ {parameters.deductionThreshold.toFixed(2)}</td></tr>
    </tbody></table><div className={styles.actions}><button type="button" className="btn-neutral !h-8" onClick={onClose}>Cerrar</button></div></div>
  </Modal>;
}
