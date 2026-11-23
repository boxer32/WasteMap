<script lang="ts">
	import { onMount } from 'svelte';
	import * as maplibregl from 'maplibre-gl';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
	import 'maplibre-gl/dist/maplibre-gl.css';

	maplibregl.setWorkerUrl(workerUrl);
	import { PLACE } from '#lib/domain';
	import type { MapFeature } from '#lib/api';

	let {
		reports,
		interactive = true,
		pin = $bindable<[number, number] | null>(null),
		onSelect,
		onPick
	}: {
		reports: MapFeature[];
		interactive?: boolean;
		pin?: [number, number] | null;
		onSelect?: (id: string) => void;
		onPick?: () => void;
	} = $props();

	let host: HTMLDivElement;
	let failed = $state('');
	let map = $state<maplibregl.Map | undefined>();
	let pinMarker: maplibregl.Marker | undefined;

	const LABELS = [
		{ name: 'บ.ปะระ\nหมู่ 1', lng: 99.18772, lat: 10.83487 },
		{ name: 'อบต.สลุย\nหมู่ 6', lng: 99.21369, lat: 10.82775 }
	];

	function geojson() {
		return {
			type: 'FeatureCollection',
			features: reports.map((r) => ({
				type: 'Feature',
				properties: { id: r.id, status: r.status },
				geometry: { type: 'Point', coordinates: [r.lng, r.lat] }
			}))
		};
	}

	function paint() {
		const src = map?.getSource('reports') as maplibregl.GeoJSONSource | undefined;
		src?.setData(geojson());
	}

	$effect(() => {
		reports;
		paint();
	});

	$effect(() => {
		if (!map) return;
		if (!pin) {
			pinMarker?.remove();
			pinMarker = undefined;
			return;
		}
		if (!pinMarker) {
			pinMarker = new maplibregl.Marker({ color: '#e23b2f' }).setLngLat(pin).addTo(map);
		} else {
			pinMarker.setLngLat(pin);
		}
		if (!interactive) map.easeTo({ center: pin, zoom: 14 });
	});

	onMount(() => {
		map = new maplibregl.Map({
			container: host,
			style: 'https://tiles.openfreemap.org/styles/liberty',
			center: [PLACE.center.lng, PLACE.center.lat],
			zoom: interactive ? 11.4 : 13.5,
			attributionControl: false
		});
		map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
		map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

		map.on('error', (event) => {
			const text = event.error?.message ?? '';
			if (text && !failed) failed = 'แผนที่โหลดไม่สำเร็จ รีเฟรชหน้าอีกครั้ง';
			console.error(event.error);
		});
		requestAnimationFrame(() => map?.resize());

		map.on('load', () => {
			map?.addSource('tambon', { type: 'geojson', data: '/salui-boundary.geojson' });
			map?.addLayer({
				id: 'tambon-fill',
				type: 'fill',
				source: 'tambon',
				paint: { 'fill-color': '#1f8a3b', 'fill-opacity': 0.08 }
			});
			map?.addLayer({
				id: 'tambon-line',
				type: 'line',
				source: 'tambon',
				paint: { 'line-color': '#146b2c', 'line-width': 2.5 }
			});
			map?.addSource('place-labels', {
				type: 'geojson',
				data: {
					type: 'FeatureCollection',
					features: LABELS.map((label) => ({
						type: 'Feature',
						properties: { name: label.name },
						geometry: { type: 'Point', coordinates: [label.lng, label.lat] }
					}))
				}
			});
			map?.addLayer({
				id: 'place-labels',
				type: 'symbol',
				source: 'place-labels',
				layout: {
					'text-field': ['get', 'name'],
					'text-font': ['Noto Sans Bold'],
					'text-size': 11,
					'text-anchor': 'center'
				},
				paint: {
					'text-color': '#3d5a45',
					'text-halo-color': '#ffffff',
					'text-halo-width': 1.5
				}
			});
			const boundary = map?.getSource('tambon') as maplibregl.GeoJSONSource | undefined;
			void boundary;
			fetch('/salui-boundary.geojson')
				.then((res) => res.json() as Promise<{ geometry: { coordinates: number[][][] } }>)
				.then((feature) => {
					const ring = feature.geometry.coordinates[0];
					const b = new maplibregl.LngLatBounds(ring[0] as [number, number], ring[0] as [number, number]);
					for (const coord of ring) b.extend(coord as [number, number]);
					if (interactive) map?.fitBounds(b, { padding: 28, duration: 0 });
				});
			map?.addSource('reports', {
				type: 'geojson',
				data: geojson(),
				cluster: true,
				clusterRadius: 50,
				clusterMaxZoom: 14
			});
			map?.addLayer({
				id: 'clusters',
				type: 'circle',
				source: 'reports',
				filter: ['has', 'point_count'],
				paint: {
					'circle-color': '#f08a12',
					'circle-radius': ['step', ['get', 'point_count'], 18, 6, 24, 12, 30],
					'circle-opacity': 0.92,
					'circle-stroke-width': 6,
					'circle-stroke-color': 'rgba(240,138,18,0.25)'
				}
			});
			map?.addLayer({
				id: 'cluster-count',
				type: 'symbol',
				source: 'reports',
				filter: ['has', 'point_count'],
				layout: {
					'text-field': ['get', 'point_count_abbreviated'],
					'text-font': ['Noto Sans Bold'],
					'text-size': 13,
					'text-allow-overlap': true
				},
				paint: { 'text-color': '#ffffff' }
			});

			map?.addLayer({
				id: 'points',
				type: 'circle',
				source: 'reports',
				filter: ['!', ['has', 'point_count']],
				paint: {
					'circle-radius': 8,
					'circle-color': ['match', ['get', 'status'], 'resolved', '#1f8a3b', '#f08a12'],
					'circle-stroke-width': 2,
					'circle-stroke-color': '#ffffff'
				}
			});
			map?.on('click', 'clusters', (event) => {
				const feature = event.features?.[0];
				if (!feature || !map) return;
				const source = map.getSource('reports') as maplibregl.GeoJSONSource;
				source.getClusterExpansionZoom(feature.properties?.cluster_id).then((zoom) => {
					const coords = (feature.geometry as { type: 'Point'; coordinates: [number, number] }).coordinates;
					map?.easeTo({ center: coords, zoom });
				});
			});
			map?.on('click', 'points', (event) => {
				const id = event.features?.[0]?.properties?.id;
				if (id) onSelect?.(String(id));
			});
			map?.on('mouseenter', 'clusters', () => map && (map.getCanvas().style.cursor = 'pointer'));
			map?.on('mouseleave', 'clusters', () => map && (map.getCanvas().style.cursor = ''));
		});

		if (!interactive) {
			map.on('click', (event) => {
				pin = [event.lngLat.lng, event.lngLat.lat];
				onPick?.();
			});
		}

		return () => map?.remove();
	});
</script>

<div class="absolute inset-0">
	<div bind:this={host} class="h-full w-full"></div>
</div>
{#if failed}
	<p class="absolute inset-x-3 bottom-16 z-10 rounded-xl bg-white px-3 py-2 text-[13px] shadow">{failed}</p>
{/if}
