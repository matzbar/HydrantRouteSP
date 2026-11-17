import { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import AppHeader from "../components/AppHeader";
import EmptyState from "../components/EmptyState";
import GeocodeStatusBar from "../components/GeocodeStatusBar";
import GpsConsent from "../components/GpsConsent";
import HydrantTable from "../components/HydrantTable";
import MapPanel from "../components/MapPanel";
import RoutePanel from "../components/RoutePanel";
import RouteResult from "../components/RouteResult";
import StationCard from "../components/StationCard";
import StatsBar from "../components/StatsBar";
import useGps from "../hooks/useGps";
import useMapConfig from "../hooks/useMapConfig";
import useRoute from "../hooks/useRoute";
import useStationData from "../hooks/useStationData";
import useStations from "../hooks/useStations";
import { NO_FILTERS, filterHydrants, isFiltering } from "../lib/hydrantFilters";
import { hasCoords } from "../lib/hydrants";

const SP_FALLBACK = { lat: -23.5612, lon: -46.6558 };
const DEFAULT_STOPS = 5;

/**
 * Página única do app. Junta as partes: estação → hidrantes (lista e mapa, com os mesmos filtros) → rota.
 * A lógica de cada parte fica nos hooks (pasta hooks/); aqui ficam só as regras que ligam uma à outra.
 */
export default function Dashboard() {
  const { tiles, mapFallback, routeMaxStops } = useMapConfig();
  const { stations, loading: stationsLoading, sel, setSel } = useStations();
  const { data, loading: stationLoading, error: stationErr, reload, retryGeocode } = useStationData(sel.code);
  const { gps, gpsErr, needsConsent, requestGps, declineGps } = useGps();
  const route = useRoute();
  const clearRoute = route.clear;

  const [maxStops, setMaxStops] = useState(DEFAULT_STOPS);
  const [startId, setStartId] = useState(null);
  // Filtros da lista (busca, tipo, situação): valem também para o mapa e para a rota.
  const [filters, setFilters] = useState(NO_FILTERS);

  // Trocar de estação recomeça: sem rota, sem primeira parada, quantidade padrão e sem filtros.
  useEffect(() => {
    clearRoute();
    setStartId(null);
    setMaxStops(DEFAULT_STOPS);
    setFilters(NO_FILTERS);
  }, [sel.code, clearRoute]);

  // Mudar o filtro descarta a rota: ela deixaria de corresponder ao que está no mapa.
  useEffect(() => { clearRoute(); }, [filters, clearRoute]);

  const hydrants = useMemo(() => data?.hydrants || [], [data]);
  const filtering = isFiltering(filters);
  // O que está no filtro da lista é o que aparece no mapa e o que entra na rota.
  const visible = useMemo(() => filterHydrants(hydrants, filters), [hydrants, filters]);
  const located = useMemo(() => visible.filter(hasCoords), [visible]);
  const allLocatedCount = useMemo(() => hydrants.filter(hasCoords).length, [hydrants]);
  const onMap = located.length;

  // A primeira parada precisa estar entre os hidrantes do filtro; se sair dele, volta para automática.
  useEffect(() => {
    if (startId && !located.some((h) => h.id === startId)) {
      setStartId(null);
      toast.info("A primeira parada escolhida não está no filtro atual: voltou para automática.");
    }
  }, [located, startId]);

  // Os hidrantes do filtro entram como candidatos; a rota visita no máximo routeMaxStops deles.
  const stopsLimit = Math.min(onMap, routeMaxStops);
  useEffect(() => {
    if (stopsLimit > 0 && maxStops > stopsLimit) setMaxStops(stopsLimit);
  }, [stopsLimit, maxStops]);

  // Sem hidrantes no mapa não há rota: a quantidade mostra 0 e os controles ficam desabilitados.
  const noStops = onMap === 0;
  const stopsShown = noStops ? 0 : Math.min(maxStops, stopsLimit);
  let noStopsReason = null;
  if (noStops && data) {
    if (hydrants.length === 0) noStopsReason = "Esta estação não tem hidrantes pendentes de vistoria: não há rota a gerar.";
    else if (visible.length === 0) noStopsReason = "Nenhum hidrante corresponde aos filtros da lista: ajuste os filtros para gerar a rota.";
    else noStopsReason = "Nenhum hidrante localizado no mapa ainda: aguarde a localização para gerar a rota.";
  }

  const handleRoute = () => {
    if (noStops) { toast.error("Nenhum hidrante no mapa para gerar a rota"); return; }
    route.generate({ origin: gps || SP_FALLBACK, located, visible, maxStops: stopsShown, startId });
  };

  const geo = data?.geocode;
  const geocodingDone = !!geo && geo.pending === 0;
  // Reenquadra o mapa só quando isto muda (troca de estação, primeiros pontos, fim da localização, filtro).
  const fitKey = `${sel.code}:${onMap > 0}:${geocodingDone}:${filtering ? located.map((h) => h.id).join(",") : "todos"}`;

  let listBody;
  if (!sel.code) {
    listBody = <EmptyState text={stationsLoading ? "Carregando estações do CB SP..." : "Selecione uma estação para ver os hidrantes."} spin={stationsLoading} />;
  } else if (stationLoading && !data) {
    listBody = <EmptyState text="Buscando hidrantes na página do CB SP..." spin />;
  } else if (stationErr && !data) {
    listBody = (
      <div className="py-10 flex flex-col items-center gap-3 text-center" data-testid="station-error">
        <p className="text-sm text-amber-300">{stationErr}</p>
        <Button size="sm" onClick={reload}
          className="bg-elevated hover:bg-line border border-line text-slate-100 font-mono-t text-xs uppercase tracking-widest">
          <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
        </Button>
      </div>
    );
  } else {
    listBody = (
      <HydrantTable
        hydrants={hydrants}
        filtered={visible}
        filters={filters}
        onFiltersChange={setFilters}
        emptyMessage="Esta estação não tem hidrantes pendentes de vistoria neste ciclo."
      />
    );
  }

  return (
    <div className="min-h-screen bg-page text-slate-100 relative">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="grain-overlay" />

      <AppHeader gps={gps} gpsErr={gpsErr} onRefreshGps={requestGps} />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-6">
        <StatsBar hydrants={hydrants} onMap={onMap} />
      </div>

      <GeocodeStatusBar geo={geo} onRetry={retryGeocode} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
        <aside className="lg:col-span-2 space-y-4">
          <StationCard
            stations={stations}
            value={sel}
            onChange={setSel}
            disabled={stationsLoading}
            station={data?.station}
            cycle={data?.cycle}
          />
          <RoutePanel
            visible={visible}
            startId={startId}
            onStartChange={setStartId}
            onMap={onMap}
            stopsShown={stopsShown}
            stopsLimit={stopsLimit}
            routeMaxStops={routeMaxStops}
            onStopsChange={setMaxStops}
            filtering={filtering}
            noStopsReason={noStopsReason}
            loading={route.loading}
            onGenerate={handleRoute}
          />
        </aside>

        <section className="lg:col-span-3 space-y-5">
          <MapPanel
            tiles={tiles}
            mapFallback={mapFallback}
            hydrants={visible}
            gps={gps}
            route={route.route}
            fitKey={fitKey}
            onMap={onMap}
            allOnMap={allLocatedCount}
            filtering={filtering}
          />

          <div className="tactical-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-4">
              <h2 className="font-display text-lg font-bold uppercase tracking-wider">Hidrantes Pendentes de Vistoria</h2>
              {data?.cycle && (
                <span className="font-mono-t text-label uppercase tracking-widest text-slate-400">Ciclo {data.cycle}</span>
              )}
            </div>
            {listBody}
          </div>
        </section>
      </main>

      <footer className="border-t border-line pt-6 safe-bottom text-center">
        <p className="text-label font-mono-t uppercase tracking-widest text-slate-400">
          HydrantRoute SP · Dados ao vivo do CB SP · OpenStreetMap · OSRM · Google Maps · Desenvolvido por CB MANOSSO
        </p>
      </footer>

      <RouteResult open={route.open} onClose={route.setOpen} result={route.route} />
      <GpsConsent open={needsConsent} onAccept={requestGps} onDecline={declineGps} />
    </div>
  );
}
