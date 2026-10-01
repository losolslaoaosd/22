import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChartNoAxesCombined, History, Gem, CircleUserRound, Settings, ShieldCheck, Upload, ChevronLeft, ChevronDown, Pause, Play, Info, X, Zap, Layers, Scan } from "lucide-react"
import LatticeLoader from "@/components/LatticeLoader"
import SilkWavesBackground from "@/components/SilkWavesBackground"
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

function HeroBackground() {
  useLanguage()
  const [paused, setPaused] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setPaused(media.matches)
    media.addEventListener("change", update)
    update()
    return () => media.removeEventListener("change", update)
  }, [])
  return <><SilkWavesBackground paused={paused} /><button type="button" className="motion-control" onClick={() => setPaused(!paused)} aria-label={tr(paused ? "still.play" : "still.pause")} title={tr(paused ? "still.play" : "still.pause")} aria-pressed={paused}>{paused ? <Play size={16} /> : <Pause size={16} />}</button></>
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
if (field) mount(field, <HeroBackground />)
