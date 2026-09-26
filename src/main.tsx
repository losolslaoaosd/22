import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import type { ReactNode } from "react"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import "./style.css"

function HeaderActions() {
  return <nav className="header-actions" aria-label="Быстрые действия">
    <Button id="header-upgrade" type="button" variant="outline" size="sm" className="header-upgrade hidden"><ArrowUpRight data-icon="inline-start" aria-hidden="true" />Повысить уровень</Button>
    <Button id="header-account" type="button" variant="ghost" size="sm" className="hidden">Аккаунт</Button>
    <Button asChild variant="outline" size="sm" className="header-contact"><a href="https://t.me/bluefin_m" target="_blank" rel="noopener noreferrer">Связаться со мной <ArrowUpRight data-icon="inline-end" aria-hidden="true" /></a></Button>
    <Button id="header-owner" type="button" variant="ghost" size="sm" className="hidden">Панель владельца</Button>
  </nav>
}

function LandingLogin() {
  return <Card className="hero-login-card">
    <CardHeader>
      <span className="hero-card-kicker">БЫСТРЫЙ ВХОД</span>
      <CardTitle>Ваш доступ к BLUFIN+</CardTitle>
      <CardDescription>Введите ID Binodex, чтобы продолжить вход.</CardDescription>
    </CardHeader>
    <CardContent>
      <form id="landing-id-form">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="landing-id">ID аккаунта Binodex</FieldLabel>
            <Input id="landing-id" type="text" inputMode="numeric" autoComplete="username" placeholder="Введите ваш ID" required />
          </Field>
          <Button id="landing-id-submit" type="submit" className="hero-submit">Войти по ID <ArrowRight aria-hidden="true" /></Button>
        </FieldGroup>
      </form>
    </CardContent>
    <CardFooter>
      <span>Первый раз в BLUFIN+?</span>
      <button id="begin-button" className="hero-register-link" type="button">Получить доступ <ArrowUpRight aria-hidden="true" /></button>
    </CardFooter>
  </Card>
}

function HeroTrails() {
  return <svg className="hero-trails" viewBox="0 0 1400 650" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="hero-trail-ink" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#1e58b3" stopOpacity=".08" /><stop offset=".55" stopColor="#267ce9" stopOpacity=".65" /><stop offset="1" stopColor="#69c9ff" stopOpacity=".9" /></linearGradient></defs>
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
  mount(actions, <LandingLogin />)
  visual.replaceChildren()
  mount(visual, <img className="hero-person" src="./hero-bluefin.png" alt="" />)
}
