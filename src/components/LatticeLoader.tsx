import { useEffect, useState } from "react"

type Status = "working" | "done" | "error"

export default function LatticeLoader({ status, label = "Анализ" }: { status: Status; label?: string }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (status !== "working") return
    setSeconds(0)
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [status])

  return <div className={`lattice-loader lattice-${status}`} aria-live="polite">
    <div className="lattice-cells" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => <span key={index} style={{ animationDelay: `${index * 90}ms` }} />)}
    </div>
    <strong>{status === "done" ? "Готово" : status === "error" ? "Ошибка" : label}</strong>
    {status === "working" && <small>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</small>}
  </div>
}
