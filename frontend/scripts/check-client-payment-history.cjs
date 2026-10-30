const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = {};
new Function('exports', compile(path.join(__dirname,'../src/lib/client-payment-history.ts')))(helper);
const amounts = {};
new Function('exports', compile(path.join(__dirname,'../src/lib/lot-payment-amount.ts')))(amounts);
const financingAmounts = {};
assert.equal(amounts.savedPaymentInstallmentCount({ installmentAllocations: [
  { amount: 500, kind: 'installment' }, { amount: 500, kind: 'installment' },
  { amount: 500, kind: 'installment' }, { amount: 2000, kind: 'term_reduction' },
]}), 3);
assert.equal(amounts.savedPaymentInstallmentCount({ installmentAllocations: [
  { amount: 500, kind: 'installment' }, { amount: 2000, kind: 'term_reduction' },
]}), 1);
assert.equal(amounts.savedPaymentInstallmentCount({}), 0);
assert.deepEqual(amounts.savedPaymentBreakdown({ amount: 5400, isExtraordinary: true, installmentAllocations: [
  { amount: 560.79, kind: 'installment' }, { amount: 4839.21, kind: 'term_reduction' },
]}), { installments: 560.79, extraordinary: 4839.21 });
assert.deepEqual(amounts.savedPaymentBreakdown({ amount: 5400, installmentAllocations: [
  { amount: 560.79, kind: 'installment' }, { amount: 560.79, kind: 'installment' }, { amount: 4278.42, kind: 'term_reduction' },
]}), { installments: 1121.58, extraordinary: 4278.42 });
assert.equal(amounts.savedPaymentBreakdown({ amount: 5400, isExtraordinary: true }), null);
assert.deepEqual(amounts.savedPaymentBreakdown({ amount: 560.79 }), { installments: 560.79, extraordinary: 0 });
new Function('exports', compile(path.join(__dirname,'../src/lib/financing-interest.ts')))(financingAmounts);
const reducedSchedule = financingAmounts.financingCapitalAndInterest({sale:{salePrice:2000,cuotaInicial:0}, installments:[
  {installmentNo:1,amount:500,paid:true}, {installmentNo:2,amount:500,paid:false},
  {installmentNo:3,amount:500,paid:false}, {installmentNo:4,amount:500,paid:false,reduced:true,amortizedAmount:500},
]});
assert.equal(reducedSchedule.paidCapital,1000,'extraordinary amortization remains received capital');
assert.equal(reducedSchedule.pendingCapital,1000,'reduced installments are not pending obligations');
assert.equal(reducedSchedule.paidInterest,0,'term reduction does not pay future interest');
assert.equal(amounts.lotPaymentUsd(7000, 'PEN', 3.5), 2000);
assert.equal(amounts.lotPaymentUsd(2000, 'USD', 0), 2000);
assert.equal(amounts.lotPaymentUsd(1458.35, 'PEN', 3.5), 416.67);
assert.equal(amounts.lotPaymentUsd(7000, 'PEN', 0), 0);
assert.equal(amounts.lotPaymentUsd(-10, 'USD', 0), 0);
assert.equal(amounts.lotPaymentUsd(Infinity, 'USD', 0), 0);
const overdueSchedule = Array.from({ length: 6 }, (_, i) => ({ installmentNo: i + 1, dueDate: `2026-${String(i + 5).padStart(2, '0')}-28`, amount: 416, registerableAmount: 416 }));
assert.deepEqual(amounts.extraordinaryPaymentBreakdown(overdueSchedule, 2000, '2026-08-28'), { count: 4, covered: [1,2,3,4], overdueCount: 3, overduePaid: 3, required: 1664, installments: 1664, extraordinary: 336 });
assert.deepEqual(amounts.extraordinaryPaymentBreakdown(overdueSchedule, 1000, '2026-08-28'), { count: 2, covered: [1,2], overdueCount: 3, overduePaid: 2, required: 832, installments: 832, extraordinary: 168 });
assert.deepEqual(amounts.extraordinaryPaymentBreakdown(overdueSchedule, 2000, '2026-04-28').covered, [1]);
assert.deepEqual(amounts.extraordinaryPaymentBreakdown(overdueSchedule.map((r,i) => i < 2 ? {...r, registered:true} : r), 1000, '2026-08-28').covered, [3,4]);
assert.equal(amounts.extraordinaryPaymentBreakdown([{installmentNo:14,amount:500},{installmentNo:15,amount:500},{installmentNo:19,amount:500}],680,'2026-08-28').extraordinary,180);
const twelveOverdue = Array.from({length:19},(_,i)=>({installmentNo:i+1,amount:500,dueDate:i<12?'2025-01-01':'2027-01-01'}));
const arrearsPreview = amounts.extraordinaryPaymentBreakdown(twelveOverdue,2180,'2026-10-28');
assert.equal(arrearsPreview.overduePaid,4);assert.equal(arrearsPreview.overdueCount,12);assert.equal(arrearsPreview.extraordinary,180);
assert.equal(amounts.extraordinaryPaymentBreakdown(overdueSchedule,2000,'2026-04-28').extraordinary,1584);
console.log('PASS: soles conversion, dollars, cent rounding and invalid amounts.');
const { clientPaymentHistoryRows: rowsFor, clientPaymentHistoryTotals: totalsFor } = helper;
const initialReceipt = {id:900,type:'adelanto',status:'pagado',amountUsd:1500,installmentAllocations:[{installmentId:3,installmentNo:3,saleId:10,kind:'term_reduction',amount:500}]};
const initialExtraRows = rowsFor({sale:{salePrice:2500,cuotaInicial:1000,totalCuotas:3},allPayments:[initialReceipt],plan:[
  {kind:'cuota_inicial',amount:1000,paid:true,payment:initialReceipt},
  {id:1,installmentNo:1,amount:500},{id:2,installmentNo:2,amount:500},{id:3,installmentNo:3,amount:500,reduced:true},
]});
assert.equal(totalsFor(initialExtraRows).realizedPayment,1500,'initial plus extraordinary receipt is counted once');
assert.equal(initialExtraRows[1].openingBalance,1000,'initial extraordinary reduces the financing balance');
assert.equal(initialExtraRows[1].realizedPayment,0,'next monthly installment remains unpaid');
const finalPriceSale = { salePrice: 37805, cuotaInicial: 12000, totalCuotas: 1 };
const finalPriceRows = rowsFor({ sale: finalPriceSale, plan: [{ installmentNo: 0, amount: 12000 }, { installmentNo: 1, amount: 25805 }] });
const finalPriceTotals = totalsFor(finalPriceRows, finalPriceSale);
assert.equal(finalPriceTotals.openingBalance, 37805);
assert.equal(finalPriceTotals.capitalAmortization, 37805);
assert.equal(finalPriceTotals.realizedPayment, 0);
assert.equal(finalPriceRows[1].openingBalance, 25805);
assert.equal(finalPriceTotals.closingBalance, 0);
assert.equal(helper.formatClientHistoryDate('2026-09-27'),'27/09/2026');
assert.equal(helper.formatClientHistoryDate('2026-10-24T05:00:00Z'),'24/10/2026');
// The sale sheet and history must preserve the same stored calendar day.
const dateHelpers={};
new Function('exports','require',compile(path.join(__dirname,'../src/lib/types.ts')))(dateHelpers,name=>name==='./currency'?{moneyGlobal:String}:require(name));
const originalTimezone=process.env.TZ;
try {
 for(const timezone of ['America/Lima','UTC','Asia/Tokyo']) {
  process.env.TZ=timezone;
  for(const date of ['2025-08-26','2026-01-01','2028-02-29']) {
   const expected=new Date(`${date}T12:00:00Z`).toLocaleDateString('es-PE',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'});
   assert.equal(dateHelpers.formatDate(date),expected);
   assert.equal(helper.formatClientHistoryDate(date),date.split('-').reverse().join('/'));
  }
  assert.equal(dateHelpers.formatDate('2025-08-26T02:00:00Z'),dateHelpers.formatDate('2025-08-25'));
  assert.equal(helper.formatClientHistoryDate('2025-08-26T02:00:00Z'),'25/08/2025');
 }
} finally {
 if(originalTimezone===undefined) delete process.env.TZ; else process.env.TZ=originalTimezone;
}
console.log('PASS: sale sheet and payment history retain the stored due date across time zones.');
const schedule = Array.from({length:20},(_,i)=>({id:i+1,installmentNo:i+1,conceptLabel:`Cuota ${i+1}`,amount:2000,dueDate:new Date(Date.UTC(2026,7+i,24)).toISOString().slice(0,10),paid:false}));
const allocation=(no,amount,kind='installment')=>({saleId:10,installmentId:no,installmentNo:no,amount,kind});
const receipt=(id,amount,allocations)=>({paymentId:id,type:'cuota',status:'pagado',amountUsd:amount,amount,paidAt:'2026-10-24',bankOperationNumber:`TEST-${id}`,installmentAllocations:allocations});
const history=(payments)=>({sale:{projectId:5,salePrice:40000,cuotaInicial:0,interestType:'sin_intereses'},plan:schedule,installments:schedule,allPayments:payments,summary:{},otherPayments:[]});
const payment=receipt(1,8000,[allocation(1,2000),allocation(2,2000),allocation(3,2000),allocation(20,2000,'term_reduction')]);
let rows=rowsFor(history([payment]));
assert.equal(rows.length,19);
assert.deepEqual(rows.slice(0,4).map(row=>row.realizedPayment),[2000,2000,4000,0]);
assert.equal(rows[2].extraordinaryAmortization,2000);
assert.equal(rows[2].closingBalance,32000);
assert.ok(rows.every(row=>row.monthlyInstallment===2000));
assert.equal(totalsFor(rows).realizedPayment,8000,'single operation is counted once across arrears/current/extra');
assert.equal(totalsFor(rows).closingBalance,0);
assert.equal(totalsFor(rows).capitalAmortization+totalsFor(rows).extraordinaryAmortization,40000);
assert.equal(totalsFor(rowsFor(history([payment,payment]))).realizedPayment,8000,'duplicate metadata does not duplicate cash');
const partial=receipt(2,7500,[allocation(1,2000),allocation(2,2000),allocation(3,2000),allocation(20,1500,'term_reduction')]);
rows=rowsFor(history([partial]));
assert.equal(rows.length,20); assert.equal(rows.at(-1).monthlyInstallment,500); assert.equal(rows.at(-1).closingBalance,0);
assert.equal(rows[2].extraordinaryAmortization,1500); assert.equal(totalsFor(rows).realizedPayment,7500);
const repeated=receipt(3,8000,[allocation(4,2000),allocation(5,2000),allocation(6,2000),allocation(19,2000,'term_reduction')]);
rows=rowsFor(history([payment,repeated]));
assert.equal(rows.length,18); assert.equal(totalsFor(rows).realizedPayment,16000);
assert.equal(totalsFor(rows).extraordinaryAmortization,4000);
assert.equal(rowsFor(history([{...payment,status:'pendiente'}])).length,20);
assert.equal(totalsFor(rowsFor(history([{...payment,status:'pendiente'}]))).realizedPayment,0,'unapproved money is not realized');
const teaHistory={sale:{salePrice:16760,cuotaInicial:0,interestType:'tea',tea:(Math.pow(1.01,12)-1)*100},plan:schedule.map(row=>({...row,amount:1003.22})),allPayments:[receipt(4,2000,[allocation(3,1003.22),allocation(20,996.78,'term_reduction')])],summary:{}};
rows=rowsFor(teaHistory);
assert.equal(rows[0].interest,167.60); assert.equal(rows[0].capitalAmortization,835.62);
assert.equal(rows[2].extraordinaryAmortization,996.78);
assert.equal(rows[2].closingBalance,13231.20);
assert.equal(rows[3].interest,132.31,'future interest uses the reduced balance');
for(const row of rows) {
 assert.equal(Math.round((row.monthlyInstallment-row.interest)*100),Math.round(row.capitalAmortization*100));
 assert.equal(Math.round((row.openingBalance-row.capitalAmortization-row.extraordinaryAmortization)*100),Math.round(row.closingBalance*100));
 assert.ok(row.closingBalance>=0);
}
// Rounding is charged in the last installment, including legacy schedules.
const legacyPlan=Array.from({length:60},(_,i)=>({id:i+1,installmentNo:i+1,amount:398.79}));
const legacy={sale:{salePrice:23927.45,cuotaInicial:0,totalCuotas:60,interestType:'sin_intereses'},plan:legacyPlan};
const roundedRows=rowsFor(legacy);
assert.equal(roundedRows[58].closingBalance,398.84);
assert.equal(roundedRows[59].monthlyInstallment,398.84);
assert.equal(roundedRows[59].closingBalance,0);
assert.equal(totalsFor(roundedRows).capitalAmortization,23927.45);
assert.equal(rowsFor({...legacy,plan:legacyPlan.slice(0,59)}).at(-1).closingBalance,398.84);
assert.equal(rowsFor({...legacy,sale:{...legacy.sale,salePrice:25000}}).at(-1).monthlyInstallment,398.79,'large differences are not hidden');
const finance={};
new Function('exports',compile(path.join(__dirname,'../../backend/src/shared/domain/finance.util.ts')))(finance);
for(const graceMonths of [0,12,60]) for(const teaPct of [0,12]) {
 const plan=finance.buildGraceSchedule({principal:23927.45,totalCuotas:60,graceMonths,interestType:teaPct?'tea':'sin_intereses',teaPct});
 assert.equal(plan.rows.at(-1).saldoFinal,0);
 assert.equal(plan.rows.reduce((sum,row)=>sum+Math.round(row.amortizacionCapital*100),0),2392745);
 for(const row of plan.rows) {
  assert.equal(Math.round(row.cuota*100),Math.round(row.amortizacionCapital*100)+Math.round(row.interes*100));
  assert.equal(Math.round(row.saldoInicial*100)-Math.round(row.amortizacionCapital*100),Math.round(row.saldoFinal*100));
 }
 const projected=rowsFor({sale:{salePrice:23927.45,totalCuotas:60,graceMonths,interestType:teaPct?'tea':'sin_intereses',tea:teaPct},plan:plan.rows.map(row=>({installmentNo:row.month,amount:row.cuota}))});
 assert.equal(projected.at(-1).closingBalance,0);
}
console.log('PASS: legacy last-installment rounding, incomplete schedules, large discrepancies, and cent-exact schedules with interest/grace.');
const printable={}; let html='';
const placeholder=()=>null;
function resolve(name) {
 if(name==='@/lib/client-payment-history')return helper;
 if(name==='@/lib/print')return {printHtml:value=>{html=value;}};
 if(name==='@/lib/currency')return {displaySymbol:()=> 'US$',displayNumberGlobal:Number,moneyGlobal:value=>`US$ ${value}`,DEFAULT_EXCHANGE_RATE:3.75};
 if(name==='@/lib/types')return {formatDate:value=>String(value).slice(0,10)};
 if(['react','react/jsx-runtime','react-icons/fi'].includes(name))return require(name);
 return new Proxy({default:placeholder},{get:(object,key)=>object[key]??placeholder});
}
new Function('exports','require',compile(path.join(__dirname,'../src/components/features/payments/PaymentsView.tsx')))(printable,resolve);
printable.ClientPaymentHistoryPdf({sale:history([payment]),projectName:'Test'});
for(const label of ['Cuota del mes','Pago realizado','Saldo inicial','Amortización de capital','Amortización<br><span style="white-space:nowrap">extra US$</span>','Saldo final']) assert.ok(html.includes(label),label);
assert.ok(html.includes('<th>Estado</th>')); assert.ok(!html.includes('<th>TC</th>')); assert.ok(!html.includes('<th>Mes</th>'));
// The expanded view follows the work area's real bounds, not a hard-coded
// sidebar width, and therefore leaves both full and collapsed menus accessible.
const originalWindow=global.window, originalDocument=global.document, originalObserver=global.ResizeObserver;
let bounds=null, resize, closed=0, rectangle={top:72,left:248};
const anchor={current:null}, panelEffects=[], listeners={};
const panelExports={};
try {
 global.window={addEventListener:(event,fn)=>{listeners[event]=fn;},removeEventListener(){}};
 global.document={body:{},querySelector:()=>null};
 global.ResizeObserver=class {constructor(callback){resize=callback;}observe(){}disconnect(){}};
 const paneReact={useRef:()=>anchor,useState:()=>[bounds,value=>{bounds=value;}],useEffect:fn=>{panelEffects.push(fn);}};
 new Function('exports','require',compile(path.join(__dirname,'../src/components/layout/WorkspacePanel.tsx')))(panelExports,name=>name==='react'?paneReact:name==='react-dom'?{createPortal:(node)=>node}:require(name));
 const renderPanel=()=>panelExports.default({children:'History',label:'History',onClose:()=>{closed++;}});
 renderPanel(); anchor.current={closest:()=>({getBoundingClientRect:()=>rectangle})};
 [...panelEffects].forEach(effect=>effect());
 const region=tree=>Array.isArray(tree.props.children)?tree.props.children.find(node=>node?.props?.role==='region'):null;
 assert.deepEqual(region(renderPanel()).props.style,{top:72,left:248});
 rectangle={top:72,left:76}; resize(); assert.equal(region(renderPanel()).props.style.left,76);
 rectangle={top:56,left:0}; resize(); assert.deepEqual(region(renderPanel()).props.style,{top:56,left:0});
 global.document.querySelector=()=>({}); listeners.keydown({key:'Escape'}); assert.equal(closed,0);
 global.document.querySelector=()=>null; listeners.keydown({key:'Escape'}); assert.equal(closed,1);
} finally {global.window=originalWindow;global.document=originalDocument;global.ResizeObserver=originalObserver;}
console.log('PASS: requested formulas, one cash total, arrears allocation, partial final installment, repeated extraordinary payments, pending approvals, monthly TEA on reduced balance, no negative balance and matching PDF columns.');
console.log('PASS: expanded work area preserves desktop/collapsed/mobile menus, and nested evidence dialogs retain Escape handling.');
