import { supabase } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { History, ThumbsUp, ThumbsDown } from "lucide-react"
import { CopyButton } from "@/components/copy-button"
import { RefreshButton } from "@/components/refresh-button"
import { DeletePostButton } from "@/components/delete-post-button"

async function getPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return []
  return data
}

export default async function HistoryPage() {
  const posts = await getPosts()

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Post History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {posts.length > 0 ? `${posts.length} generated posts` : "No posts yet"}
          </p>
        </div>
        <RefreshButton />
      </div>

      {posts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <History className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-2">No posts yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Generated posts will appear here automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden animate-slide-up">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead className="w-[80px]">Language</TableHead>
                <TableHead className="w-[100px]">Tone</TableHead>
                <TableHead className="w-[80px]">Length</TableHead>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead className="w-[80px]">Feedback</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <div className="max-w-[300px]">
                      <p className="text-sm font-medium truncate">{post.trend_title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{post.content?.slice(0, 80)}...</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{post.language}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{post.tone}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {post.character_count} chars
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(post.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    {post.feedback === "up" && <ThumbsUp className="h-4 w-4 text-emerald-400" />}
                    {post.feedback === "down" && <ThumbsDown className="h-4 w-4 text-red-400" />}
                    {!post.feedback && <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <CopyButton content={post.content} />
                      <DeletePostButton postId={post.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
