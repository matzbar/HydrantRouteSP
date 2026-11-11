import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Input } from "../components/ui/input";
import { Toaster, toast } from "sonner";
import { Flame, MapPin, Navigation, DownloadCloud, Trash2, Loader2, Satellite } from "lucide-react";
import HydrantMap from "../components/HydrantMap";
import HydrantForm from "../components/HydrantForm";
import CsvUpload from "../components/CsvUpload";
import HydrantTable from "../components/HydrantTable";
import RouteResult from "../components/RouteResult";
import StartPointPicker from "../components/StartPointPicker";
import { RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import {
  listHydrants,
  createHydrant,
  deleteHydrant,
  deleteAllHydrants,
  bulkUpload,
  scrapeHydrants,
  reimportHydrants,
  optimizeRoute,
  geocodeStatus,
  geocodeRetry,
} from "../lib/api";

const SP_FALLBACK = { lat: -23.5612, lon: -46.6558 };

export default function Dashboard() {
  const [hydrants, setHydrants] = useState([]);
  const [loading, setLoading] = useState({ add: false, csv: false, scrape: false, route: false });
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [maxStops, setMaxStops] = useState(5);
  const [startId, setStartId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listHydrants();
      setHydrants(data);
    } catch (e) {
      toast.error("Falha ao carregar hidrantes");
    }
  }, []);

  const [geo, setGeo] = useState(null);

  const pollGeocode = useCallback(async () => {
    try {
      const s = await geocodeStatus();
      setGeo(s);
      refresh();
      if (s.running || s.pending > 0) setTimeout(pollGeocode, 3000);
    } catch {
      setTimeout(pollGeocode, 6000);
    }
  }, [refresh]);

  useEffect(() => { refresh(); pollGeocode(); }, [refresh, pollGeocode]);

  const handleRetryGeocode = async () => {
    await geocodeRetry();
    toast.info("Geocodificação reiniciada");
    setTimeout(pollGeocode, 1000);
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

  const geocodedCount = useMemo(() => hydrants.filter((h) => h.geocoded).length, [hydrants]);

  useEffect(() => {
    if (geocodedCount > 0 && maxStops > geocodedCount) setMaxStops(geocodedCount);
    if (geocodedCount > 0 && maxStops === 0) setMaxStops(Math.min(5, geocodedCount));
  }, [geocodedCount, maxStops]);

  const handleAdd = async (payload) => {
    setLoading((l) => ({ ...l, add: true }));
    try {
      const h = await createHydrant(payload);
      toast.success(`Hidrante ${h.code} cadastrado${h.geocoded ? "" : " (sem geocodificação)"}`);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao cadastrar");
    } finally {
      setLoading((l) => ({ ...l, add: false }));
    }
  };

  const handleCsv = async (file) => {
    setLoading((l) => ({ ...l, csv: true }));
    try {
      const data = await bulkUpload(file);
      toast.success(`${data.length} hidrantes importados. Geocodificando...`);
      pollGeocode();
    } catch { toast.error("Falha ao importar CSV"); }
    finally { setLoading((l) => ({ ...l, csv: false })); }
  };

  const handleScrape = async () => {
    setLoading((l) => ({ ...l, scrape: true }));
    try {
      const data = await scrapeHydrants();
      toast.success(
        `${data.fetched} encontrados · ${data.inserted} importados · ${data.skipped} já existentes. Geocodificando...`
      );
      pollGeocode();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao importar do CB SP");
    } finally {
      setLoading((l) => ({ ...l, scrape: false }));
    }
  };

  const handleReimport = async () => {
    setLoading((l) => ({ ...l, scrape: true }));
    try {
      const data = await reimportHydrants();
      setRoute(null);
      setStartId(null);
      toast.success(`Lista atualizada: ${data.inserted} hidrantes importados do CB SP`);
      pollGeocode();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao reimportar do CB SP");
      refresh();
    } finally {
      setLoading((l) => ({ ...l, scrape: false }));
    }
  };

  const handleDelete = async (id) => {
    try { await deleteHydrant(id); toast.success("Hidrante removido"); refresh(); }
    catch { toast.error("Erro ao remover"); }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Remover TODOS os hidrantes?")) return;
    try {
      await deleteAllHydrants();
      setRoute(null);
      toast.success("Lista limpa");
      refresh();
    } catch {
      toast.error("Erro ao limpar a base");
    }
  };

  const handleRoute = async () => {
    const geocoded = hydrants.filter((h) => h.geocoded);
    if (geocoded.length === 0) { toast.error("Nenhum hidrante geocodificado disponível"); return; }
    const origin = gps || SP_FALLBACK;
    setLoading((l) => ({ ...l, route: true }));
    try {
      const result = await optimizeRoute({
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        hydrant_ids: geocoded.map((h) => h.id),
        max_stops: maxStops,
        start_hydrant_id: startId,
      });
      setRoute({ ...result, start_id: startId });
      setRouteOpen(true);
      toast.success(`Rota com ${result.stops.length} paradas gerada`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar rota");
    } finally {
      setLoading((l) => ({ ...l, route: false }));
    }
  };

  const stats = useMemo(() => {
    const ok = hydrants.filter((h) => h.status === "possivel_de_uso").length;
    const inop = hydrants.filter((h) => h.status !== "possivel_de_uso").length;
    const geo = hydrants.filter((h) => h.geocoded).length;
    return { total: hydrants.length, ok, inop, geo };
  }, [hydrants]);

  const routeOrderIds = route?.stops.map((s) => s.hydrant.id);
  const routePolyline = route
    ? [
        ...(route.start_id ? [] : [[(gps || SP_FALLBACK).lat, (gps || SP_FALLBACK).lon]]),
        ...route.stops.map((s) => [s.hydrant.lat, s.hydrant.lon]),
      ]
    : null;

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
            { label: "Total", value: stats.total, color: "#F8FAFC", id: "total" },
            { label: "Possível de uso", value: stats.ok, color: "#10B981", id: "ok" },
            { label: "Inoperante / Não localizado", value: stats.inop, color: "#EF4444", id: "inop" },
            { label: "Geocodificados", value: stats.geo, color: "#38BDF8", id: "geo" },
          ].map((s) => (
            <div key={s.id} className="tactical-card p-4" data-testid={`stat-${s.id}`}>
              <div className="font-mono-t text-[10px] uppercase tracking-widest text-slate-500">{s.label}</div>
              <div className="font-display font-black text-3xl mt-1" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {geo && (geo.running || geo.pending > 0 || geo.failed > 0) && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-4">
          <div className="tactical-card p-3 flex items-center justify-between gap-3" data-testid="geocode-status-bar">
            <div className="flex items-center gap-2 text-xs font-mono-t uppercase tracking-widest text-slate-300">
              {geo.running && <Loader2 className="w-4 h-4 animate-spin text-[#38BDF8]" />}
              {geo.running || geo.pending > 0
                ? `Geocodificando endereços · ${geo.geocoded}/${geo.total}`
                : `${geo.failed} endereço(s) não localizado(s)`}
            </div>
            {!geo.running && geo.failed > 0 && (
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
          <div className="tactical-card p-5">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider mb-4">Cadastro</h2>
            <Tabs defaultValue="form" className="w-full">
              <TabsList className="grid grid-cols-3 bg-[#0B0F17] border border-[#26334D]">
                <TabsTrigger value="form" data-testid="tab-form" className="font-mono-t text-[10px] uppercase tracking-widest">Manual</TabsTrigger>
                <TabsTrigger value="csv" data-testid="tab-csv" className="font-mono-t text-[10px] uppercase tracking-widest">CSV</TabsTrigger>
                <TabsTrigger value="cbsp" data-testid="tab-cbsp" className="font-mono-t text-[10px] uppercase tracking-widest">CB SP</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-4">
                <HydrantForm onSubmit={handleAdd} loading={loading.add} />
              </TabsContent>
              <TabsContent value="csv" className="mt-4">
                <CsvUpload onUpload={handleCsv} loading={loading.csv} />
              </TabsContent>
              <TabsContent value="cbsp" className="mt-4 space-y-3">
                <div className="rounded-lg bg-[#0B0F17] border border-[#26334D] p-3 space-y-2">
                  <div className="font-display text-sm font-bold uppercase tracking-wider text-slate-200">
                    Hidrantes Pendentes de Vistoria
                  </div>
                  <div className="text-[10px] font-mono-t uppercase tracking-widest text-slate-500">
                    Ciclo 2026 · 2º Semestre · Corpo de Bombeiros SP
                  </div>
                  <div className="text-xs text-slate-400 leading-relaxed">
                    Importa automaticamente a tabela oficial do CB/SP (estação 701031102) e geocodifica cada endereço.
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleScrape}
                  disabled={loading.scrape}
                  data-testid="scrape-btn"
                  className="w-full btn-tactical-red font-display uppercase tracking-wider text-sm font-bold"
                >
                  {loading.scrape ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DownloadCloud className="w-4 h-4 mr-2" />}
                  Importar da Página CB SP
                </Button>
                <p className="text-[10px] text-slate-500 font-mono-t">
                  A geocodificação dos endereços roda em segundo plano.
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <div className="tactical-card p-5 space-y-4">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider">Ações</h2>

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
                    {maxStops} <span className="text-sm text-slate-500">/ {geocodedCount}</span>
                  </div>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={geocodedCount || 1}
                  value={maxStops}
                  onChange={(e) => {
                    const n = parseInt(e.target.value || "0", 10);
                    if (!isNaN(n)) setMaxStops(Math.min(Math.max(1, n), Math.max(1, geocodedCount)));
                  }}
                  data-testid="max-stops-input"
                  className="w-20 bg-[#121824] border-[#26334D] text-slate-100 text-center font-mono-t"
                  disabled={geocodedCount === 0}
                />
              </div>
              <Slider
                data-testid="max-stops-slider"
                min={1}
                max={Math.max(1, geocodedCount)}
                step={1}
                value={[maxStops]}
                onValueChange={(v) => setMaxStops(v[0])}
                disabled={geocodedCount === 0}
                className="w-full"
              />
            </div>

            <Button
              onClick={handleRoute}
              disabled={loading.route || geocodedCount === 0}
              data-testid="generate-route-btn"
              className="w-full btn-tactical-red font-display uppercase tracking-wider text-base font-bold py-6"
            >
              {loading.route ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Navigation className="w-5 h-5 mr-2" />}
              Gerar Rota Otimizada
            </Button>

            <Button
              variant="ghost"
              onClick={handleClearAll}
              disabled={hydrants.length === 0}
              data-testid="clear-all-btn"
              className="w-full bg-[#1A2234] hover:bg-[#2A1A24] border border-[#26334D] text-slate-200 font-mono-t text-xs uppercase tracking-widest"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar Base
            </Button>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              A rota parte do hidrante escolhido (ou do seu GPS) e visita os N hidrantes mais próximos em sequência (vizinho mais próximo + roteamento OSRM).
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
            <HydrantMap hydrants={hydrants} gps={gps} routeOrder={routeOrderIds} routePolyline={routePolyline} />
          </div>

          <div className="tactical-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="font-display text-lg font-bold uppercase tracking-wider">Lista de Hidrantes</h2>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    disabled={loading.scrape}
                    data-testid="reimport-btn"
                    className="bg-[#1A2234] hover:bg-[#26334D] border border-[#26334D] text-slate-100 font-mono-t text-xs uppercase tracking-widest"
                  >
                    {loading.scrape ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Excluir tudo e reimportar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#121824] border-[#26334D] text-slate-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-display uppercase tracking-wider">Atualizar lista de hidrantes?</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                      Todos os {hydrants.length} hidrantes cadastrados serão excluídos (inclusive os manuais e de CSV) e a tabela atual do CB SP será importada novamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="reimport-cancel" className="bg-transparent border-[#26334D] text-slate-300 hover:bg-[#1A2234] hover:text-white">Cancelar</AlertDialogCancel>
                    <AlertDialogAction data-testid="reimport-confirm" onClick={handleReimport} className="btn-tactical-red">Excluir e reimportar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <HydrantTable hydrants={hydrants} onDelete={handleDelete} />
          </div>
        </section>
      </main>

      <footer className="border-t border-[#26334D] py-6 text-center">
        <p className="text-[10px] font-mono-t uppercase tracking-widest text-slate-600">
          HydrantRoute SP · OpenStreetMap · OSRM · Google Maps Direct Link
        </p>
      </footer>

      <RouteResult open={routeOpen} onClose={setRouteOpen} result={route} />
    </div>
  );
}
