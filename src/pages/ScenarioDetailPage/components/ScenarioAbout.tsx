import { memo } from 'react'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import { ScenarioAboutView, type ScenarioAboutViewProps } from './ScenarioAboutView'

export const ScenarioAbout = memo(function ScenarioAbout(props: Omit<ScenarioAboutViewProps, 'preset'>) {
  const preset = useOrgThemePreset()
  return <ScenarioAboutView {...props} preset={preset} />
})
