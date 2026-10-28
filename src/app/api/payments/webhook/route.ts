import { handleWebhook } from "@/lib/payments/process";

/** webhook بوابة الدفع: يتحقق من التوقيع ثم يطبّق الحدث (idempotent) */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleWebhook(rawBody, request.headers);
  return Response.json(result.body, { status: result.status });
}
