import { useEffect, useState } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function PwaInstall() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)))

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (standalone || !event) return null

  return (
    <button
      type="button"
      className="ghost"
      onClick={async () => {
        await event.prompt()
        await event.userChoice
        setEvent(null)
      }}
    >
      Install app
    </button>
  )
}
