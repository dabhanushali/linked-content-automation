import { redirect } from "next/navigation"

// Reddit hub redirects to the Generate Post page by default
export default function RedditPage() {
  redirect("/reddit/generate")
}
