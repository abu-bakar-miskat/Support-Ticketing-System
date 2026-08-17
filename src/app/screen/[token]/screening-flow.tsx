"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Candidate recording flow: intro → camera check → per-question
 * (read countdown → record → immediate upload → optional single retake) →
 * submit → thank-you.
 *
 * Resilience beats quality here — candidates are on home connections in
 * Chattogram. Every answer uploads the moment it's recorded (XHR so we get
 * progress), and reopening the link resumes at the first unanswered question.
 */

type Question = { key: string; position: number; prompt: string; hint: string }

type Props = {
  token: string
  candidateName: string
  roleTitle: string
  readSeconds: number
  recordSeconds: number
  maxTakes: number
  questions: Question[]
  answered: string[]
  takesUsed: Record<string, number>
}

type Stage =
  | "intro"
  | "camera"
  | "read"
  | "record"
  | "uploading"
  | "saved"
  | "submitting"
  | "done"

const COLORS = {
  base: "#030A2E",
  card: "#051251",
  border: "#384584",
  text: "#EBECF3",
  accent: "#FF379E",
  success: "#00FFD2",
  warning: "#FFB020",
  error: "#FF5C5C",
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  for (const c of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
}

function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"))
    xhr.send(blob)
  })
}

export function ScreeningFlow(props: Props) {
  const { token, questions, readSeconds, recordSeconds, maxTakes } = props

  const firstUnanswered = questions.findIndex((q) => !props.answered.includes(q.key))
  const resuming = props.answered.length > 0 && firstUnanswered > 0

  const [stage, setStage] = useState<Stage>(firstUnanswered === -1 ? "submitting" : "intro")
  const [idx, setIdx] = useState(firstUnanswered === -1 ? questions.length - 1 : firstUnanswered)
  const [countdown, setCountdown] = useState(readSeconds)
  const [uploadPct, setUploadPct] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const [takes, setTakes] = useState<Record<string, number>>(props.takesUsed)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)
  const lastBlobRef = useRef<Blob | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const beginRecordingRef = useRef<() => void>(() => {})
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const mimeRef = useRef<string>("")
  // Webcam stills sampled during recording (every 3s) — batched into labeled
  // contact sheets for the server-side gaze check. Best-effort: any failure
  // here must never block the answer itself.
  const framesRef = useRef<{ blob: Blob; atSec: number }[]>([])
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastFramesRef = useRef<{ blob: Blob; atSec: number }[]>([])

  const question = questions[idx]
  const takesLeft = maxTakes - (takes[question?.key] ?? 0)

  // ── Media setup ────────────────────────────────────────────────────────────

  const attachPreview = useCallback(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.muted = true
      videoRef.current.play().catch(() => {})
    }
  }, [])

  const startMeter = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // Meter is a nicety; recording still works without it.
    }
  }, [])

  const requestCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      })
      streamRef.current = stream
      mimeRef.current = pickMimeType()
      // Surface it immediately if the browser or another app kills the
      // camera later, rather than discovering it on a dead Start button.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setCameraError(
          "Your camera turned off or was blocked mid-session. Re-allow access in your browser, then press “Check camera again”.",
        )
      })
      setCameraError(null)
      setStage("camera")
    } catch {
      setCameraError(
        "We couldn't access your camera or microphone. Check your browser's permission prompt (usually near the address bar), allow access, and try again.",
      )
    }
  }, [])

  useEffect(() => {
    if (stage === "camera" || stage === "record") attachPreview()
    if (stage === "camera") startMeter()
    return () => {
      if (stage === "camera") {
        cancelAnimationFrame(rafRef.current)
        audioCtxRef.current?.close().catch(() => {})
        audioCtxRef.current = null
      }
    }
  }, [stage, attachPreview, startMeter])

  // Resumed with every answer already uploaded but never submitted → submit now.
  useEffect(() => {
    if (firstUnanswered === -1) void submitAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stop everything on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      cancelAnimationFrame(rafRef.current)
      audioCtxRef.current?.close().catch(() => {})
      recorderRef.current?.stop?.()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // ── Countdown timers ───────────────────────────────────────────────────────

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (deadlineRef.current) {
      clearTimeout(deadlineRef.current)
      deadlineRef.current = null
    }
  }

  const beginRead = useCallback(() => {
    clearTimer()
    setCountdown(readSeconds)
    setStage("read")
    timerRef.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    // Recording starts automatically when reading time runs out.
    deadlineRef.current = setTimeout(() => beginRecordingRef.current(), readSeconds * 1000)
  }, [readSeconds])

  const stopRecording = useCallback(() => {
    clearTimer()
    const rec = recorderRef.current
    if (rec && rec.state !== "inactive") rec.stop()
  }, [])

  const beginRecording = useCallback(() => {
    clearTimer()
    const stream = streamRef.current
    const videoTrack = stream?.getVideoTracks()[0]
    // The camera can vanish after the intro check: the browser blocked it,
    // another app took it, or permissions changed. Never fail silently — the
    // read/record card renders cameraError with a retry button.
    if (!stream || !videoTrack || videoTrack.readyState !== "live") {
      setCameraError(
        "Your camera isn't available. Your browser may be blocking it — click the camera icon near the address bar, choose Allow, then press “Check camera again” below.",
      )
      return
    }
    chunksRef.current = []
    const mime = mimeRef.current
    let rec: MediaRecorder
    try {
      // Cap bitrates so a maxed-out 90s answer stays ~14MB — Whisper rejects
      // files over 25MB, and browser defaults (~2.5Mbps) blow past that.
      const options: MediaRecorderOptions = {
        videoBitsPerSecond: 1_200_000,
        audioBitsPerSecond: 64_000,
      }
      if (mime) options.mimeType = mime
      rec = new MediaRecorder(stream, options)
    } catch {
      setErrorMsg("Recording isn't supported in this browser. Try Chrome or Safari.")
      return
    }
    recorderRef.current = rec
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    framesRef.current = []
    if (frameTimerRef.current) clearInterval(frameTimerRef.current)
    frameTimerRef.current = setInterval(() => {
      void captureFrame()
    }, 3000)
    rec.onstop = () => {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current)
        frameTimerRef.current = null
      }
      lastFramesRef.current = framesRef.current
      const blob = new Blob(chunksRef.current, { type: mime || "video/webm" })
      lastBlobRef.current = blob
      void uploadAnswer(blob)
    }
    recordStartRef.current = Date.now()
    try {
      // 1s timeslice: chunks accumulate as they speak, so a crash mid-answer
      // costs seconds rather than the whole answer.
      rec.start(1000)
    } catch {
      // start() throws on an inactive stream (camera revoked between the
      // liveness check and here) — surface it instead of dying silently.
      setCameraError(
        "Recording couldn't start — your camera or microphone stopped responding. Re-allow access in your browser, then press “Check camera again” below.",
      )
      return
    }
    setCountdown(recordSeconds)
    setStage("record")
    timerRef.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    // Auto-stop at the recording limit.
    deadlineRef.current = setTimeout(() => stopRecording(), recordSeconds * 1000)
    // idx in the deps keeps the onstop → upload closure bound to the question
    // actually being recorded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordSeconds, idx, stopRecording])

  // Keep the read-countdown deadline pointed at the freshest recording closure.
  useEffect(() => {
    beginRecordingRef.current = beginRecording
  }, [beginRecording])

  // ── Frame sampling (gaze check) ────────────────────────────────────────────

  async function captureFrame() {
    try {
      const video = videoRef.current
      if (!video || video.videoWidth === 0) return
      const w = 512
      const h = Math.round((video.videoHeight / video.videoWidth) * w)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(video, 0, 0, w, h)
      const atSec = Math.round((Date.now() - recordStartRef.current) / 1000)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.7),
      )
      if (blob) framesRef.current.push({ blob, atSec })
    } catch {
      // Frame capture is best-effort — never surface errors to the candidate.
    }
  }

  /** Compose frames into 2×3 contact sheets, each cell stamped with its time. */
  async function buildFrameSheets(frames: { blob: Blob; atSec: number }[]): Promise<Blob[]> {
    const PER_SHEET = 6
    const CELL_W = 512
    const sheets: Blob[] = []
    for (let s = 0; s < frames.length; s += PER_SHEET) {
      const group = frames.slice(s, s + PER_SHEET)
      const bitmaps = await Promise.all(group.map((f) => createImageBitmap(f.blob)))
      const cellH = Math.round((bitmaps[0].height / bitmaps[0].width) * CELL_W)
      const canvas = document.createElement("canvas")
      canvas.width = CELL_W * 2
      canvas.height = cellH * 3
      const ctx = canvas.getContext("2d")
      if (!ctx) continue
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      group.forEach((f, i) => {
        const x = (i % 2) * CELL_W
        const y = Math.floor(i / 2) * cellH
        ctx.drawImage(bitmaps[i], x, y, CELL_W, cellH)
        const label = `${Math.floor(f.atSec / 60)}:${String(f.atSec % 60).padStart(2, "0")}`
        ctx.font = "bold 20px sans-serif"
        ctx.fillStyle = "rgba(0,0,0,0.65)"
        ctx.fillRect(x + 6, y + 6, 58, 28)
        ctx.fillStyle = "#fff"
        ctx.fillText(label, x + 12, y + 27)
      })
      bitmaps.forEach((b) => b.close())
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.75),
      )
      if (blob) sheets.push(blob)
    }
    return sheets
  }

  /** Upload frame sheets next to the recording. Best-effort; returns count saved. */
  async function uploadFrameSheets(videoObjectKey: string): Promise<number> {
    try {
      const frames = lastFramesRef.current
      if (frames.length === 0) return 0
      const sheets = await buildFrameSheets(frames)
      let saved = 0
      for (let i = 0; i < sheets.length && i < 8; i++) {
        const signRes = await fetch("/api/screening/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, questionKey: question.key, frameFor: videoObjectKey, frameIndex: i }),
        })
        if (!signRes.ok) break
        const { url } = await signRes.json()
        const put = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: sheets[i],
        })
        if (!put.ok) break
        saved++
      }
      return saved
    } catch {
      return 0
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  async function uploadAnswer(blob: Blob) {
    setStage("uploading")
    setUploadPct(0)
    setErrorMsg(null)
    const durationSec = Math.round((Date.now() - recordStartRef.current) / 1000)
    const contentType = (mimeRef.current || "video/webm").startsWith("video/mp4")
      ? "video/mp4"
      : "video/webm"
    try {
      const signRes = await fetch("/api/screening/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, questionKey: question.key, contentType }),
      })
      if (!signRes.ok) {
        const data = await signRes.json().catch(() => ({}))
        throw new Error(data.error || "Couldn't prepare the upload.")
      }
      const { url, objectKey } = await signRes.json()

      await putWithProgress(url, blob, contentType, setUploadPct)

      const frameCount = await uploadFrameSheets(objectKey)

      const confirmRes = await fetch("/api/screening/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, questionKey: question.key, objectKey, durationSec, frameCount }),
      })
      if (!confirmRes.ok) {
        const data = await confirmRes.json().catch(() => ({}))
        throw new Error(data.error || "Couldn't save the answer.")
      }

      setTakes((t) => ({ ...t, [question.key]: (t[question.key] ?? 0) + 1 }))
      setStage("saved")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed.")
      setStage("saved") // saved screen renders the error + retry options
    }
  }

  function retryUpload() {
    if (lastBlobRef.current) void uploadAnswer(lastBlobRef.current)
  }

  const answerSaved = errorMsg === null

  function nextQuestion() {
    setErrorMsg(null)
    if (idx + 1 < questions.length) {
      setIdx(idx + 1)
      beginRead()
    } else {
      void submitAll()
    }
  }

  async function submitAll() {
    setStage("submitting")
    setErrorMsg(null)
    try {
      const res = await fetch("/api/screening/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Couldn't submit.")
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setStage("done")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Couldn't submit.")
      setStage("submitting")
    }
  }

  // ── UI pieces ──────────────────────────────────────────────────────────────

  const card = "rounded-[12px] border p-6 sm:p-8"
  const cardStyle = { background: COLORS.card, borderColor: COLORS.border }
  const primaryBtn =
    "inline-flex items-center justify-center rounded-[8px] px-5 py-2.5 text-[15px] font-semibold text-[#030A2E] transition-opacity hover:opacity-90 disabled:opacity-50"
  const ghostBtn =
    "inline-flex items-center justify-center rounded-[8px] border px-5 py-2.5 text-[15px] font-medium transition-colors hover:bg-white/5"

  const progress = (
    <div className="mb-6 flex items-center gap-2">
      {questions.map((q, i) => {
        const done = props.answered.includes(q.key) || i < idx || (i === idx && stage === "saved" && answerSaved)
        return (
          <div
            key={q.key}
            className="h-1 flex-1 rounded-full"
            style={{
              background: done ? COLORS.success : i === idx ? COLORS.accent : "rgba(235,236,243,0.15)",
            }}
          />
        )
      })}
    </div>
  )

  if (stage === "intro") {
    return (
      <div className={card} style={cardStyle}>
        <h1 className="mb-4 text-2xl font-semibold">
          Hi {props.candidateName.split(" ")[0]} — a short video introduction
        </h1>
        <div className="space-y-3 text-[15px] leading-relaxed" style={{ color: "rgba(235,236,243,0.75)" }}>
          <p>
            This is the next step for the <strong style={{ color: COLORS.text }}>{props.roleTitle}</strong> role.
            {questions.length} questions, about {questions.length * 2} minutes in total.
          </p>
          <p>
            For each question you get {readSeconds} seconds to read it, then up to {recordSeconds} seconds
            to answer on camera. You can retake each answer once. Each answer saves as soon as
            you record it — if your connection drops, reopen this link and you’ll continue where
            you left off.
          </p>
          <p>
            A person on our team watches every recording. We’re interested in what you say —{" "}
            <strong style={{ color: COLORS.text }}>your accent is not being scored</strong>.
          </p>
          <p>Find a quiet spot, then check your camera and microphone below.</p>
        </div>
        {resuming && (
          <p className="mt-4 text-sm" style={{ color: COLORS.warning }}>
            Welcome back — {props.answered.length} of {questions.length} answers already saved.
            You’ll continue from question {firstUnanswered + 1}.
          </p>
        )}
        {cameraError && (
          <p className="mt-4 text-sm" style={{ color: COLORS.error }}>
            {cameraError}
          </p>
        )}
        <button className={`${primaryBtn} mt-6`} style={{ background: COLORS.accent }} onClick={requestCamera}>
          Check camera &amp; microphone
        </button>
      </div>
    )
  }

  if (stage === "camera") {
    return (
      <div className={card} style={cardStyle}>
        <h2 className="mb-2 text-xl font-semibold">Camera check</h2>
        <p className="mb-4 text-[15px]" style={{ color: "rgba(235,236,243,0.7)" }}>
          Make sure you’re in frame and the level bar moves when you speak.
        </p>
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full rounded-[8px] bg-black"
          style={{ aspectRatio: "16/9", transform: "scaleX(-1)" }}
        />
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs" style={{ color: "rgba(235,236,243,0.6)" }}>
            <span>Microphone level</span>
            <span>{micLevel > 0.06 ? "Picking you up" : "Say something…"}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(235,236,243,0.12)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-75"
              style={{ width: `${Math.round(micLevel * 100)}%`, background: micLevel > 0.06 ? COLORS.success : COLORS.warning }}
            />
          </div>
        </div>
        <button
          className={`${primaryBtn} mt-6`}
          style={{ background: COLORS.accent }}
          onClick={() => beginRead()}
        >
          {resuming ? `Continue with question ${idx + 1}` : "I’m ready — show me question 1"}
        </button>
      </div>
    )
  }

  if (stage === "read" || stage === "record") {
    const recording = stage === "record"
    return (
      <div>
        {progress}
        <div className={card} style={cardStyle}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(235,236,243,0.5)" }}>
              Question {idx + 1} of {questions.length}
            </span>
            <span
              className="rounded-[8px] px-3 py-1 text-sm font-semibold tabular-nums"
              style={{
                background: recording ? "rgba(255,92,92,0.15)" : "rgba(235,236,243,0.08)",
                color: recording ? COLORS.error : countdown <= 5 ? COLORS.warning : COLORS.text,
              }}
            >
              {recording ? "● REC " : ""}
              {Math.max(0, countdown)}s
            </span>
          </div>
          <h2 className="mb-2 text-lg leading-snug font-semibold">{question.prompt}</h2>
          <p className="mb-4 text-sm italic" style={{ color: "rgba(235,236,243,0.55)" }}>
            {question.hint}
          </p>
          {recording ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full rounded-[8px] bg-black"
                style={{ aspectRatio: "16/9", transform: "scaleX(-1)" }}
              />
              <button
                className={`${primaryBtn} mt-5`}
                style={{ background: COLORS.accent }}
                onClick={stopRecording}
              >
                I’m done — stop recording
              </button>
            </>
          ) : (
            <>
              <p className="text-[15px]" style={{ color: "rgba(235,236,243,0.7)" }}>
                Recording starts automatically when the timer runs out, or start when you’re ready.
              </p>
              {cameraError && (
                <div
                  className="mt-4 rounded-[8px] px-4 py-3 text-sm"
                  style={{ background: "rgba(255,92,92,0.12)", color: COLORS.error }}
                >
                  <p className="font-medium">{cameraError}</p>
                  <button
                    className="mt-2 rounded-[8px] px-4 py-2 text-sm font-semibold"
                    style={{ background: COLORS.error, color: "#fff" }}
                    onClick={requestCamera}
                  >
                    Check camera again
                  </button>
                </div>
              )}
              <button
                className={`${primaryBtn} mt-5`}
                style={{ background: COLORS.accent }}
                onClick={beginRecording}
              >
                Start recording now
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (stage === "uploading") {
    return (
      <div>
        {progress}
        <div className={card} style={cardStyle}>
          <h2 className="mb-3 text-lg font-semibold">Saving your answer…</h2>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(235,236,243,0.12)" }}>
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${uploadPct}%`, background: COLORS.success }}
            />
          </div>
          <p className="mt-2 text-sm tabular-nums" style={{ color: "rgba(235,236,243,0.6)" }}>
            {uploadPct}% — keep this tab open
          </p>
        </div>
      </div>
    )
  }

  if (stage === "saved") {
    const isLast = idx + 1 >= questions.length
    return (
      <div>
        {progress}
        <div className={card} style={cardStyle}>
          {answerSaved ? (
            <>
              <h2 className="mb-2 text-lg font-semibold" style={{ color: COLORS.success }}>
                Answer {idx + 1} saved
              </h2>
              <p className="mb-5 text-[15px]" style={{ color: "rgba(235,236,243,0.7)" }}>
                {takesLeft > 0
                  ? "Happy with it? Move on — or record it once more. If you retake, the new version replaces this one."
                  : "That was your retake, so this version is the one we’ll watch."}
              </p>
              <div className="flex flex-wrap gap-3">
                <button className={primaryBtn} style={{ background: COLORS.accent }} onClick={nextQuestion}>
                  {isLast ? "Finish and submit" : "Next question"}
                </button>
                {takesLeft > 0 && (
                  <button
                    className={ghostBtn}
                    style={{ borderColor: COLORS.border, color: COLORS.text }}
                    onClick={() => beginRead()}
                  >
                    Retake this answer
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-lg font-semibold" style={{ color: COLORS.error }}>
                That upload didn’t go through
              </h2>
              <p className="mb-5 text-[15px]" style={{ color: "rgba(235,236,243,0.7)" }}>
                {errorMsg} Your recording is still here — try again when your connection settles.
              </p>
              <button className={primaryBtn} style={{ background: COLORS.accent }} onClick={retryUpload}>
                Try the upload again
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (stage === "submitting") {
    return (
      <div className={card} style={cardStyle}>
        <h2 className="mb-2 text-lg font-semibold">
          {errorMsg ? "Nearly there" : "Submitting…"}
        </h2>
        {errorMsg ? (
          <>
            <p className="mb-5 text-[15px]" style={{ color: "rgba(235,236,243,0.7)" }}>
              {errorMsg}
            </p>
            <button className={primaryBtn} style={{ background: COLORS.accent }} onClick={() => void submitAll()}>
              Submit my answers
            </button>
          </>
        ) : (
          <p className="text-[15px]" style={{ color: "rgba(235,236,243,0.7)" }}>
            Locking in your answers.
          </p>
        )}
      </div>
    )
  }

  // done
  return (
    <div className={card} style={cardStyle}>
      <h1 className="mb-3 text-2xl font-semibold" style={{ color: COLORS.success }}>
        All done — thank you
      </h1>
      <div className="space-y-3 text-[15px] leading-relaxed" style={{ color: "rgba(235,236,243,0.75)" }}>
        <p>Your answers are in.</p>
        <p>
          Someone on the team will watch your recordings — usually within a few working days —
          and you’ll hear from us by email about the next step either way. You can close this tab.
        </p>
      </div>
    </div>
  )
}
