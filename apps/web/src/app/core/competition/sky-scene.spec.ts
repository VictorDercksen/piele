import { skyScene } from './sky-scene';

describe('sky scene', () => {
  it('maps WMO codes to scenes, reading a missing code as cloudy', () => {
    expect([0, 2, 45, 53, 61, 73, 95, 3, null].map(skyScene)).toEqual([
      'clear',
      'partly',
      'fog',
      'drizzle',
      'rain',
      'snow',
      'storm',
      'cloudy',
      'cloudy',
    ]);
  });
});
