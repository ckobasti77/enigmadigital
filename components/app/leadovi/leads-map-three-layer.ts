import * as THREE from "three";
import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { pinSirinaM } from "./leads-map-geo";

/**
 * ============================================================================
 * THREE.JS SLOJ NA MAPI (GL4, prilagođen pinu u GL7) — plan §9, §O9
 * ============================================================================
 *
 * `CustomLayerInterface` koji crta u ISTI WebGL kontekst mape, sa kamerom iz
 * MapLibre-ove projekcione matrice. Sloj je DODATAK: ne dira klastere, pinove,
 * hover ni klik. Umeće se ISPOD sloja pina, pa efekti stoje na tlu, ispod pina.
 *
 * GL7: snop svetla za izabranu firmu je UKLONJEN — pin sa senkom i uvećanjem
 * je dovoljan, snop kroz pin je izgledao pogrešno. Ostaju dva efekta na tlu:
 *  - hot firma      → tanak prsten koji pulsira (2,4 s, nasumična faza po
 *                     firmi da ne trepću uglas); poluprečnik ≈ širina pina, da
 *                     ne nadjača sam pin;
 *  - sastanak u narednih 7 dana → spor beacon (sfera koja se diže sa tla i
 *                     bledi svakih 4 s).
 *
 * Pod `prefers-reduced-motion`: bez pulsa i bez beacona. Sloj crta samo tačke
 * koje TRENUTNO nisu u klasteru — isti skup koji MapLibre crta kao pinove
 * (`setVidljive`).
 *
 * PERF: geometrije i materijali se prave jednom; prstenovi i beaconi su
 * `InstancedMesh`; po kadru nema alokacija (`dummy`, `boja`, matrice se
 * ponovo koriste). Repaint mape se traži samo dok nešto stvarno pulsira.
 *
 * KOORDINATE: scena je u metrima oko ishodišta (centroid tačaka), Y nagore.
 * Model-matrica = T(origin) · S(s, −s, s) · Rx(90°), gde je `s` metar u
 * mercator jedinicama na širini ishodišta — obrazac iz MapLibre primera
 * „Add a 3D model using three.js". Položaj svake tačke se računa iz njenih
 * sopstvenih mercator koordinata, pa je tačan i daleko od ishodišta.
 */

export type ThreeTacka = {
  companyId: string;
  lng: number;
  lat: number;
  hot: boolean;
  sastanakUskoro: boolean;
};

export type ThreeTokeni = {
  /** `--temp-hot` — prsten. */
  hot: string;
  /** `--warning` — beacon sastanka (ista boja kao „sastanak uskoro" u tabeli). */
  warning: string;
};

const PULS_S = 2.4;
const BEACON_S = 4;

/** Prsten: poluprečnik oko širine pina (≈ 0,8..1,12 × širine), tanak. */
const PRSTEN_OSNOVA = 0.8;
const PRSTEN_RAST = 0.4;
const PRSTEN_ALFA = 0.55;
/** Prsten stoji malo iznad tla da se ne tuče sa ravnim slojevima mape. */
const PRSTEN_VISINA_M = 0.6;

/** Beacon: mala sfera koja se diže sa tla (ispod pina). */
const BEACON_POLUPRECNIK = 0.28;
const BEACON_USPON = 0.9;

function cssBoja(css: string, rezerva: number): THREE.Color {
  try {
    return new THREE.Color(css);
  } catch {
    return new THREE.Color(rezerva);
  }
}

export class LeadsThreeLayer implements CustomLayerInterface {
  readonly id = "leadovi-three";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();

  private reducedMotion: boolean;
  private readonly bojaHot: THREE.Color;
  private readonly bojaWarning: THREE.Color;

  // ── podaci ──
  private tacke: ThreeTacka[] = [];
  private origin = { x: 0, y: 0, z: 0, s: 1, lat: 44.8125 };
  /** Lokalne koordinate (X, Z) po tački, u metrima od ishodišta. */
  private lokalne = new Float32Array(0);
  private readonly modelMatrix = new THREE.Matrix4();
  private vidljive: Set<string> | null = null;

  // ── geometrije i materijali (jednom) ──
  private readonly geoPrsten: THREE.RingGeometry;
  private readonly geoBeacon: THREE.SphereGeometry;
  private readonly matPrsten: THREE.MeshBasicMaterial;
  private readonly matBeacon: THREE.MeshBasicMaterial;

  // ── instance ──
  private prstenovi: THREE.InstancedMesh | null = null;
  private prstenTacke: number[] = [];
  private prstenFaze = new Float32Array(0);
  private beaconi: THREE.InstancedMesh | null = null;
  private beaconTacke: number[] = [];
  private beaconFaze = new Float32Array(0);

