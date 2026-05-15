"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { Loader2, Plus, Trash2, RefreshCw, Save, Star } from "lucide-react"
import type { RedditSubreddit, RedditIdentity, RedditTone, CommentTemplate, GlobalPrompt } from "@/lib/reddit/types"

export function RedditSettingsPanel() {
  return (
    <Tabs defaultValue="subreddits">
      <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
        <TabsTrigger value="subreddits">Subreddits</TabsTrigger>
        <TabsTrigger value="identities">Identities</TabsTrigger>
        <TabsTrigger value="tones">Tones</TabsTrigger>
        <TabsTrigger value="global-prompt">Global Prompt</TabsTrigger>
        <TabsTrigger value="comment-templates">Templates</TabsTrigger>
        <TabsTrigger value="services">Services</TabsTrigger>
      </TabsList>

      <TabsContent value="subreddits" className="space-y-6 mt-6">
        <SubredditsTab />
      </TabsContent>

      <TabsContent value="identities" className="space-y-6 mt-6">
        <IdentitiesTab />
      </TabsContent>

      <TabsContent value="tones" className="space-y-6 mt-6">
        <TonesTab />
      </TabsContent>

      <TabsContent value="global-prompt" className="space-y-6 mt-6">
        <GlobalPromptTab />
      </TabsContent>

      <TabsContent value="comment-templates" className="space-y-6 mt-6">
        <CommentTemplatesTab />
      </TabsContent>

      <TabsContent value="services" className="space-y-6 mt-6">
        <ServicesTab />
      </TabsContent>
    </Tabs>
  )
}


// ============================================================
// Subreddits Tab
// ============================================================

