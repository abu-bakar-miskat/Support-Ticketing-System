"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Suggestion = {
  id: string
  name: string
  email: string
  board: string
  invited?: boolean
  rejected?: boolean
}

const TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[12.5px] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

/**
 * Invite form with suggestions pulled from the caller's recruitment boards —
 * picking a candidate fills name + email and links the session to the board
 * row. Free typing still works for candidates not on a board yet.
 */
export function InviteForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [roleTitle, setRoleTitle] = useState("Frontend Developer")
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showList, setShowList] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expiryDays, setExpiryDays] = useState(7)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSubject, setEmailSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")
  const [result, setResult] = useState<{ url: string; emailSent: boolean } | null>(null)
  const nameBoxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    fetch("/api/screening/candidates")
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d) => setSuggestions(d.candidates ?? []))
      .catch(() => {})
  }, [open])

  // Close the dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (nameBoxRef.current && !nameBoxRef.current.contains(e.target as Node)) {
        setShowList(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  const q = name.trim().toLowerCase()
  const matches = q
    ? suggestions.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    : suggestions
  const visible = matches.slice(0, 8)

  function pick(s: Suggestion) {
    setName(s.name)
    if (s.email) setEmail(s.email)
    setCandidateId(s.id)
    setShowList(false)
  }

  async function loadEmailPreview() {
    setEmailLoading(true)
    try {
      const res = await fetch("/api/screening/email-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateName: name, roleTitle, expiryDays }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Couldn't load the email preview.")
      setEmailSubject(data.subject)
      setEmailBody(data.text)
      setEmailOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load the email preview.")
    } finally {
      setEmailLoading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/screening/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: name,
          email,
          roleTitle,
          candidateId,
          expiryDays,
          ...(emailOpen ? { emailSubject, emailBody } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Couldn't create the invite.")
      setResult({ url: data.url, emailSent: data.emailSent })
      toast.success(data.emailSent ? "Invite created and emailed" : "Invite created — share the link manually")
      setName("")
      setEmail("")
      setCandidateId(null)
      setEmailOpen(false)
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the invite.")
    } finally {
      setBusy(false)
    }
  }

  const resultPanel = result && (
    <div className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
      <span className="text-emerald-500">
        Invite created{result.emailSent ? " and emailed" : " — send the candidate this link"}:
      </span>
      <code className="text-muted-foreground break-all select-all">{result.url}</code>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => {
          void navigator.clipboard.writeText(result.url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  )

  if (!open) {
    return (
      <div className="space-y-3">
        <Button
          onClick={() => {
            setResult(null)
            setOpen(true)
          }}
        >
          New screening invite
        </Button>
        {resultPanel}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="pen-glass-panel border-border rounded-2xl border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative" ref={nameBoxRef}>
          <Input
            placeholder="Candidate name — pick or type"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setCandidateId(null)
              setShowList(true)
            }}
            onFocus={() => setShowList(true)}
            autoComplete="off"
            required
          />
          {showList && visible.length > 0 && (
            <ul className="bg-popover border-border absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border py-1 shadow-lg">
              {visible.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`hover:bg-muted flex w-full flex-col items-start px-3 py-1.5 text-left ${s.rejected ? "opacity-50" : ""}`}
                    onClick={() => pick(s)}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {s.name}
                      {s.invited && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                          <Check className="h-2.5 w-2.5" /> invited
                        </span>
                      )}
                      {s.rejected && (
                        <span className="bg-destructive/15 text-destructive inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                          rejected
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {s.email || "no email on board"} · {s.board}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Input
          type="email"
          placeholder="Candidate email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          placeholder="Role title"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          required
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          Link valid for
          <Input
            type="number"
            min={1}
            max={30}
            value={expiryDays}
            onChange={(e) => setExpiryDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
            className="w-16"
          />
          days
        </label>
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={emailLoading || !roleTitle.trim()}
          onClick={() => (emailOpen ? setEmailOpen(false) : void loadEmailPreview())}
        >
          {emailLoading ? "Loading email…" : emailOpen ? "Use default email instead" : "Preview & edit email"}
        </Button>
      </div>

      {emailOpen && (
        <div className="border-border mt-3 space-y-2 rounded-lg border p-3">
          <Input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Email subject"
            className="font-medium"
          />
          <textarea
            className={cn(TEXTAREA, "font-mono leading-relaxed")}
            rows={16}
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
          />
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
            <span>
              <code>[SCREENING LINK]</code> becomes the candidate&apos;s personal link when sent.
            </span>
            <Button type="button" variant="link" size="xs" disabled={emailLoading} onClick={() => void loadEmailPreview()}>
              Reset to template
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send invite"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {candidateId && <span className="text-muted-foreground text-xs">Linked to board candidate</span>}
      </div>
    </form>
  )
}
