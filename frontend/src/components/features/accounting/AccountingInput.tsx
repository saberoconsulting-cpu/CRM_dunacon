'use client';

import type { InputHTMLAttributes } from 'react';
import { FiCalendar } from 'react-icons/fi';
import styles from './accounting.module.css';

export default function AccountingInput(props: InputHTMLAttributes<HTMLInputElement>) {
  if (props.type !== 'date') return <input {...props} />;

  const empty = !props.value;
  return <span className={styles.dateField} data-empty={empty}>
    <input {...props} />
    {empty && <span className={styles.datePlaceholder} aria-hidden="true">dd/mm/aaaa</span>}
    <FiCalendar className={styles.dateIcon} aria-hidden="true" />
  </span>;
}
