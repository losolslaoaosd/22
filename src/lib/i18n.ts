import { useEffect, useState } from "react"

type Language = "ru" | "en"
type I18n = { language: Language; t: (key: string) => string }
declare global { interface Window { BluFinI18n: I18n } }
const i18n = window.BluFinI18n

export const tr = (key: string) => i18n.t(key)

export function useLanguage() {
  const [, setLanguage] = useState<Language>(i18n.language)
  useEffect(() => {
    const update = (event: Event) => setLanguage((event as CustomEvent<Language>).detail)
    document.addEventListener("blufin:languagechange", update)
    return () => document.removeEventListener("blufin:languagechange", update)
  }, [])
}
