import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Step1ChooseType, type ImportKind } from './Step1ChooseType'
import { Step2Compendium } from './Step2Compendium'
import { Step2Json } from './Step2Json'
import { Step2Open5e } from './Step2Open5e'

export function ImportWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'choose' | ImportKind>('choose')

  function handleDone() {
    navigate('/sources')
  }

  const onBack = () => setStep('choose')

  if (step === 'choose') return <Step1ChooseType onChoose={setStep} />
  if (step === 'open5e') return <Step2Open5e onBack={onBack} onDone={handleDone} />
  if (step === 'compendium') return <Step2Compendium onBack={onBack} onDone={handleDone} />
  return <Step2Json onBack={onBack} onDone={handleDone} />
}
