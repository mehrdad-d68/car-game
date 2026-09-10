import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OSMMapData } from '../engine/sim/osm-types';
import { LoadMapComponent, parseMapJson } from './load-map.component';

const MAP: OSMMapData = {
  meta: {
    source: 'openstreetmap',
    generatedAt: '2026-01-01T00:00:00Z',
    place: 'test',
    center: { lat: 48.14, lng: 16.29 },
    bbox: { south: 48.13, west: 16.25, north: 48.16, east: 16.33 },
    totalRoads: 1,
  },
  roads: [
    {
      id: 1,
      type: 'motorway',
      name: 'Test',
      lanes: 2,
      width: 12,
      oneway: 1,
      access: 'yes',
      points: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
      ],
    },
  ],
};

describe('parseMapJson', () => {
  it('parses a JSON string into a map', async () => {
    const map = await parseMapJson(JSON.stringify(MAP));
    expect(map).toEqual(MAP);
  });

  it('rejects a non-JSON string', async () => {
    await expect(parseMapJson('not json')).rejects.toThrow();
  });
});

describe('LoadMapComponent', () => {
  let fixture: ComponentFixture<LoadMapComponent>;
  let component: LoadMapComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadMapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(LoadMapComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  function pickFile(raw: string): void {
    const input = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([raw], 'map.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
  }

  async function settled(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  it('shows a Load Map button with a JSON-only file input', () => {
    const button = fixture.nativeElement.querySelector('button');
    expect(button.textContent).toContain('Load Map');

    const input = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toMatch(/\.json/);
  });

  it('validates a good file and emits the map', async () => {
    let emitted: OSMMapData | undefined;
    component.mapValidated.subscribe((map) => (emitted = map));

    pickFile(JSON.stringify(MAP));
    await settled();

    const req = http.expectOne('/api/map');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(MAP);
    req.flush({ valid: true, errors: [] });

    await settled();
    expect(emitted).toEqual(MAP);
  });

  it('shows backend validation errors and does not emit', async () => {
    let emitted = false;
    component.mapValidated.subscribe(() => (emitted = true));

    pickFile(JSON.stringify(MAP));
    await settled();

    const req = http.expectOne('/api/map');
    req.flush({ valid: false, errors: ['roads[0].width must be a finite number'] });

    await settled();
    expect(emitted).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(
      'roads[0].width must be a finite number',
    );
  });

  it('flags a non-JSON file without calling the map service', async () => {
    pickFile('{ this is not json ');
    await settled();

    expect(fixture.nativeElement.textContent).toContain('not valid JSON');
    http.expectNone('/api/map');
  });
});