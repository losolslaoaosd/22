import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import type { ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import "./style.css"

function HeaderActions() {
  return <nav className="header-actions" aria-label="Быстрые действия">
    <Button id="header-account" type="button" variant="ghost" size="sm" className="hidden">Аккаунт</Button>
    <Button asChild variant="outline" size="sm" className="header-contact"><a href="https://t.me/bluefin_m" target="_blank" rel="noopener noreferrer">Связаться со мной <ArrowUpRight data-icon="inline-end" aria-hidden="true" /></a></Button>
    <Button id="header-owner" type="button" variant="ghost" size="sm" className="hidden">Панель владельца</Button>
  </nav>
}

function LandingAccess() {
  return <Card className="hero-login-card">
    <CardHeader>
      <span className="hero-card-kicker">НАЧНИТЕ С BLUFIN+</span>
      <CardTitle>Откройте доступ к анализу</CardTitle>
      <CardDescription>Создайте аккаунт Binodex, подтвердите ID и выберите уровень доступа.</CardDescription>
    </CardHeader>
    <CardContent>
      <Button id="begin-button" type="button" className="hero-submit">Получить доступ <ArrowUpRight aria-hidden="true" /></Button>
    </CardContent>
    <CardFooter>
      <button id="landing-login" className="hero-register-link" type="button">Уже есть аккаунт? Войти</button>
    </CardFooter>
  </Card>
}

function HeroTrails() {
  return <svg className="hero-trails" viewBox="0 0 1400 650" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="hero-trail-ink" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#1b315b" stopOpacity=".08" /><stop offset=".55" stopColor="#3359a4" stopOpacity=".6" /><stop offset="1" stopColor="#7994c5" stopOpacity=".8" /></linearGradient></defs>
    <path d="M405 602 C600 565 740 520 900 396 S1190 210 1425 80" />
    <path d="M515 645 C720 615 850 550 1010 442 S1250 295 1435 180" />
    <path d="M630 664 C790 630 960 580 1100 500 S1310 390 1450 310" />
    <path d="M720 695 C865 645 1000 620 1150 548 S1360 450 1450 395" />
  </svg>
}

function mount(element: Element, component: ReactNode) {
  flushSync(() => createRoot(element).render(component))
}

const header = document.querySelector(".site-menu-wrap")
if (header?.parentElement) {
  const host = document.createElement("div")
  host.id = "header-actions-root"
  header.before(host)
  mount(host, <HeaderActions />)
}

const heroGrid = document.querySelector(".hero-grid")
const actions = document.querySelector(".hero-actions")
const visual = document.querySelector(".hero-visual")
if (heroGrid && actions && visual) {
  const art = document.createElement("div")
  art.className = "hero-art"
  heroGrid.prepend(art)
  mount(art, <HeroTrails />)
  actions.replaceChildren()
  mount(actions, <LandingAccess />)
  visual.replaceChildren()
  mount(visual, <>
    <div className="hero-chart-art" aria-hidden="true">
      <img className="hero-candles" src="./chart-candles.png" alt="" />
      <svg className="hero-growth" viewBox="0 0 900 420" preserveAspectRatio="none">
        <path d="M18 355 C125 347 180 322 258 330 S395 280 465 293 S570 238 645 233 S755 132 880 56" />
        <path d="M18 380 C150 370 245 350 319 346 S485 310 545 272 S730 205 880 123" />
      </svg>
    </div>
    <div className="hero-balance" aria-label="Демонстрация интерфейса">
      <span>ПРИМЕР ОТОБРАЖЕНИЯ</span>
      <strong data-count-to="12480.50">$0.00</strong>
      <small><b data-count-to="2481.32">+$0.00</b> PROFIT</small>
    </div>
    <img className="hero-person" src="./hero-bluefin.png" alt="" />
  </>)
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const values = visual.querySelectorAll<HTMLElement>("[data-count-to]")
  const updateNumbers = (progress: number) => values.forEach((node) => {
    const value = Number(node.dataset.countTo) * progress
    node.textContent = `${node.tagName === "B" ? "+" : ""}$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  })
  if (reduceMotion.matches) updateNumbers(1)
  else {
    const start = performance.now()
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / 1500)
      updateNumbers(1 - Math.pow(1 - t, 3))
      if (t < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
}