  // ── ponovo korišćeni objekti (bez alokacija po kadru) ──
  private readonly dummy = new THREE.Object3D();
  private readonly boja = new THREE.Color();
  private readonly projekcija = new THREE.Matrix4();
  private readonly pocetak = performance.now();

  constructor(tokeni: ThreeTokeni, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.bojaHot = cssBoja(tokeni.hot, 0xe04a3c);
    this.bojaWarning = cssBoja(tokeni.warning, 0xfbbf24);

    // Tanak prsten u ravni tla (XZ), normala nagore. Skalira se po instanci.
    this.geoPrsten = new THREE.RingGeometry(0.82, 1, 48);
    this.geoPrsten.rotateX(-Math.PI / 2);

    this.geoBeacon = new THREE.SphereGeometry(1, 12, 8);

    const zajednicko = {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    } as const;
    // Boja instance množi belu osnovu → boja instance JE boja; alfa se
    // kodira jačinom boje (aditivno: crno = ništa).
    this.matPrsten = new THREE.MeshBasicMaterial({ ...zajednicko, color: 0xffffff });
    this.matBeacon = new THREE.MeshBasicMaterial({ ...zajednicko, color: 0xffffff });
  }

  // ── CustomLayerInterface ──

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    // Mapa je već nacrtana ispod; three ne sme da je obriše. `setSize` se
    // NIKAD ne zove — promenio bi dimenzije canvasa mape.
    this.renderer.autoClear = false;
    this.napraviInstance();
  }

  onRemove() {
    this.ukloniInstance();
    this.geoPrsten.dispose();
    this.geoBeacon.dispose();
    this.matPrsten.dispose();
    this.matBeacon.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  render(gl: WebGL2RenderingContext, opt: CustomRenderMethodInput) {
    const map = this.map;
    const renderer = this.renderer;
    if (!map || !renderer) return;

    const matrica = opt.defaultProjectionData?.mainMatrix ?? opt.modelViewProjectionMatrix;
    this.projekcija.fromArray(matrica as ArrayLike<number>);
    this.camera.projectionMatrix.multiplyMatrices(this.projekcija, this.modelMatrix);

    const r = pinSirinaM(this.origin.lat, map.getZoom());
    const t = (performance.now() - this.pocetak) / 1000;

    let animira = false;
    animira = this.azurirajPrstenove(t, r) || animira;
    animira = this.azurirajBeacone(t, r) || animira;

    renderer.resetState();
    // Mapa menja veličinu canvasa sama; three to ne prati bez `setSize`, pa
    // se viewport uzima iz stvarnog bafera na svakom kadru.
    renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.render(this.scene, this.camera);

    if (animira && !this.reducedMotion) map.triggerRepaint();
  }

  // ── javni API za canvas ──

  setData(tacke: ThreeTacka[]) {
    this.tacke = tacke;
    this.izracunajIshodiste();
    this.napraviInstance();
    this.map?.triggerRepaint();
  }

  /** `null` = sve tačke su vidljive (nema klastera). */
  setVidljive(ids: Set<string> | null) {
    this.vidljive = ids;
    this.map?.triggerRepaint();
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v;
    this.map?.triggerRepaint();
  }

  // ── unutrašnje ──

  private jeVidljiva(companyId: string): boolean {
    return this.vidljive === null || this.vidljive.has(companyId);
  }

  private izracunajIshodiste() {
    let lng = 20.4573;
    let lat = 44.8125;
    if (this.tacke.length > 0) {
      let sLng = 0;
      let sLat = 0;
      for (const p of this.tacke) {
        sLng += p.lng;
        sLat += p.lat;
      }
      lng = sLng / this.tacke.length;
      lat = sLat / this.tacke.length;
    }
    const mc = MercatorCoordinate.fromLngLat({ lng, lat }, 0);
    const s = mc.meterInMercatorCoordinateUnits();
    this.origin = { x: mc.x, y: mc.y, z: mc.z, s, lat };

    // T · S(s, −s, s) · Rx(90°): scena X → istok, scena Z → jug, scena Y → gore.
    const translacija = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z);
    const skala = new THREE.Matrix4().makeScale(s, -s, s);
    const rotacija = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    this.modelMatrix.copy(translacija).multiply(skala).multiply(rotacija);

    this.lokalne = new Float32Array(this.tacke.length * 2);
    for (let i = 0; i < this.tacke.length; i++) {
      const p = MercatorCoordinate.fromLngLat(
        { lng: this.tacke[i].lng, lat: this.tacke[i].lat },
        0,
      );
      this.lokalne[i * 2] = (p.x - mc.x) / s;
      this.lokalne[i * 2 + 1] = (p.y - mc.y) / s;
    }
  }

  private napraviInstance() {
    this.ukloniInstance();
    if (!this.renderer) return;

    this.prstenTacke = [];
    this.beaconTacke = [];
    for (let i = 0; i < this.tacke.length; i++) {
      if (this.tacke[i].hot) this.prstenTacke.push(i);
      if (this.tacke[i].sastanakUskoro) this.beaconTacke.push(i);
    }

    // Nasumična faza po firmi — dva prstena jedan do drugog ne trepću uglas.
    this.prstenFaze = new Float32Array(this.prstenTacke.length);
    for (let k = 0; k < this.prstenFaze.length; k++) {
      this.prstenFaze[k] = Math.random() * PULS_S;
    }
    this.beaconFaze = new Float32Array(this.beaconTacke.length);
    for (let k = 0; k < this.beaconFaze.length; k++) {
      this.beaconFaze[k] = Math.random() * BEACON_S;
    }

    if (this.prstenTacke.length > 0) {
      this.prstenovi = this.napraviInstancirani(
        this.geoPrsten,
        this.matPrsten,
        this.prstenTacke.length,
      );
      this.scene.add(this.prstenovi);
    }
    if (this.beaconTacke.length > 0) {
      this.beaconi = this.napraviInstancirani(
        this.geoBeacon,
        this.matBeacon,
        this.beaconTacke.length,
      );
      this.scene.add(this.beaconi);
    }
  }

  private napraviInstancirani(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    broj: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, broj);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instance su rasute po gradu; sfera geometrije ne opisuje skup.
    mesh.frustumCulled = false;
    // `setColorAt` jednom pravi `instanceColor` atribut.
    for (let k = 0; k < broj; k++) mesh.setColorAt(k, this.boja.setRGB(0, 0, 0));
    if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  private ukloniInstance() {
    if (this.prstenovi) {
      this.scene.remove(this.prstenovi);
      this.prstenovi.dispose();
      this.prstenovi = null;
    }
    if (this.beaconi) {
      this.scene.remove(this.beaconi);
      this.beaconi.dispose();
      this.beaconi = null;
    }
  }

  /** Vraća `true` dok nešto pulsira (traži sledeći kadar). */
  private azurirajPrstenove(t: number, r: number): boolean {
    const mesh = this.prstenovi;
    if (!mesh) return false;
    if (this.reducedMotion) {
      mesh.visible = false;
      return false;
    }
    mesh.visible = true;
    let zivih = 0;
    for (let k = 0; k < this.prstenTacke.length; k++) {
      const i = this.prstenTacke[k];
      const vidljiva = this.jeVidljiva(this.tacke[i].companyId);
      const u = ((t + this.prstenFaze[k]) % PULS_S) / PULS_S;
      const skala = vidljiva ? r * PRSTEN_OSNOVA * (1 + PRSTEN_RAST * u) : 0;
      this.dummy.position.set(this.lokalne[i * 2], PRSTEN_VISINA_M, this.lokalne[i * 2 + 1]);
      this.dummy.scale.set(skala, 1, skala);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(k, this.dummy.matrix);
      const alfa = vidljiva ? PRSTEN_ALFA * (1 - u) * (1 - u) : 0;
      mesh.setColorAt(k, this.boja.copy(this.bojaHot).multiplyScalar(alfa));
      if (vidljiva) zivih++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return zivih > 0;
  }

  private azurirajBeacone(t: number, r: number): boolean {
    const mesh = this.beaconi;
    if (!mesh) return false;
    if (this.reducedMotion) {
      mesh.visible = false;
      return false;
    }
    mesh.visible = true;
    let zivih = 0;
    for (let k = 0; k < this.beaconTacke.length; k++) {
      const i = this.beaconTacke[k];
      const vidljiva = this.jeVidljiva(this.tacke[i].companyId);
      const u = ((t + this.beaconFaze[k]) % BEACON_S) / BEACON_S;
      const skala = vidljiva ? r * BEACON_POLUPRECNIK * (1 - 0.4 * u) : 0;
      // Diže se sa tla (ispod pina) i bledi.
      this.dummy.position.set(
        this.lokalne[i * 2],
        u * r * BEACON_USPON,
        this.lokalne[i * 2 + 1],
      );
      this.dummy.scale.set(skala, skala, skala);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(k, this.dummy.matrix);
      // Brz ulazak (prvih 12 %) pa lagano bleđenje pri dizanju.
      const alfa = vidljiva ? Math.min(1, u * 8) * (1 - u) : 0;
      mesh.setColorAt(k, this.boja.copy(this.bojaWarning).multiplyScalar(alfa));
      if (vidljiva) zivih++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return zivih > 0;
  }
}
