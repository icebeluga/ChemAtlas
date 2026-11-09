import { notFound } from "next/navigation";
import QuestionReviewDashboard from "./review-dashboard";

export const runtime = "nodejs";

export default function QuestionReviewPage() {
  // This checkout has no administrator authentication. Keep the tool local-only.
  if (process.env.NODE_ENV !== "development") notFound();
  return <QuestionReviewDashboard />;
}
