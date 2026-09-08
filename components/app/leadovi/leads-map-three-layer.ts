import * as THREE from "three";
import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { heksPoluprecnikM } from "./leads-map-geo";

/**
 * ============================================================================
 * THREE.JS SLOJ NA MAPI (GL4) — plan §9, §O9
 * ============================================================================
 *
 * `CustomLayerInterface` koji crta u ISTI WebGL kontekst mape, sa kamerom iz
 * MapLibre-ove projekcione matrice — ne drugi canvas preko mape. Sloj je
 * DODATAK: ne dira klastere, hover ni klik, i ne menja ništa u native mapi.
 *
 * Svaki efekat nosi informaciju, ili ga nema:
 *  - hot firma      → prsten na tlu koji pulsira (2,4 s, nasumična faza po
 *                     firmi da ne trepću uglas)
 *  - izabrana firma → vertikalni snop (aditivno mešanje), visine 2× heksagona
 *  - sastanak u narednih 7 dana → spor beacon (sfera koja se diže i bledi
 *                     svakih 4 s)
 *
 * Pod `prefers-reduced-motion`: bez pulsa i bez beacona; snop ostaje,
 * statičan. Sloj se crta samo za tačke koje TRENUTNO nisu u klasteru — isti
 * skup koji GL3 crta kao heksagone (`setVidljive`).
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
  /** Visina heksagona (m) — snop je 2× toliko, beacon polazi sa vrha. */
  visinaM: number;
  hot: boolean;
  sastanakUskoro: boolean;
};

export type ThreeTokeni = {
  /** `--temp-hot` — prsten. */
  hot: string;
  /** `--accent-400` — snop izabrane firme. */
  accent: string;
  /** `--warning` — beacon sastanka (ista boja kao „sastanak uskoro" u tabeli). */
  warning: string;
};

const PULS_S = 2.4;
const BEACON_S = 4;
const DAH_S = 3;

/** Prsten: od 1,15× poluprečnika heksagona do 1,6× toga. */
const PRSTEN_OSNOVA = 1.15;
const PRSTEN_RAST = 0.6;
const PRSTEN_ALFA = 0.6;
/** Prsten stoji malo iznad tla da se ne tuče sa ravnim slojevima mape. */
const PRSTEN_VISINA_M = 0.6;

const BEACON_POLUPRECNIK = 0.32;
const BEACON_USPON = 3;

