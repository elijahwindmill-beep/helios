import { MapView } from './map/MapView';
import { LayerPanel } from './ui/LayerPanel';
import { SearchBar } from './ui/SearchBar';
import { CameraReadout } from './ui/CameraReadout';
import { MapButtons } from './ui/MapButtons';
import { AboutDialog } from './ui/AboutDialog';

export function App() {
  return (
    <div className="app" data-theme="paper">
      <MapView />
      <LayerPanel />
      <SearchBar />
      <MapButtons />
      <CameraReadout />
      <AboutDialog />
    </div>
  );
}
