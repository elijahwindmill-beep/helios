import { MapView } from './map/MapView';
import { LayerPanel } from './ui/LayerPanel';
import { SearchBar } from './ui/SearchBar';
import { CameraReadout } from './ui/CameraReadout';
import { MapButtons } from './ui/MapButtons';
import { AboutDialog } from './ui/AboutDialog';
import { SunCard } from './ui/SunCard';
import { SunArc } from './ui/SunArc';
import { Tutorial } from './ui/Tutorial';
import { WeatherWarning } from './ui/Weather';
import { DrawBar, DropZone, LayerNotice, PhotoViewer } from './ui/LayerTools';

export function App() {
  return (
    <div className="app" data-theme="paper">
      <MapView />
      <LayerPanel />
      <SearchBar />
      <WeatherWarning />
      <SunCard />
      <SunArc />
      <MapButtons />
      <CameraReadout />
      <AboutDialog />
      <DrawBar />
      <LayerNotice />
      <PhotoViewer />
      <DropZone />
      <Tutorial />
    </div>
  );
}
