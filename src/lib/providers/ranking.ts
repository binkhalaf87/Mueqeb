/**
 * ترتيب المزوّدين في التصفح — معادلة بسيطة قابلة للتعديل:
 *
 *   الدرجة = 0.5 × التقييم + 0.3 × المنجزات + 0.2 × الالتزام بالموعد      (كلها بين 0 و 1)
 *
 * - التقييم: متوسط «بايزي» يسحب المتوسط نحو قيمة مسبقة حتى تتراكم التقييمات،
 *   فلا يتصدر مكتب بتقييم 5/5 واحد على مكتب بعشرات التقييمات الجيدة:
 *     (PRIOR_WEIGHT × PRIOR_RATING + مجموع التقييمات) ÷ (PRIOR_WEIGHT + عددها)، ثم يُطبَّع من 1–5 إلى 0–1.
 * - المنجزات: لوغاريتمية حتى COMPLETED_CAP (الفرق بين 0 و10 أهم من الفرق بين 40 و50).
 * - الالتزام بالموعد: النسبة المئوية ÷ 100، وبلا بيانات تُستخدم ON_TIME_PRIOR.
 *
 * لتعديل الترتيب: غيّر الأوزان أو القيم المسبقة أدناه (مجموع الأوزان = 1).
 */
export type RankingConfig = {
  weights: { rating: number; completed: number; onTime: number };
  PRIOR_RATING: number;
  PRIOR_WEIGHT: number;
  COMPLETED_CAP: number;
  ON_TIME_PRIOR: number;
};

export const RANKING: RankingConfig = {
  weights: { rating: 0.5, completed: 0.3, onTime: 0.2 },
  PRIOR_RATING: 3.5,
  PRIOR_WEIGHT: 3,
  COMPLETED_CAP: 50,
  ON_TIME_PRIOR: 0.8,
};

export type RankingInput = {
  avgRating: number | null;
  reviewsCount: number;
  completedOrders: number;
  onTimePct: number | null;
};

export function bayesianRating(avg: number | null, count: number, cfg = RANKING) {
  const sum = avg === null ? 0 : avg * count;
  return (cfg.PRIOR_WEIGHT * cfg.PRIOR_RATING + sum) / (cfg.PRIOR_WEIGHT + count);
}

export function providerScore(s: RankingInput, cfg = RANKING): number {
  const rating = (bayesianRating(s.avgRating, s.reviewsCount, cfg) - 1) / 4;
  const completed = Math.min(
    1,
    Math.log10(1 + Math.max(0, s.completedOrders)) / Math.log10(1 + cfg.COMPLETED_CAP),
  );
  const onTime = s.onTimePct === null ? cfg.ON_TIME_PRIOR : s.onTimePct / 100;
  const { weights } = cfg;
  return weights.rating * rating + weights.completed * completed + weights.onTime * onTime;
}

/** يرتّب تنازلياً بالدرجة، ثم بالاسم عند التساوي (ترتيب ثابت) */
export function rankProviders<T extends RankingInput & { name: string }>(
  items: T[],
  cfg = RANKING,
) {
  return [...items]
    .map((item) => ({ item, score: providerScore(item, cfg) }))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "ar"))
    .map(({ item, score }) => ({ ...item, score }));
}
