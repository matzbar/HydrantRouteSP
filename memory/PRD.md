# HydrantRoute SP — PRD

## Problem Statement
Crie um app onde eu possa enviar uma lista de endereços (nome da rua e número) onde constam localização de hidrantes de rua e retorne uma rota otimizada no Google Maps. A lista enviada terá código (ID), tipo (subterrâneo ou coluna), estado de funcionamento (possível de uso ou não) e o nome da rua e o número.

## User Choices (locked)
- Cidade padrão: São Paulo, SP
- Entrada: formulário manual + upload CSV
- Origem: GPS do navegador do usuário (fallback para centro de SP)
- Filtro: inclui todos os hidrantes (funcionando e não)
- Mapas: OpenStreetMap (Leaflet) + OSRM para rota real + link Google Maps para navegação

## Architecture
- Backend: FastAPI + MongoDB (Motor), httpx para Nominatim e OSRM
- Frontend: React + Leaflet/react-leaflet + Shadcn UI + Tailwind
- Design: tactical dark (slate/obsidian) com acentos fire red + status green/red

## Core Requirements (static)
- CRUD de hidrantes com geocodificação automática (Nominatim)
- Upload CSV em massa com geocodificação paralela
- Otimização por vizinho mais próximo + distâncias reais via OSRM
- Geração de URL direto no Google Maps (origin + waypoints + destination)

## Implemented (2026-02)
- Backend endpoints: GET/POST/PUT/DELETE /api/hydrants, /api/hydrants/bulk, /api/hydrants/seed, /api/route/optimize
- Frontend Dashboard com mapa interativo, stats bar, tabs Manual/CSV, lista com filtros
- Marcadores customizados Leaflet por tipo (azul/roxo) e estado (anel verde/vermelho)
- Dialog de rota com ordem numerada, distância/tempo por trecho e botão Google Maps
- Toasts (sonner), estados de loading, GPS fallback
- Nominatim UA tuning para evitar bloqueio 403

## Iteration 2 (2026-06)
- Schema: código, tipo, endereço, município, última vistoria, situação (possível de uso/inoperante), setor
- Import from CB SP page (table "HIDRANTES PENDENTES DE VISTORIA - CICLO 2026 2º SEM", 50 rows) via POST /api/hydrants/scrape (idempotent)
- Geocoding in background: ArcGIS (supports intersections "X & Y") → Photon → Nominatim; status bar + retry
- Route: user chooses quantity (max_stops); Google Maps links split into chained 10-stop segments
- Unique code index (code_unique), duplicate checks, strict type/status validation

## Backlog / Next
- P1: Reorder manual dos stops (drag & drop) na rota antes de abrir no Google Maps
- P1: Exportar relatório PDF/CSV da rota gerada com assinatura/data
- P2: Multi-equipe (split da lista entre N viaturas) — Clarke-Wright
- P2: Histórico de rotas geradas e estatísticas de cobertura por bairro
- P2: Edição inline na tabela + upload de foto do hidrante

## Credentials
Nenhuma. OSM/OSRM/Google Maps link não requerem chave.
