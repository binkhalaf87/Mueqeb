/**
 * حساب مبالغ الطلب بالهللة — مطابق لدوال قاعدة البيانات
 * (public.pct_to_bps و public.round_bps و public.create_order_for_request).
 * القاعدة هي المرجع؛ هذا للعرض وللاختبارات.
 *
 * النسب بنقاط الأساس (bps): 1% = 100، 15% = 1500.
 * التقريب: نصف هللة فأكثر يُقرّب للأعلى، بحساب صحيح فقط (BigInt) بلا كسور عشرية.
 */

/** نسبة مئوية (مثل 15 أو 2.5) → نقاط أساس صحيحة */
export function pctToBps(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new RangeError(`نسبة غير صالحة: ${pct}`);
  }
  return Math.round(pct * 100);
}

/** (amount × bps) ÷ 10000 مع تقريب النصف للأعلى */
export function roundBps(amountHalalas: number, bps: number): number {
  if (!Number.isSafeInteger(amountHalalas) || amountHalalas < 0) {
    throw new RangeError(`مبلغ غير صالح: ${amountHalalas}`);
  }
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError(`نقاط أساس غير صالحة: ${bps}`);
  }
  return Number((BigInt(amountHalalas) * BigInt(bps) + BigInt(5000)) / BigInt(10_000));
}

export type OrderAmounts = {
  feeHalalas: number;
  clientFeeHalalas: number;
  providerCommissionHalalas: number;
  providerNetHalalas: number;
  totalPaidHalalas: number;
  platformRevenueHalalas: number;
};

export function calcOrderAmounts(
  feeHalalas: number,
  clientFeeBps: number,
  providerCommissionBps: number,
): OrderAmounts {
  if (!Number.isSafeInteger(feeHalalas) || feeHalalas <= 0) {
    throw new RangeError(`أتعاب غير صالحة: ${feeHalalas}`);
  }
  const clientFeeHalalas = roundBps(feeHalalas, clientFeeBps);
  const providerCommissionHalalas = roundBps(feeHalalas, providerCommissionBps);
  return {
    feeHalalas,
    clientFeeHalalas,
    providerCommissionHalalas,
    providerNetHalalas: feeHalalas - providerCommissionHalalas,
    totalPaidHalalas: feeHalalas + clientFeeHalalas,
    platformRevenueHalalas: clientFeeHalalas + providerCommissionHalalas,
  };
}

export type LedgerLine = { account: string; debit_halalas: number; credit_halalas: number };

/** مجموع المدين ناقص الدائن (يجب أن يساوي صفراً لكل قيد ولكل طلب) */
export function ledgerImbalance(lines: LedgerLine[]): number {
  return lines.reduce((sum, l) => sum + Number(l.debit_halalas) - Number(l.credit_halalas), 0);
}

export type Settlement = {
  refundHalalas: number;
  providerPayableHalalas: number;
  platformRevenueHalalas: number;
};

/**
 * توزيع الضمان عند إغلاق الطلب — مطابق لـ public.settle_order_ledger:
 * - استرداد = الإجمالي: كل المبلغ للعميل.
 * - 0 ≤ استرداد ≤ الأتعاب: يُخصم من أتعاب المزوّد، والعمولة على الأتعاب المتبقية، ورسم الخدمة للمنصة.
 */
export function calcSettlement(
  order: { feeHalalas: number; clientFeeHalalas: number; commissionBps: number },
  refundHalalas: number,
): Settlement {
  const total = order.feeHalalas + order.clientFeeHalalas;
  if (refundHalalas === total) {
    return { refundHalalas, providerPayableHalalas: 0, platformRevenueHalalas: 0 };
  }
  if (
    !Number.isSafeInteger(refundHalalas) ||
    refundHalalas < 0 ||
    refundHalalas > order.feeHalalas
  ) {
    throw new RangeError(`مبلغ استرداد غير صالح: ${refundHalalas}`);
  }
  const kept = order.feeHalalas - refundHalalas;
  const commission = roundBps(kept, order.commissionBps);
  return {
    refundHalalas,
    providerPayableHalalas: kept - commission,
    platformRevenueHalalas: order.clientFeeHalalas + commission,
  };
}

/** ما يُسترد للعميل عند الإلغاء بعد البدء: الأتعاب ناقص حصة المزوّد (نسبة من الإعدادات) */
export function cancellationAfterStartRefund(feeHalalas: number, providerShareBps: number) {
  return feeHalalas - roundBps(feeHalalas, providerShareBps);
}
