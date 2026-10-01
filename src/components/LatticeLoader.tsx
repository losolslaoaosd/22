import { useEffect, useState } from "react"
import { Check, CircleAlert, BrainCircuit } from "lucide-react"
import { tr, useLanguage } from "@/lib/i18n"

type Status = "working" | "done" | "error"

export default function LatticeLoader({ status, label }: { status: Status; label?: string }) {
  useLanguage()
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (status !== "working") return
    setSeconds(0)
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [status])

  const Icon = status === "done" ? Check : status === "error" ? CircleAlert : BrainCircuit

  return <div className={`lattice-loader lattice-${status}`}>
    <div className="processing-core" aria-hidden="true">
      <svg className="processing-orbit" viewBox="0 0 160 160">
        <circle className="orbit-base" cx="80" cy="80" r="65" />
        <circle className="orbit-flow" cx="80" cy="80" r="65" />
        <circle className="orbit-inner" cx="80" cy="80" r="49" />
      </svg>
      <Icon size={36} strokeWidth={1.4} />
    </div>
    <div className="processing-elapsed">
      <span>{status === "done" ? tr("r.done") : status === "error" ? tr("r.error") : label || tr("r.analysis")}</span>
      <time>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</time>
    </div>
  </div>
}
