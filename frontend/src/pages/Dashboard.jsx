import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Toaster, toast } from "sonner";
import { Flame, MapPin, Navigation, Database, Trash2, Loader2, Satellite } from "lucide-react";
import HydrantMap from "../components/HydrantMap";
import HydrantForm from "../components/HydrantForm";
import CsvUpload from "../components/CsvUpload";
import HydrantTable from "../components/HydrantTable";
import RouteResult from "../components/RouteResult";
import {
  listHydrants,
  createHydrant,
  deleteHydrant,
  deleteAllHydrants,
  bulkUpload,
  seedHydrants,
  optimizeRoute,
} from "../lib/api";

const SP_FALLBACK = { lat: -23.5612, lon: -46.6558 };

export default function Dashboard() {
  const [hydrants, setHydrants] = useState([]);
  const [loading, setLoading] = useState({ add: false, csv: false, seed: false, route: false });
  const [gps, setGps] = useState(null);
  const [gpsErr, setGpsErr] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeOpen, setRouteOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listHydrants();
      setHydrants(data);
    } catch (e) {
      toast.error("Falha ao carregar hidrantes");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsErr("GPS não suportado");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsErr(null);
        toast.success("Localização obtida");
      },
      (err) => {
        setGpsErr("Permissão negada - usando centro de SP");
        toast.warning("Sem GPS. Usando centro de São Paulo como origem");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    requestGps();
  }, [requestGps]);

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
      toast.success(`${data.length} hidrantes importados`);
      refresh();
    } catch (e) {
      toast.error("Falha ao importar CSV");
    } finally {
      setLoading((l) => ({ ...l, csv: false }));
    }
  };

  const handleSeed = async () => {
    setLoading((l) => ({ ...l, seed: true }));
    try {
      const data = await seedHydrants();
      toast.success(`${data.length} hidrantes de exemplo adicionados`);
      refresh();
    } catch {
      toast.error("Erro ao carregar amostras");
    } finally {
      setLoading((l) => ({ ...l, seed: false }));
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteHydrant(id);
      toast.success("Hidrante removido");
      refresh();
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Remover TODOS os hidrantes?")) return;
    await deleteAllHydrants();
    setRoute(null);
    toast.success("Lista limpa");
    refresh();
  };

  const handleRoute = async () => {
    const geocoded = hydrants.filter((h) => h.geocoded);
    if (geocoded.length === 0) {
      toast.error("Nenhum hidrante geocodificado disponível");
      return;
    }
    const origin = gps || SP_FALLBACK;
    setLoading((l) => ({ ...l, route: true }));
    try {
      const result = await optimizeRoute({
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        hydrant_ids: geocoded.map((h) => h.id),
      });
      setRoute(result);
      setRouteOpen(true);
      toast.success(`Rota com ${result.stops.length} paradas gerada`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar rota");
    } finally {
      setLoading((l) => ({ ...l, route: false }));
    }
  };

  const stats = useMemo(() => {
    const op = hydrants.filter((h) => h.status === "operacional").length;
    const inop = hydrants.length - op;
    const geo = hydrants.filter((h) => h.geocoded).length;
    return { total: hydrants.length, op, inop, geo };
  }, [hydrants]);

  const routeOrderIds = route?.stops.map((s) => s.hydrant.id);
  const routePolyline = route
    ? [
        [(gps || SP_FALLBACK).lat, (gps || SP_FALLBACK).lon],
        ...route.stops.map((s) => [s.hydrant.lat, s.hydrant.lon]),
      ]
    : null;

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 relative">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="grain-overlay" />

      {/* Header */}
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
                Tactical · São Paulo, SP · OSM/OSRM
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono-t uppercase tracking-widest" data-testid="gps-status">
              <Satellite className={`w-4 h-4 ${gps ? "text-[#10B981]" : "text-amber-400"}`} />
              {gps ? (
                <span className="text-slate-300">
                  GPS · {gps.lat.toFixed(4)}, {gps.lon.toFixed(4)}
                </span>
              ) : (
                <span className="text-amber-400">{gpsErr || "Obtendo GPS..."}</span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={requestGps}
              data-testid="refresh-gps-btn"
              className="text-slate-300 hover:text-white hover:bg-[#1A2234] font-mono-t text-xs uppercase tracking-widest"
            >
              Atualizar GPS
            </Button>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "#F8FAFC" },
            { label: "Operacional", value: stats.op, color: "#10B981" },
            { label: "Inoperante", value: stats.inop, color: "#EF4444" },
            { label: "Geocodificados", value: stats.geo, color: "#38BDF8" },
          ].map((s, i) => (
            <div key={i} className="tactical-card p-4" data-testid={`stat-${s.label.toLowerCase()}`}>
              <div className="font-mono-t text-[10px] uppercase tracking-widest text-slate-500">{s.label}</div>
              <div className="font-display font-black text-3xl mt-1" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: input panel */}
        <aside className="lg:col-span-2 space-y-4">
          <div className="tactical-card p-5">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider mb-4">Cadastro</h2>
            <Tabs defaultValue="form" className="w-full">
              <TabsList className="grid grid-cols-2 bg-[#0B0F17] border border-[#26334D]">
                <TabsTrigger value="form" data-testid="tab-form" className="font-mono-t text-xs uppercase tracking-widest">
                  Manual
                </TabsTrigger>
                <TabsTrigger value="csv" data-testid="tab-csv" className="font-mono-t text-xs uppercase tracking-widest">
                  CSV
                </TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-4">
                <HydrantForm onSubmit={handleAdd} loading={loading.add} />
              </TabsContent>
              <TabsContent value="csv" className="mt-4">
                <CsvUpload onUpload={handleCsv} loading={loading.csv} />
              </TabsContent>
            </Tabs>
          </div>

          <div className="tactical-card p-5 space-y-3">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider">Ações</h2>
            <Button
              onClick={handleRoute}
              disabled={loading.route || hydrants.filter((h) => h.geocoded).length === 0}
              data-testid="generate-route-btn"
              className="w-full btn-tactical-red font-display uppercase tracking-wider text-base font-bold py-6"
            >
              {loading.route ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Navigation className="w-5 h-5 mr-2" />
              )}
              Gerar Rota Otimizada
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                onClick={handleSeed}
                disabled={loading.seed}
                data-testid="seed-btn"
                className="bg-[#1A2234] hover:bg-[#26334D] border border-[#26334D] text-slate-200 font-mono-t text-xs uppercase tracking-widest"
              >
                <Database className="w-4 h-4 mr-2" />
                Amostras
              </Button>
              <Button
                variant="ghost"
                onClick={handleClearAll}
                disabled={hydrants.length === 0}
                data-testid="clear-all-btn"
                className="bg-[#1A2234] hover:bg-[#2A1A24] border border-[#26334D] text-slate-200 font-mono-t text-xs uppercase tracking-widest"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar
              </Button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              A rota parte da sua localização atual e visita todos os hidrantes geocodificados usando algoritmo de
              vizinho mais próximo + roteamento OSRM.
            </p>
          </div>
        </aside>

        {/* Right: map and table */}
        <section className="lg:col-span-3 space-y-5">
          <div className="tactical-card p-3 h-[460px] relative">
            <div className="absolute top-5 left-5 z-[500] flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B0F17]/85 border border-[#26334D] backdrop-blur-md">
              <MapPin className="w-3.5 h-3.5 text-[#EF4444]" />
              <span className="font-mono-t text-[10px] uppercase tracking-widest text-slate-300">
                {stats.geo} hidrantes no mapa
              </span>
            </div>
            <HydrantMap
              hydrants={hydrants}
              gps={gps}
              routeOrder={routeOrderIds}
              routePolyline={routePolyline}
            />
          </div>

          <div className="tactical-card p-5">
            <h2 className="font-display text-lg font-bold uppercase tracking-wider mb-4">Lista de Hidrantes</h2>
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
