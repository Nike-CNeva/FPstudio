
/**
 * ОТВЕТСТВЕННОСТЬ: Агрегатор модульных компонентов боковой панели.
 * Поддерживает обратную совместимость для PartEditorSidebar.tsx.
 */
export * from './ManualModesSection';
export * from './PartPropertiesForm';
export * from './PlacedPunchesPanel';
export * from './PlacementSettingsPanel';

import { ManualPunchModeSelector, NibbleSettingsPanel, DestructSettingsPanel } from './ManualModesSection';
import { PartPropertiesForm } from './PartPropertiesForm';
import { PlacedPunchesPanel } from './PlacedPunchesPanel';
import { PlacementSettingsPanel as PlacementSettings } from './PlacementSettingsPanel';

export {
    ManualPunchModeSelector,
    NibbleSettingsPanel,
    DestructSettingsPanel,
    PartPropertiesForm,
    PlacedPunchesPanel,
    PlacementSettings
};