function SubredditsTab() {
  const [subreddits, setSubreddits] = useState<RedditSubreddit[]>([])
  const [identities, setIdentities] = useState<RedditIdentity[]>([])
  const [tones, setTones] = useState<RedditTone[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/reddit/subreddits").then(r => r.json()),
      fetch("/api/reddit/identities").then(r => r.json()),
      fetch("/api/reddit/tones").then(r => r.json()),
    ]).then(([subs, ids, ts]) => {
      setSubreddits(Array.isArray(subs) ? subs : [])
      setIdentities(Array.isArray(ids) ? ids : [])
      setTones(Array.isArray(ts) ? ts : [])
    }).catch(() => {
      toast({ title: "Failed to load Reddit settings", variant: "destructive" })
    }).finally(() => setLoading(false))
  }, [])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/reddit/subreddits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error()
      const sub = await res.json()
      setSubreddits(prev => [sub, ...prev])
      setNewName("")
      toast({ title: `r/${sub.name} added` })
    } catch {
      toast({ title: "Failed to add subreddit", variant: "destructive" })
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await fetch(`/api/reddit/subreddits/${id}`, { method: "DELETE" }).then(r => r.json())
    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" })
      return
    }
    setSubreddits(prev => prev.filter(s => s.id !== id))
  }

  const handleRefreshRules = async (id: string) => {
    setRefreshingId(id)
    try {
      const res = await fetch(`/api/reddit/subreddits/${id}/refresh-rules`, { method: "POST" })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setSubreddits(prev => prev.map(s => s.id === id ? updated : s))
      toast({ title: "Rules refreshed" })
    } catch {
      toast({ title: "Failed to refresh rules", variant: "destructive" })
    } finally {
      setRefreshingId(null)
    }
  }

  const handleAssign = async (id: string, field: "active_identity_id" | "active_tone_id", value: string | null) => {
    try {
      const res = await fetch(`/api/reddit/subreddits/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setSubreddits(prev => prev.map(s => s.id === id ? updated : s))
    } catch {
      toast({ title: "Failed to update", variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Add Subreddit</CardTitle>
          <CardDescription>Add a subreddit to manage. Rules will be auto-fetched and cleaned.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. sales or r/sales"
              disabled={adding}
            />
            <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {subreddits.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Managed Subreddits ({subreddits.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subreddits.map((sub, i) => (
              <div key={sub.id}>
                {i > 0 && <Separator className="my-4" />}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400 font-medium">r/</span>
                      <span className="font-medium text-foreground">{sub.name}</span>
                      {sub.last_scraped_at && (
                        <span className="text-xs text-muted-foreground">
                          Rules fetched {new Date(sub.last_scraped_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRefreshRules(sub.id)}
                        disabled={refreshingId === sub.id}
                        title="Refresh rules"
                      >
                        {refreshingId === sub.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(sub.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Identity</Label>
                      <select
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={sub.active_identity_id || ""}
                        onChange={(e) => handleAssign(sub.id, "active_identity_id", e.target.value || null)}
                      >
                        <option value="">None</option>
                        {identities.map(id => (
                          <option key={id.id} value={id.id}>{id.name}{id.is_default ? " (default)" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tone</Label>
                      <select
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={sub.active_tone_id || ""}
                        onChange={(e) => handleAssign(sub.id, "active_tone_id", e.target.value || null)}
                      >
                        <option value="">None</option>
                        {tones.map(t => (
                          <option key={t.id} value={t.id}>{t.name}{t.is_preset ? " (preset)" : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}


// ============================================================
// Identities Tab
// ============================================================

function IdentitiesTab() {
  const [identities, setIdentities] = useState<RedditIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState("")
  const [formIdentity, setFormIdentity] = useState("")
  const [formGoals, setFormGoals] = useState("")
  const [formRules, setFormRules] = useState("")

  useEffect(() => {
    fetch("/api/reddit/identities")
      .then(r => r.json())
      .then(data => setIdentities(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: "Failed to load identities", variant: "destructive" }))
      .finally(() => setLoading(false))
  }, [])

  const resetForm = () => {
    setFormName("")
    setFormIdentity("")
    setFormGoals("")
    setFormRules("")
    setEditingId(null)
  }

  const handleCreate = async () => {
    if (!formName.trim() || !formIdentity.trim() || !formGoals.trim() || !formRules.trim()) {
      toast({ title: "All fields are required", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/reddit/identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          identity_text: formIdentity.trim(),
          goals_text: formGoals.trim(),
          rules_text: formRules.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      const identity = await res.json()
      setIdentities(prev => [identity, ...prev])
      resetForm()
      toast({ title: "Identity created" })
    } catch {
      toast({ title: "Failed to create identity", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch(`/api/reddit/identities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          identity_text: formIdentity.trim(),
          goals_text: formGoals.trim(),
          rules_text: formRules.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setIdentities(prev => prev.map(i => i.id === id ? updated : i))
      resetForm()
      toast({ title: "Identity updated" })
    } catch {
      toast({ title: "Failed to update identity", variant: "destructive" })
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/reddit/identities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      })
      if (!res.ok) throw new Error()
      setIdentities(prev => prev.map(i => ({ ...i, is_default: i.id === id })))
      toast({ title: "Default identity updated" })
    } catch {
      toast({ title: "Failed to set default", variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/reddit/identities/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setIdentities(prev => prev.filter(i => i.id !== id))
      toast({ title: "Identity deleted" })
    } catch {
      toast({ title: "Failed to delete identity", variant: "destructive" })
    }
  }

  const startEdit = (identity: RedditIdentity) => {
    setEditingId(identity.id)
    setFormName(identity.name)
    setFormIdentity(identity.identity_text)
    setFormGoals(identity.goals_text)
    setFormRules(identity.rules_text)
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">{editingId ? "Edit Identity" : "Create Identity"}</CardTitle>
          <CardDescription>Define a persona identity for Reddit engagement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Tech Founder" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Identity Text</Label>
            <Textarea value={formIdentity} onChange={(e) => setFormIdentity(e.target.value)} placeholder="Who is this persona? Background, expertise..." rows={3} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Goals</Label>
            <Textarea value={formGoals} onChange={(e) => setFormGoals(e.target.value)} placeholder="What does this persona want to achieve?" rows={2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rules</Label>
            <Textarea value={formRules} onChange={(e) => setFormRules(e.target.value)} placeholder="Specific rules for this persona's writing style..." rows={2} />
          </div>
          <div className="flex gap-2">
            {editingId ? (
              <>
                <Button onClick={() => handleUpdate(editingId)} disabled={creating}>
                  <Save className="mr-2 h-4 w-4" />Update
                </Button>
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
              </>
            ) : (
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {identities.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Identities ({identities.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {identities.map((identity, i) => (
              <div key={identity.id}>
                {i > 0 && <Separator className="my-3" />}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{identity.name}</p>
                      {identity.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{identity.identity_text}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!identity.is_default && (
                      <Button variant="ghost" size="sm" onClick={() => handleSetDefault(identity.id)} title="Set as default">
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => startEdit(identity)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(identity.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}


// ============================================================
// Tones Tab
// ============================================================

function TonesTab() {
  const [tones, setTones] = useState<RedditTone[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")

  useEffect(() => {
    fetch("/api/reddit/tones")
      .then(r => r.json())
      .then(data => setTones(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: "Failed to load tones", variant: "destructive" }))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!formName.trim() || !formDescription.trim()) {
      toast({ title: "Name and description are required", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/reddit/tones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), description: formDescription.trim() }),
      })
      if (!res.ok) throw new Error()
      const tone = await res.json()
      setTones(prev => [tone, ...prev])
      setFormName("")
      setFormDescription("")
      toast({ title: "Tone created" })
    } catch {
      toast({ title: "Failed to create tone", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/reddit/tones/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        toast({ title: data.error || "Failed to delete", variant: "destructive" })
        return
      }
      setTones(prev => prev.filter(t => t.id !== id))
      toast({ title: "Tone deleted" })
    } catch {
      toast({ title: "Failed to delete tone", variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Create Tone</CardTitle>
          <CardDescription>Add a custom tone for Reddit content generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Casual Expert" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe how this tone should sound..." rows={3} />
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create
          </Button>
        </CardContent>
      </Card>

      {tones.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Tones ({tones.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tones.map((tone, i) => (
              <div key={tone.id}>
                {i > 0 && <Separator className="my-3" />}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{tone.name}</p>
                      {tone.is_preset && <Badge variant="secondary" className="text-xs">Preset</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{tone.description}</p>
                  </div>
                  {!tone.is_preset && (
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDelete(tone.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}


// ============================================================
// Global Prompt Tab
// ============================================================

function GlobalPromptTab() {
  const [prompt, setPrompt] = useState<GlobalPrompt | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [promptText, setPromptText] = useState("")
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    fetch("/api/reddit/global-prompt")
      .then(r => r.json())
      .then(data => {
        if (data && data.system_prompt) {
          setPrompt(data)
          setPromptText(data.system_prompt)
          setIsActive(data.is_active)
        }
      })
      .catch(() => toast({ title: "Failed to load global prompt", variant: "destructive" }))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!promptText.trim()) {
      toast({ title: "Prompt text is required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/reddit/global-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt: promptText.trim(), is_active: isActive }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPrompt(data)
      toast({ title: "Global prompt saved" })
    } catch {
      toast({ title: "Failed to save global prompt", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">Global Prompt</CardTitle>
        <CardDescription>
          Set a global system prompt that applies to all Reddit content generation. When active, this is injected as a "GLOBAL AGENT DIRECTIVE" into every generation prompt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Enter your global system prompt here..."
          rows={10}
          className="font-mono text-sm"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">Active</span>
            </label>
            {prompt && (
              <span className="text-xs text-muted-foreground">
                Last updated: {new Date(prompt.updated_at).toLocaleString()}
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}


// ============================================================
// Comment Templates Tab
// ============================================================

function CommentTemplatesTab() {
  const [templates, setTemplates] = useState<CommentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formName, setFormName] = useState("")
  const [formTemplate, setFormTemplate] = useState("")

  useEffect(() => {
    fetch("/api/reddit/comment-templates")
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: "Failed to load templates", variant: "destructive" }))
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!formName.trim() || !formTemplate.trim()) {
      toast({ title: "Name and template text are required", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/reddit/comment-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), template_text: formTemplate.trim() }),
      })
      if (!res.ok) throw new Error()
      const template = await res.json()
      setTemplates(prev => [template, ...prev])
      setFormName("")
      setFormTemplate("")
      toast({ title: "Template created" })
    } catch {
      toast({ title: "Failed to create template", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/reddit/comment-templates/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setTemplates(prev => prev.filter(t => t.id !== id))
      toast({ title: "Template deleted" })
    } catch {
      toast({ title: "Failed to delete template", variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Create Comment Template</CardTitle>
          <CardDescription>Create reusable templates for Reddit comment generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Helpful Expert" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Template Text</Label>
            <Textarea value={formTemplate} onChange={(e) => setFormTemplate(e.target.value)} placeholder="Write the template structure..." rows={5} className="font-mono text-sm" />
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create
          </Button>
        </CardContent>
      </Card>

      {templates.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Templates ({templates.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.map((template, i) => (
              <div key={template.id}>
                {i > 0 && <Separator className="my-3" />}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{template.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono line-clamp-3">{template.template_text}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDelete(template.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}


// ============================================================
// Services Tab
// ============================================================

function ServicesTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apifyEnabled, setApifyEnabled] = useState(false)
  const [firecrawlEnabled, setFirecrawlEnabled] = useState(false)
  const [tavilyEnabled, setTavilyEnabled] = useState(false)
  const [apifyKey, setApifyKey] = useState("")
  const [firecrawlKey, setFirecrawlKey] = useState("")
  const [tavilyKey, setTavilyKey] = useState("")

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => {
        setApifyEnabled(data.apify_enabled || false)
        setFirecrawlEnabled(data.firecrawl_enabled || false)
        setTavilyEnabled(data.tavily_enabled || false)
        const config = data.reddit_services_config || {}
        setApifyKey(config.apify_key || "")
        setFirecrawlKey(config.firecrawl_key || "")
        setTavilyKey(config.tavily_key || "")
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apify_enabled: apifyEnabled,
          firecrawl_enabled: firecrawlEnabled,
          tavily_enabled: tavilyEnabled,
          reddit_services_config: {
            apify_key: apifyKey,
            firecrawl_key: firecrawlKey,
            tavily_key: tavilyKey,
          },
        }),
      })
      if (!res.ok) throw new Error()
      toast({ title: "Services configuration saved" })
    } catch {
      toast({ title: "Failed to save services configuration", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">Scraping Services</CardTitle>
        <CardDescription>Configure API keys and enable/disable scraping services for Reddit content discovery.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Apify */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Apify</p>
              <p className="text-xs text-muted-foreground">Reddit Scraper actor for reliable data extraction</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={apifyEnabled}
                onChange={(e) => setApifyEnabled(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-xs text-muted-foreground">Enabled</span>
            </label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">API Token</Label>
            <Input
              type="password"
              value={apifyKey}
              onChange={(e) => setApifyKey(e.target.value)}
              placeholder="apify_api_..."
              disabled={!apifyEnabled}
            />
          </div>
        </div>

        <Separator />

        {/* Firecrawl */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Firecrawl</p>
              <p className="text-xs text-muted-foreground">Web scraping API for Reddit content extraction</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={firecrawlEnabled}
                onChange={(e) => setFirecrawlEnabled(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-xs text-muted-foreground">Enabled</span>
            </label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="password"
              value={firecrawlKey}
              onChange={(e) => setFirecrawlKey(e.target.value)}
              placeholder="fc-..."
              disabled={!firecrawlEnabled}
            />
          </div>
        </div>

        <Separator />

        {/* Tavily */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Tavily</p>
              <p className="text-xs text-muted-foreground">AI-powered search API for Reddit content discovery</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={tavilyEnabled}
                onChange={(e) => setTavilyEnabled(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-xs text-muted-foreground">Enabled</span>
            </label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="password"
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              placeholder="tvly-..."
              disabled={!tavilyEnabled}
            />
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
