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
import { DrawBar, DropZone, LayerNotice, PhotoViewer, SpotViewer } from './ui/LayerTools';
import { TopBar } from './ui/TopBar';
import { ForecastStrip } from './ui/ForecastStrip';
import { Alerts } from './ui/Alerts';
import { ToolDock } from './ui/ToolDock';
import { useNarrow, useReadoutInPanel } from './ui/useMedia';
import { LensOverlay } from './ui/LensOverlay';
import { ClearViewButton, HudTabs } from './ui/HudTabs';
import { Timeline } from './ui/Timeline';
import { Inspector } from './ui/Inspector';
import { ExportDialog } from './ui/ExportDialog';
import { useTimeline } from './store/timeline';
import { useApp } from './store/app';
import { useTheme } from './ui/useTheme';
import { StandBar } from './ui/StandView';
import { useStand } from './store/stand';
import { PHONE_LENS } from './scene/lensStrength';

export function App() {
  // Desktop: a HUD around the map (top bar, forecast, alerts, dock). Phone: compact cards.
  const narrow = useNarrow();
  const readoutInPanel = useReadoutInPanel();
  const hud = useApp((s) => s.hud);
  const lens = useApp((s) => (s.overlays.lens ? s.lensStrength : 0)) * (narrow ? PHONE_LENS : 1);
  const layersOpen = useApp((s) => s.layersOpen);
  const timeline = useTimeline((s) => s.open);
  const inspecting = useTimeline((s) => s.open && s.selected !== null);
  const standing = useStand((s) => s.active);
  useTheme();
  return (
    <div
      className="app"
      data-layout={narrow ? 'compact' : 'wide'}
      data-hide-left={!hud.left || undefined}
      data-hide-right={!hud.right || undefined}
      data-hide-top={!hud.top || undefined}
      data-hide-bottom={!hud.bottom || undefined}
      data-timeline={timeline || undefined}
      data-inspector={inspecting || undefined}
      data-standing={standing || undefined}
      data-layers-open={(narrow && layersOpen) || undefined}
      style={{ '--lens': lens } as React.CSSProperties}
    >
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
      <Timeline />
      <Inspector />
      <LensOverlay />
      {narrow ? (
        <ClearViewButton />
      ) : (
        <>
          <HudTabs />
          <ClearViewButton restoreOnly />
        </>
      )}
      <DrawBar />
      <StandBar />
      <LayerNotice />
      <PhotoViewer />
      <SpotViewer />
      <DropZone />
      <ExportDialog />
      <AboutDialog />
      <Tutorial />
    </div>
  );
}
