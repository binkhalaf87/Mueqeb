import { describe, expect, it } from "vitest";
import { RANKING, bayesianRating, providerScore, rankProviders } from "@/lib/providers/ranking";

const base = { avgRating: null, reviewsCount: 0, completedOrders: 0, onTimePct: null };

describe("ranking formula", () => {
  it("weights sum to 1 and scores stay within 0..1", () => {
    const { rating, completed, onTime } = RANKING.weights;
    expect(rating + completed + onTime).toBeCloseTo(1);
    expect(providerScore(base)).toBeGreaterThanOrEqual(0);
    expect(
      providerScore({ avgRating: 5, reviewsCount: 1000, completedOrders: 1000, onTimePct: 100 }),
    ).toBeLessThanOrEqual(1);
    expect(
      providerScore({ avgRating: 1, reviewsCount: 1000, completedOrders: 0, onTimePct: 0 }),
    ).toBeGreaterThanOrEqual(0);
  });

  it("bayesian rating pulls few reviews toward the prior", () => {
    expect(bayesianRating(null, 0)).toBe(RANKING.PRIOR_RATING);
    expect(bayesianRating(5, 1)).toBeCloseTo((3 * 3.5 + 5) / 4);
    expect(bayesianRating(4.6, 40)).toBeGreaterThan(bayesianRating(5, 1));
  });

  it("a single 5★ review does not beat a long, solid track record", () => {
    const newcomer = { ...base, avgRating: 5, reviewsCount: 1, completedOrders: 1, onTimePct: 100 };
    const veteran = { avgRating: 4.6, reviewsCount: 40, completedOrders: 45, onTimePct: 92 };
    expect(providerScore(veteran)).toBeGreaterThan(providerScore(newcomer));
  });

  it("more completions, better punctuality and higher ratings each raise the score", () => {
    const s = { avgRating: 4, reviewsCount: 10, completedOrders: 10, onTimePct: 80 };
    expect(providerScore({ ...s, completedOrders: 20 })).toBeGreaterThan(providerScore(s));
    expect(providerScore({ ...s, onTimePct: 95 })).toBeGreaterThan(providerScore(s));
    expect(providerScore({ ...s, avgRating: 4.5 })).toBeGreaterThan(providerScore(s));
  });

  it("completions are capped and logarithmic", () => {
    const at = (n: number) => providerScore({ ...base, completedOrders: n });
    expect(at(10) - at(0)).toBeGreaterThan(at(50) - at(40));
    expect(at(500)).toBeCloseTo(at(50));
  });

  it("weights are adjustable", () => {
    const punctualityOnly = { ...RANKING, weights: { rating: 0, completed: 0, onTime: 1 } };
    const late = { ...base, avgRating: 5, reviewsCount: 50, completedOrders: 50, onTimePct: 10 };
    const punctual = { ...base, onTimePct: 100 };
    expect(providerScore(punctual, punctualityOnly)).toBeGreaterThan(
      providerScore(late, punctualityOnly),
    );
  });

  it("ranks deterministically, ties broken by name", () => {
    const ranked = rankProviders([
      { ...base, name: "ب" },
      { ...base, name: "أ" },
      { ...base, name: "ج", completedOrders: 5 },
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["ج", "أ", "ب"]);
  });
});
