import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Input } from "../components/ui/input";
import { Toaster, toast } from "sonner";
import { Flame, MapPin, Navigation, Loader2, Satellite, ExternalLink, RefreshCw } from "lucide-react";
import HydrantMap from "../components/HydrantMap";
import HydrantTable from "../components/HydrantTable";
import RouteResult from "../components/RouteResult";
import StartPointPicker from "../components/StartPointPicker";
import StationPicker, { DEFAULT_STATION_CODE, selectionFromStation } from "../components/StationPicker";
import { errorMessage, getConfig, listStations, getStationHydrants, retryStationGeocode, optimizeRoute } from "../lib/api";
import { OSM_TILES, tilesFromConfig } from "../lib/mapTiles";

const SP_FALLBACK = { lat: -23.5612, lon: -46.6558 };
// Usada se o índice de estações do CB SP não carregar: a estação padrão ainda pode ser consultada.
const DEFAULT_SELECTION = { cmd: "CBM", gb: "03", sgb: "1", code: DEFAULT_STATION_CODE };
const POLL_MS = 3000;
const DEFAULT_STOPS = 5;
const DEFAULT_ROUTE_MAX_STOPS = 25; // o backend informa o valor em uso (/api/config)

export default function Dashboard() {
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [sel, setSel] = useState({ cmd: "", gb: "", sgb: "", code: "" });

  const [data, setData] = useState(null); // { station, cycle, hydrants, geocode }
  const [stationLoading, setStationLoading] = useState(false);
  const [stationErr, setStationErr] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [maxStops, setMaxStops] = useState(DEFAULT_STOPS);
  const [startId, setStartId] = useState(null);

  // Mapa de fundo (MapTiler ou OpenStreetMap), definido pelo backend. Sem resposta, OpenStreetMap.
  const [tiles, setTiles] = useState(null);
  const [routeMaxStops, setRouteMaxStops] = useState(DEFAULT_ROUTE_MAX_STOPS);
  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((cfg) => {
        if (cancelled) return;
        setTiles(tilesFromConfig(cfg));
        if (cfg?.route?.max_stops > 0) setRouteMaxStops(cfg.route.max_stops);
      })
      .catch(() => !cancelled && setTiles(OSM_TILES));
    return () => { cancelled = true; };
  }, []);

  // Índice de estações (uma vez) + estação padrão.
  useEffect(() => {
    let cancelled = false;
    listStations()
      .then((list) => {
        if (cancelled) return;
        setStations(list);
        const def = list.find((s) => s.code === DEFAULT_STATION_CODE);
        setSel(def ? selectionFromStation(def) : DEFAULT_SELECTION);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Não foi possível carregar a lista de estações do CB SP. Mostrando a estação padrão.");
        setSel(DEFAULT_SELECTION);
      })
      .finally(() => !cancelled && setStationsLoading(false));
    return () => { cancelled = true; };
  }, []);

  // Trocar de estação limpa a tela.
  useEffect(() => {
    setData(null);
    setStationErr(null);
    setRoute(null);
    setRouteOpen(false);
    setStartId(null);
    setMaxStops(DEFAULT_STOPS); // cada estação começa com a quantidade padrão (limitada aos hidrantes dela)
  }, [sel.code]);

  // Carrega os hidrantes da estação e acompanha a geocodificação até terminar.
  useEffect(() => {
    if (!sel.code) return undefined;
    let cancelled = false;
    let timer;
    const load = async (first) => {
      if (first) setStationLoading(true);
      try {
        const d = await getStationHydrants(sel.code);
        if (cancelled) return;
        setData(d);
        setStationErr(null);
        if (d.geocode.pending > 0) timer = setTimeout(() => load(false), POLL_MS);
      } catch (e) {
        if (cancelled) return;
        if (first) setStationErr(errorMessage(e, "Falha ao carregar os hidrantes da estação."));
        else timer = setTimeout(() => load(false), POLL_MS * 2);
      } finally {
        if (first && !cancelled) setStationLoading(false);
      }
    };
    load(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sel.code, reloadKey]);

  const handleRetryGeocode = async () => {
    try {
      await retryStationGeocode(sel.code);
      toast.info("Localizando os endereços novamente");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(errorMessage(e, "Não foi possível tentar novamente"));
    }
  };

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) { setGpsErr("GPS não suportado"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsErr(null);
        toast.success("Localização obtida");
      },
      () => {
        setGpsErr("Permissão negada - usando centro de SP");
        toast.warning("Sem GPS. Usando centro de São Paulo como origem");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => { requestGps(); }, [requestGps]);

  const hydrants = useMemo(() => data?.hydrants || [], [data]);
  const geo = data?.geocode;
  const located = useMemo(() => hydrants.filter((h) => h.lat != null && h.lon != null), [hydrants]);
  const geocodedCount = located.length;

  // Todos os hidrantes aparecem no mapa e entram como candidatos; a rota visita no máximo routeMaxStops deles.
  const stopsLimit = Math.min(geocodedCount, routeMaxStops);
  useEffect(() => {
    if (stopsLimit > 0 && maxStops > stopsLimit) setMaxStops(stopsLimit);
  }, [stopsLimit, maxStops]);

  // Sem hidrantes no mapa não há rota: a quantidade mostra 0 e os controles ficam desabilitados.
  const noStops = geocodedCount === 0;
  const stopsShown = noStops ? 0 : Math.min(maxStops, stopsLimit);

  const handleRoute = async () => {
    if (located.length === 0) { toast.error("Nenhum hidrante localizado no mapa"); return; }
    const origin = gps || SP_FALLBACK;
    setRouteLoading(true);
    try {
      const result = await optimizeRoute({
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        points: located.map((h) => ({ id: h.id, lat: h.lat, lon: h.lon })),
        max_stops: stopsShown,
        start_id: startId,
      });
      const byId = new Map(hydrants.map((h) => [h.id, h]));
      setRoute({
        ...result,
        stops: result.stops.map((s) => ({ ...s, hydrant: byId.get(s.id) })).filter((s) => s.hydrant),
        unreachable: hydrants.filter((h) => !h.geocoded).map((h) => h.code),
        origin,
      });
      setRouteOpen(true);
      toast.success(`Rota com ${result.stops.length} paradas gerada`);
    } catch (e) {
      toast.error(errorMessage(e, "Erro ao gerar rota"));
    } finally {
      setRouteLoading(false);
    }
  };

  const stats = useMemo(() => {
    const count = (st) => hydrants.filter((h) => h.status === st).length;
    return {
      total: hydrants.length,
      ok: count("possivel_de_uso"),
      inop: count("inoperante") + count("nao_localizado"),
      geo: geocodedCount,
    };
  }, [hydrants, geocodedCount]);

  const routeOrderIds = route?.stops.map((s) => s.hydrant.id);
  // A rota sempre parte da localização usada no cálculo (GPS ou centro de SP).
  const routePolyline = route
    ? [[route.origin.lat, route.origin.lon], ...route.stops.map((s) => [s.hydrant.lat, s.hydrant.lon])]
    : null;

  const station = data?.station;
  const geocodingDone = !!geo && geo.pending === 0;

  let listBody;
  if (!sel.code) {
    listBody = <EmptyState text={stationsLoading ? "Carregando estações do CB SP..." : "Selecione uma estação para ver os hidrantes."} spin={stationsLoading} />;
  } else if (stationLoading && !data) {
    listBody = <EmptyState text="Buscando hidrantes na página do CB SP..." spin />;
  } else if (stationErr && !data) {
    listBody = (
      <div className="py-10 flex flex-col items-center gap-3 text-center" data-testid="station-error">
        <p className="text-sm text-amber-300">{stationErr}</p>
        <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}
          className="bg-[#1A2234] hover:bg-[#26334D] border border-[#26334D] text-slate-100 font-mono-t text-xs uppercase tracking-widest">
          <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
        </Button>
      </div>
    );
  } else {
    listBody = (
      <HydrantTable
        hydrants={hydrants}
        emptyMessage="Esta estação não tem hidrantes pendentes de vistoria neste ciclo."
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 relative">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="grain-overlay" />

      <header className="sticky top-0 z-40 border-b border-[#26334D] bg-[#0B0F17]/90 backdrop-blur-md">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EF4444] flex items-center justify-center" data-testid="logo">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-black uppercase tracking-wider leading-none">
                HydrantRoute <span className="text-[#EF4444]">SP</span>
              </h1>
              <p className="text-[10px] font-mono-t uppercase tracking-widest text-slate-500">
                Tactical · CB SP · OSM/OSRM
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono-t uppercase tracking-widest" data-testid="gps-status">
              <Satellite className={`w-4 h-4 ${gps ? "text-[#10B981]" : "text-amber-400"}`} />
              {gps ? (
                <span className="text-slate-300">GPS · {gps.lat.toFixed(4)}, {gps.lon.toFixed(4)}</span>
              ) : (
                <span className="text-amber-400">{gpsErr || "Obtendo GPS..."}</span>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={requestGps} data-testid="refresh-gps-btn"
              className="text-slate-300 hover:text-white hover:bg-[#1A2234] font-mono-t text-xs uppercase tracking-widest">
              Atualizar GPS
            </Button>
          </div>

          <Button size="icon" variant="ghost" onClick={requestGps} data-testid="refresh-gps-btn-mobile"
            aria-label="Atualizar GPS" title={gps ? "GPS ativo · atualizar" : gpsErr || "Obtendo GPS..."}
            className="md:hidden flex-shrink-0 hover:bg-[#1A2234]">
            <Satellite className={`w-5 h-5 ${gps ? "text-[#10B981]" : "text-amber-400"}`} />
          </Button>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Pendentes", value: stats.total, color: "#F8FAFC", id: "total" },
            { label: "Possível de uso", value: stats.ok, color: "#10B981", id: "ok" },
            { label: "Inoperante / Não localizado", value: stats.inop, color: "#EF4444", id: "inop" },
            { label: "No mapa", value: stats.geo, color: "#38BDF8", id: "geo" },
          ].map((s) => (
            <div key={s.id} className="tactical-card p-4" data-testid={`stat-${s.id}`}>
              <div className="font-mono-t text-[10px] uppercase tracking-widest text-slate-500">{s.label}</div>
              <div className="font-display font-black text-3xl mt-1" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {geo && (geo.pending > 0 || geo.failed > 0) && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-4">
          <div className="tactical-card p-3 flex items-center justify-between gap-3" data-testid="geocode-status-bar">
            <div className="flex items-center gap-2 text-xs font-mono-t uppercase tracking-widest text-slate-300">
              {geo.pending > 0 && <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />}
              {geo.pending > 0
                ? `Localizando endereços · ${geo.geocoded}/${geo.total}`
                : `${geo.failed} endereço(s) não localizado(s) no mapa`}
            </div>
            {geo.pending === 0 && geo.failed > 0 && (
              <Button size="sm" variant="ghost" onClick={handleRetryGeocode} data-testid="retry-geocode-btn"
                className="text-amber-300 hover:bg-[#1A2234] font-mono-t text-xs uppercase tracking-widest">
                Tentar novamente
              </Button>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
        <aside className="lg:col-span-2 space-y-4">
          <div className="tactical-card p-5 space-y-4">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider">Estação de Bombeiros</h2>
            <StationPicker stations={stations} value={sel} onChange={setSel} disabled={stationsLoading} />
            {station && (
              <div className="rounded-lg bg-[#0B0F17] border border-[#26334D] p-3 space-y-1.5" data-testid="station-info">
                <div className="font-display text-sm font-bold uppercase tracking-wider text-slate-200">
                  {station.name || `Estação ${station.code}`}
                </div>
                <div className="text-[10px] font-mono-t uppercase tracking-widest text-slate-500">
                  {[station.cmd, station.gb_sgb && `GB.SGB ${station.gb_sgb}`, `Cód. ${station.code}`].filter(Boolean).join(" · ")}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>Pendentes de vistoria{data?.cycle ? ` · Ciclo ${data.cycle}` : ""}</span>
                  {station.percent_done != null && <PercentBadge value={station.percent_done} />}
                </div>
                <a href={station.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#38BDF8] hover:underline">
                  Ver página no site do CB SP <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          <div className="tactical-card p-5 space-y-4">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider">Rota</h2>

            <div className="rounded-lg bg-[#0B0F17] border border-[#26334D] p-4">
              <StartPointPicker hydrants={hydrants} value={startId} onChange={setStartId} />
            </div>

            <div className="space-y-3 rounded-lg bg-[#0B0F17] border border-[#26334D] p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="font-mono-t text-[10px] uppercase tracking-widest text-slate-400">
                    Quantidade de hidrantes
                  </div>
                  <div className="font-display text-3xl font-black text-[#38BDF8] leading-none mt-1">
                    {stopsShown} <span className="text-sm text-slate-500">/ {stopsLimit}</span>
                  </div>
                </div>
                <Input
                  id="max-stops"
                  type="number"
                  min={noStops ? 0 : 1}
                  max={stopsLimit}
                  value={stopsShown}
                  onChange={(e) => {
                    const n = parseInt(e.target.value || "0", 10);
                    if (!isNaN(n)) setMaxStops(Math.min(Math.max(1, n), Math.max(1, stopsLimit)));
                  }}
                  data-testid="max-stops-input"
                  className="w-20 bg-[#121824] border-[#26334D] text-slate-100 text-center font-mono-t"
                  disabled={noStops}
                />
              </div>
              <Slider
                data-testid="max-stops-slider"
                min={noStops ? 0 : 1}
                max={Math.max(1, stopsLimit)}
                step={1}
                value={[stopsShown]}
                onValueChange={(v) => setMaxStops(v[0])}
                disabled={noStops}
                className="w-full"
              />
              {geocodedCount > routeMaxStops && (
                <p className="text-[11px] text-slate-500" data-testid="max-stops-note">
                  {geocodedCount} hidrantes no mapa · máximo de {routeMaxStops} paradas por rota. A rota escolhe os
                  melhores entre todos eles.
                </p>
              )}
              {noStops && data && (
                <p className="text-[11px] text-slate-500" data-testid="no-stops-note">
                  {hydrants.length === 0
                    ? "Esta estação não tem hidrantes pendentes de vistoria: não há rota a gerar."
                    : "Nenhum hidrante localizado no mapa ainda: aguarde a localização para gerar a rota."}
                </p>
              )}
            </div>

            <Button
              onClick={handleRoute}
              disabled={routeLoading || noStops}
              data-testid="generate-route-btn"
              className="w-full btn-tactical-red font-display uppercase tracking-wider text-base font-bold py-6"
            >
              {routeLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Navigation className="w-5 h-5 mr-2" />}
              Gerar Rota Otimizada
            </Button>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              A rota sempre parte da sua localização (GPS) e a ordem das paradas é otimizada pelo tempo real de carro entre os hidrantes (OSRM). Se você escolher uma primeira parada, ela fica fixa como parada 1.
            </p>
            <p className="text-[11px] text-slate-600 leading-relaxed" data-testid="privacy-note">
              Privacidade: sua localização fica só no navegador até você gerar a rota. Aí ela é enviada ao serviço de rotas (OSRM) e ao link do Google Maps, apenas para o cálculo, e não é armazenada pelo app.
            </p>
          </div>
        </aside>

        <section className="lg:col-span-3 space-y-5">
          <div className="tactical-card p-3 h-[400px] sm:h-[500px] relative">
            <div className="absolute top-5 right-5 z-[500] flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B0F17]/85 border border-[#26334D] backdrop-blur-md">
              <MapPin className="w-3.5 h-3.5 text-[#EF4444]" />
              <span className="font-mono-t text-[10px] uppercase tracking-widest text-slate-300">
                {stats.geo} hidrantes no mapa
              </span>
            </div>
            <HydrantMap
              tiles={tiles}
              hydrants={hydrants}
              gps={gps}
              routeOrder={routeOrderIds}
              routePolyline={routePolyline}
              fitKey={`${sel.code}:${geocodedCount > 0}:${geocodingDone}`}
            />
          </div>

          <div className="tactical-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-4">
              <h2 className="font-display text-lg font-bold uppercase tracking-wider">Hidrantes Pendentes de Vistoria</h2>
              {data?.cycle && (
                <span className="font-mono-t text-[10px] uppercase tracking-widest text-slate-500">Ciclo {data.cycle}</span>
              )}
            </div>
            {listBody}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#26334D] py-6 text-center">
        <p className="text-[10px] font-mono-t uppercase tracking-widest text-slate-600">
          HydrantRoute SP · Dados ao vivo do CB SP · OpenStreetMap · OSRM · Google Maps · Desenvolvido por CB MANOSSO
        </p>
      </footer>

      <RouteResult open={routeOpen} onClose={setRouteOpen} result={route} />
    </div>
  );
}

// Verde quando a estação completou 100% das vistorias do ciclo; vermelho enquanto não completou.
function PercentBadge({ value }) {
  const done = value >= 100;
  return (
    <span
      data-testid="station-percent"
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono-t text-[11px] font-semibold uppercase tracking-wider ${
        done
          ? "bg-[#10B981]/15 border-[#10B981]/40 text-[#6EE7B7]"
          : "bg-[#EF4444]/15 border-[#EF4444]/40 text-[#FCA5A5]"
      }`}
    >
      {value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% realizado
    </span>
  );
}

function EmptyState({ text, spin }) {
  return (
    <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
      {spin && <Loader2 className="w-4 h-4 animate-spin" />}
      {text}
    </div>
  );
}
