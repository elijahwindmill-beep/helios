import { MapView } from './map/MapView';
import { LayerPanel } from './ui/LayerPanel';
import { SearchBar } from './ui/SearchBar';
import { CameraReadout } from './ui/CameraReadout';
import { MapButtons } from './ui/MapButtons';
import { AboutDialog } from './ui/AboutDialog';
import { SunCard } from './ui/SunCard';
import { SunChart } from './ui/SunChart';
import { Tutorial } from './ui/Tutorial';
import { WeatherWarning } from './ui/Weather';
import { DrawBar, DropZone, LayerNotice, PhotoViewer } from './ui/LayerTools';
import { TopBar } from './ui/TopBar';
import { ForecastStrip } from './ui/ForecastStrip';
import { Alerts } from './ui/Alerts';
import { ToolDock } from './ui/ToolDock';
import { useNarrow, useReadoutInPanel } from './ui/useMedia';
import { LensOverlay } from './ui/LensOverlay';

export function App() {
  // Desktop: a HUD around the map (top bar, forecast, alerts, dock). Phone: compact cards.
  const narrow = useNarrow();
  const readoutInPanel = useReadoutInPanel();
  return (
    <div className="app" data-layout={narrow ? 'compact' : 'wide'}>
      <MapView />
      {narrow ? (
        <>
          <SearchBar />
          <WeatherWarning />
          <SunCard />
        </>
      ) : (
        <>
          <TopBar />
          <ForecastStrip />
          <Alerts />
          <ToolDock />
        </>
      )}
      <LayerPanel />
      <SunChart withControls={!narrow} />
      <MapButtons />
      {!readoutInPanel && <CameraReadout />}
      <LensOverlay />
      <DrawBar />
      <LayerNotice />
      <PhotoViewer />
      <DropZone />
      <AboutDialog />
      <Tutorial />
    </div>
  );
}
