import {
  HttpClient,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BackendPropSource } from './backend-prop-source';
import { PropSpec } from '../engine/sim/prop-spec';

const A_PROP: PropSpec = {
  kind: 'gasStation',
  name: 'Gas station',
  footprint: { width: 8, depth: 6 },
  variants: [
    {
      id: 'default',
      parts: [
        { name: 'canopy', size: [8, 0.3, 6], position: [0, 3.15, 0], color: 0xfdd835 },
      ],
    },
  ],
};

function setup(): {
  controller: HttpTestingController;
  create: () => BackendPropSource;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpClient);
  const destroyRef = TestBed.inject(DestroyRef);
  const controller = TestBed.inject(HttpTestingController);
  return {
    controller,
    create: () => new BackendPropSource(http, destroyRef),
  };
}

describe('BackendPropSource', () => {
  it('resolves with the prop catalog from /api/props', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadProps();
    const req = controller.expectOne('/api/props');
    expect(req.request.method).toBe('GET');

    req.flush([A_PROP]);

    const props = await promise;
    expect(props).toHaveLength(1);
    expect(props[0].kind).toBe('gasStation');
  });

  it('rejects when the request errors', async () => {
    const { controller, create } = setup();
    const source = create();

    const promise = source.loadProps();
    controller.expectOne('/api/props').error(new ProgressEvent('error'));

    await expect(promise).rejects.toBeTruthy();
  });
});