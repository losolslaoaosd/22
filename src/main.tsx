import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChartNoAxesCombined, History, Gem, CircleUserRound, Settings, ShieldCheck, Upload, ChevronLeft, ChevronDown, Pause, Play, Info, X, Zap, Layers, Scan } from "lucide-react"
import LatticeLoader from "@/components/LatticeLoader"
import { tr, useLanguage } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import "./style.css"

function HeaderActions() {
  useLanguage()
  return <nav className="header-actions" aria-label={tr("r.quickActions")}>
    <Button id="header-login" data-route="login" variant="ghost" className="public-login">{tr("h.23")}</Button>
    <Button id="header-account" variant="ghost" className="hidden">{tr("h.26")}</Button>
    <Button id="header-owner" variant="ghost" className="hidden">{tr("h.24")}</Button>
  </nav>
}

function PublicNavigation() {
  useLanguage()
  const nav = useRef<HTMLElement>(null)
  const [active, setActive] = useState("how")
  const [indicator, setIndicator] = useState({ x: 0, width: 0 })
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: "-15% 0px -65% 0px" })
    ;["how", "levels", "faq"].forEach(id => { const section = document.getElementById(id); if (section) observer.observe(section) })
    return () => observer.disconnect()
  }, [])
  const howLabel = tr("h.36"), faqLabel = tr("h.46")
  useLayoutEffect(() => {
    const update = () => {
      const item = nav.current?.querySelector<HTMLElement>(`[href="#${active}"]`)
      if (item) setIndicator({ x: item.offsetLeft, width: item.offsetWidth })
    }
    update()
    const observer = new ResizeObserver(update)
    if (nav.current) observer.observe(nav.current)
    return () => observer.disconnect()
  }, [active, howLabel, faqLabel])
  return <nav ref={nav} className="public-nav" aria-label={tr("h.4")}>
    {[["how", "h.36"], ["levels", "still.levels"], ["faq", "h.46"]].map(([id, key]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined} onClick={() => setActive(id)}>{tr(key)}</a>)}
    <span className="nav-underline" aria-hidden="true" style={{ width: indicator.width, transform: `translateX(${indicator.x}px)` }} />
  </nav>
}

function LandingAccess() {
  useLanguage()
  return <div className="hero-cta">
    <Button id="begin-button" className="hero-submit">{tr("h.33")}</Button>
    <button id="landing-login" className="hero-register-link" type="button">{tr("h.35")}</button>
  </div>
}

// Original filament field; no proprietary registry code is bundled.
function FilamentField() {
  useLanguage()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [paused, setPaused] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setPaused(media.matches)
    media.addEventListener("change", update)
    update()
    return () => media.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    const element = canvas.current, context = element?.getContext("2d")
    if (!element || !context) return
    let width = 0, height = 0, frame = 0, visible = true, last = 0
    const draw = (time: number) => {
      context.clearRect(0, 0, width, height)
      const phase = paused ? .5 : time * .000045
      for (let thread = 0; thread < 64; thread++) {
        const n = thread / 63
        context.beginPath()
        for (let step = 0; step <= 100; step++) {
          const p = step / 100, x = width * (.2 + p * .95)
          const bend = Math.sin(p * 5.8 + n * 1.8 + phase) * height * .1
          const ripple = Math.sin(p * 14 + n * 3 - phase) * height * .024
          const y = height * (.95 - p * .87 + (n - .5) * .58) + bend + ripple
          if (step === 0) context.moveTo(x, y); else context.lineTo(x, y)
        }
        const opacity = .08 + Math.pow(Math.sin(n * Math.PI), 5) * .25
        context.strokeStyle = thread % 5 === 0 ? `rgba(169,191,232,${opacity})` : `rgba(198,203,212,${opacity * .65})`
        context.lineWidth = thread % 5 === 0 ? .8 : .5
        context.stroke()
      }
    }
    const loop = (time: number) => {
      if (!paused && visible && !document.hidden && time - last > 33) { draw(time); last = time }
      frame = requestAnimationFrame(loop)
    }
    const resize = () => {
      const rect = element.getBoundingClientRect(); width = rect.width; height = rect.height
      const ratio = Math.min(devicePixelRatio || 1, 1.5)
      element.width = width * ratio; element.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0); draw(performance.now())
    }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(element)
    const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting }); intersection.observe(element)
    resize(); if (!paused) frame = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect() }
  }, [paused])
  return <><canvas ref={canvas} className="filament-canvas" aria-hidden="true" /><button type="button" className="motion-control" onClick={() => setPaused(!paused)} aria-label={tr(paused ? "still.play" : "still.pause")} title={tr(paused ? "still.play" : "still.pause")} aria-pressed={paused}>{paused ? <Play size={16} /> : <Pause size={16} />}</button></>
}
function mount(element: Element, component: ReactNode) { flushSync(() => createRoot(element).render(component)) }
function AnalysisLoader() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working")
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<string>).detail
      if (next === "processing") setStatus("working")
      if (next === "done" || next === "error") setStatus(next)
    }
    window.addEventListener("blufin:analysis-state", update)
    return () => window.removeEventListener("blufin:analysis-state", update)
  }, [])
  return <LatticeLoader status={status} />
}
const loader = document.querySelector("#lattice-loader")
if (loader) mount(loader, <AnalysisLoader />)
const navIcons = { dashboard: ChartNoAxesCombined, history: History, level: Gem, account: CircleUserRound, settings: Settings, "owner-stats-view": ShieldCheck }
document.querySelectorAll<HTMLButtonElement>("[data-route]").forEach(button => {
  const Icon = navIcons[button.dataset.route as keyof typeof navIcons]
  if (!Icon || !button.closest(".app-sidebar, .mobile-tabs")) return
  const existing = button.querySelector("span[aria-hidden]")
  if (existing) existing.remove(); else if (button.firstChild?.nodeType === Node.TEXT_NODE) button.firstChild.remove()
  const host = document.createElement("span"); host.className = "nav-icon"; host.setAttribute("aria-hidden", "true")
  button.prepend(host); mount(host, <Icon size={20} strokeWidth={1.7} />)
})
const iconTargets = [[".upload-icon", Upload], ["#sidebar-collapse", ChevronLeft], ["#mode-select > span", ChevronDown], [".mode-choice:nth-child(1) .mode-icon", Zap], [".mode-choice:nth-child(2) .mode-icon", Layers], [".mode-choice:nth-child(3) .mode-icon", Scan]] as const
for (const [selector, Icon] of iconTargets) {
  const element = document.querySelector(selector)
  if (element) { element.replaceChildren(); mount(element, <Icon size={20} strokeWidth={1.7} />) }
}
document.querySelectorAll(".guide-top > button, #remove-file, #preview-close, #site-menu-close").forEach(element => { element.replaceChildren(); mount(element, <X size={20} strokeWidth={1.7} />) })
document.querySelectorAll(".mode-info").forEach(element => { element.replaceChildren(); mount(element, <Info size={16} />) })
const header = document.querySelector(".site-menu-wrap")
if (header?.parentElement) {
  const host = document.createElement("div"); host.id = "header-actions-root"; header.before(host); mount(host, <HeaderActions />)
}
const navigation = document.querySelector("#public-navigation")
if (navigation) mount(navigation, <PublicNavigation />)
const actions = document.querySelector(".hero-actions")
if (actions) { actions.replaceChildren(); mount(actions, <LandingAccess />) }
const field = document.querySelector("#hero-field")
if (field) mount(field, <FilamentField />)