const SNOP_POLUPRECNIK = 0.38;
const SNOP_ALFA = 0.36;
const SNOP_DAH = 0.1;

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
  private readonly bojaAccent: THREE.Color;
  private readonly bojaWarning: THREE.Color;

  // ── podaci ──
  private tacke: ThreeTacka[] = [];
  private origin = { x: 0, y: 0, z: 0, s: 1, lat: 44.8125 };
  /** Lokalne koordinate (X, Z) po tački, u metrima od ishodišta. */
  private lokalne = new Float32Array(0);
  private readonly modelMatrix = new THREE.Matrix4();
  private vidljive: Set<string> | null = null;
  private izabrana: string | null = null;
  /** Indeks izabrane u `tacke`, računat pri promeni — ne `findIndex` po kadru. */
  private izabranaIdx = -1;

  // ── geometrije i materijali (jednom) ──
  private readonly geoPrsten: THREE.RingGeometry;
  private readonly geoBeacon: THREE.SphereGeometry;
  private readonly geoSnop: THREE.CylinderGeometry;
  private readonly matPrsten: THREE.MeshBasicMaterial;
  private readonly matBeacon: THREE.MeshBasicMaterial;
  private readonly matSnop: THREE.MeshBasicMaterial;

  // ── instance ──
  private prstenovi: THREE.InstancedMesh | null = null;
  private prstenTacke: number[] = [];
  private prstenFaze = new Float32Array(0);
  private beaconi: THREE.InstancedMesh | null = null;
  private beaconTacke: number[] = [];
  private beaconFaze = new Float32Array(0);
  private snop: THREE.Mesh | null = null;

  // ── ponovo korišćeni objekti (bez alokacija po kadru) ──
  private readonly dummy = new THREE.Object3D();
  private readonly boja = new THREE.Color();
  private readonly projekcija = new THREE.Matrix4();
  private readonly pocetak = performance.now();

  constructor(tokeni: ThreeTokeni, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.bojaHot = cssBoja(tokeni.hot, 0xe04a3c);
    this.bojaAccent = cssBoja(tokeni.accent, 0x58c4ff);
    this.bojaWarning = cssBoja(tokeni.warning, 0xfbbf24);

    // Prsten u ravni tla (XZ), normala nagore. Skalira se po instanci.
    this.geoPrsten = new THREE.RingGeometry(0.72, 1, 40);
    this.geoPrsten.rotateX(-Math.PI / 2);

    this.geoBeacon = new THREE.SphereGeometry(1, 12, 8);

    // Snop: otvoren cilindar visine 1 sa osnovom na y = 0; vertex boja pada
    // od 1 (dno) do 0 (vrh) — sa aditivnim mešanjem crno je providno, pa
    // snop bledi ka nebu bez teksture i bez šejdera.
    this.geoSnop = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    this.geoSnop.translate(0, 0.5, 0);
    const pozicije = this.geoSnop.getAttribute("position");
    const boje = new Float32Array(pozicije.count * 3);
    for (let i = 0; i < pozicije.count; i++) {
      const y = pozicije.getY(i);
      const jacina = Math.max(0, 1 - y) ** 1.5;
      boje[i * 3] = jacina;
      boje[i * 3 + 1] = jacina;
      boje[i * 3 + 2] = jacina;
    }
    this.geoSnop.setAttribute("color", new THREE.BufferAttribute(boje, 3));

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
    this.matSnop = new THREE.MeshBasicMaterial({
      ...zajednicko,
      color: this.bojaAccent,
      vertexColors: true,
      opacity: SNOP_ALFA,
    });
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
    this.geoSnop.dispose();
    this.matPrsten.dispose();
    this.matBeacon.dispose();
    this.matSnop.dispose();
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

    const r = heksPoluprecnikM(this.origin.lat, map.getZoom());
    const t = (performance.now() - this.pocetak) / 1000;

    let animira = false;
    animira = this.azurirajPrstenove(t, r) || animira;
    animira = this.azurirajBeacone(t, r) || animira;
    animira = this.azurirajSnop(t, r) || animira;

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
    this.izabranaIdx = this.nadjiIndeks(this.izabrana);
    this.map?.triggerRepaint();
  }

  /** `null` = sve tačke su vidljive (nema klastera). */
  setVidljive(ids: Set<string> | null) {
    this.vidljive = ids;
    this.map?.triggerRepaint();
  }

  setIzabrana(companyId: string | null) {
    this.izabrana = companyId;
    this.izabranaIdx = this.nadjiIndeks(companyId);
    this.map?.triggerRepaint();
  }

  private nadjiIndeks(companyId: string | null): number {
    if (companyId === null) return -1;
    return this.tacke.findIndex((p) => p.companyId === companyId);
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

    this.snop = new THREE.Mesh(this.geoSnop, this.matSnop);
    this.snop.frustumCulled = false;
    this.snop.visible = false;
    this.scene.add(this.snop);
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
    if (this.snop) {
      this.scene.remove(this.snop);
      this.snop = null;
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
      const p = this.tacke[i];
      const vidljiva = this.jeVidljiva(p.companyId);
      const u = ((t + this.beaconFaze[k]) % BEACON_S) / BEACON_S;
      const skala = vidljiva ? r * BEACON_POLUPRECNIK * (1 - 0.4 * u) : 0;
      this.dummy.position.set(
        this.lokalne[i * 2],
        p.visinaM + u * r * BEACON_USPON,
        this.lokalne[i * 2 + 1],
      );
      this.dummy.scale.set(skala, skala, skala);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(k, this.dummy.matrix);
      // Brz ulazak (prvih 12 %) pa lagano bleđenje do vrha.
      const alfa = vidljiva ? Math.min(1, u * 8) * (1 - u) : 0;
      mesh.setColorAt(k, this.boja.copy(this.bojaWarning).multiplyScalar(alfa));
      if (vidljiva) zivih++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return zivih > 0;
  }

  private azurirajSnop(t: number, r: number): boolean {
    const mesh = this.snop;
    if (!mesh) return false;
    const i = this.izabranaIdx;
    if (i < 0 || i >= this.tacke.length || !this.jeVidljiva(this.tacke[i].companyId)) {
      mesh.visible = false;
      return false;
    }
    mesh.visible = true;
    mesh.position.set(this.lokalne[i * 2], 0, this.lokalne[i * 2 + 1]);
    mesh.scale.set(r * SNOP_POLUPRECNIK, this.tacke[i].visinaM * 2, r * SNOP_POLUPRECNIK);
    if (this.reducedMotion) {
      this.matSnop.opacity = SNOP_ALFA;
      return false;
    }
    // Sporo disanje — ambijentni sloj, ne signal.
    this.matSnop.opacity = SNOP_ALFA + SNOP_DAH * Math.sin((2 * Math.PI * t) / DAH_S);
    return true;
  }
}
