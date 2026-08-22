// Mocks the aircon controller's HTTP API by intercepting requests to this
// origin's /proxy route (the path the app always uses when not running
// natively). Lets tests drive the exact same request shape the real device
// would receive, without a real controller on the network.
//
// Pass nativeBase (e.g. 'http://192.168.1.192:2025') to ALSO intercept the
// direct (non-proxy) URL shape proxyPath() uses when isNative() is faked
// true -- needed to test the native-only code paths (raw-output fetch),
// which otherwise never execute under Playwright since isNative() is
// normally always false in a plain browser.
export async function mockController(page, { staleGetSystemData = false, delayMs = 0, nativeBase = null } = {}) {
  const state = {
    airconOnOff: '0',
    mode: '1',
    fanSpeed: '2',
    centralDesiredTemp: '22',
    centralActualTemp: '21.5',
    zones: {
      1: { setting: '0', userPercentSetting: '80', desiredTemp: '22', actualTemp: '21' },
      2: { setting: '0', userPercentSetting: '80', desiredTemp: '22', actualTemp: '20.5' },
      3: { setting: '0', userPercentSetting: '80', desiredTemp: '22', actualTemp: '19.8' },
    },
  };
  // Snapshot used for getSystemData/getZoneData responses when
  // staleGetSystemData is on — simulates the real unit not having applied a
  // just-sent command yet. Zone entries need their own copies, not just the
  // top-level spread, since setZoneData mutates each zone object in place
  // and a shared reference would let the "stale" snapshot drift anyway.
  const staleSnapshot = {
    ...state,
    zones: Object.fromEntries(Object.entries(state.zones).map(([z, zs]) => [z, { ...zs }])),
  };

  function respondFor(path, params) {
    if (path === '/getSystemData') {
      const s = staleGetSystemData ? staleSnapshot : state;
      return {
        contentType: 'application/xml',
        body: `<systemData><airconOnOff>${s.airconOnOff}</airconOnOff><mode>${s.mode}</mode><fanSpeed>${s.fanSpeed}</fanSpeed><centralDesiredTemp>${s.centralDesiredTemp}</centralDesiredTemp><centralActualTemp>${s.centralActualTemp}</centralActualTemp></systemData>`,
      };
    }
    if (path === '/setSystemData') {
      if (params.has('airconOnOff')) state.airconOnOff = params.get('airconOnOff');
      if (params.has('mode')) state.mode = params.get('mode');
      if (params.has('fanSpeed')) state.fanSpeed = params.get('fanSpeed');
      if (params.has('centralDesiredTemp')) state.centralDesiredTemp = params.get('centralDesiredTemp');
      return { contentType: 'application/xml', body: '<ack>1</ack>' };
    }
    if (path === '/getZoneData') {
      const z = params.get('zone');
      // Falls back to a default reading for a zone number beyond the 3
      // seeded above (e.g. a test driving #zones up toward its max of 16)
      // instead of throwing on the undefined lookup -- a thrown error here
      // fails the whole route handler, which surfaces as a hard Playwright
      // test failure rather than the ordinary failed-fetch a real unmocked
      // zone would produce.
      const defaultZone = { setting: '0', userPercentSetting: '80', desiredTemp: '22', actualTemp: '20' };
      const zs = (staleGetSystemData ? staleSnapshot.zones[z] : state.zones[z]) || defaultZone;
      return {
        contentType: 'application/xml',
        body: `<zoneData><setting>${zs.setting}</setting><userPercentSetting>${zs.userPercentSetting}</userPercentSetting><desiredTemp>${zs.desiredTemp}</desiredTemp><actualTemp>${zs.actualTemp}</actualTemp></zoneData>`,
      };
    }
    if (path === '/setZoneData') {
      const z = params.get('zone');
      const zs = state.zones[z];
      if (params.has('zoneSetting')) zs.setting = params.get('zoneSetting');
      if (params.has('desiredTemp')) zs.desiredTemp = params.get('desiredTemp');
      if (params.has('userPercentSetting')) zs.userPercentSetting = params.get('userPercentSetting');
      return { contentType: 'application/xml', body: '<ack>1</ack>' };
    }
    return { status: 404, body: 'not mocked' };
  }

  await page.route('**/proxy**', async (route) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/proxy/, '');
    return route.fulfill(respondFor(path, url.searchParams));
  });

  if (nativeBase) {
    await page.route(`${nativeBase}/**`, async (route) => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const url = new URL(route.request().url());
      return route.fulfill(respondFor(url.pathname, url.searchParams));
    });
  }

  return state;
}
