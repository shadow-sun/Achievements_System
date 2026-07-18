import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Award } from 'lucide-react'
import './styles.css'

function playUnlockSound() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const context = new AudioContextClass()
  const now = context.currentTime
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 0.32, context.sampleRate)
  const channel = noiseBuffer.getChannelData(0)
  for (let index = 0; index < channel.length; index += 1) {
    const fade = 1 - index / channel.length
    channel[index] = (Math.random() * 2 - 1) * fade * fade
  }
  const noise = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const noiseGain = context.createGain()
  noise.buffer = noiseBuffer
  filter.type = 'bandpass'; filter.frequency.setValueAtTime(1300, now); filter.Q.value = 0.7
  noiseGain.gain.setValueAtTime(0.14, now); noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32)
  noise.connect(filter).connect(noiseGain).connect(context.destination)
  noise.start(now)

  ;[523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'; oscillator.frequency.value = frequency
    const start = now + 0.12 + index * 0.065
    gain.gain.setValueAtTime(0.001, start); gain.gain.exponentialRampToValueAtTime(0.12, start + 0.018); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5)
    oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.52)
  })
}

function Popup() {
  const params = new URLSearchParams(location.search)
  const title = params.get('title') || '计划完成'
  const subtitle = params.get('subtitle') || '你又向目标前进了一步'
  useEffect(() => {
    playUnlockSound()
    const timer = window.setTimeout(() => window.close(), 5600)
    return () => window.clearTimeout(timer)
  }, [])
  return <div className="unlock-popup"><div className="unlock-flare" /><div className="unlock-icon"><Award /></div><div className="unlock-copy"><span>ACHIEVEMENT UNLOCKED</span><strong>{title}</strong><p>{subtitle}</p></div><div className="unlock-edge" /></div>
}

createRoot(document.getElementById('popup-root')!).render(<Popup />)
