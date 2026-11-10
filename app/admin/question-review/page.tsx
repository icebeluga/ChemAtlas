import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { env } from "cloudflare:workers";
import { authenticateReviewRequest } from "@/lib/cloudflare-access.mjs";
import QuestionReviewDashboard from "./review-dashboard";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function QuestionReviewPage() {
  if (process.env.NODE_ENV !== "development") {
    const requestHeaders = await headers();
    const auth = await authenticateReviewRequest(new Request("https://private-review.local/admin/question-review", { headers: requestHeaders }), env as unknown as Record<string, unknown>);
    if (!auth.ok) notFound();
  }
  return <QuestionReviewDashboard />;
}
