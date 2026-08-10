// Mocks the aircon controller's HTTP API by intercepting requests to this
// origin's /proxy route (the path the app always uses when not running
// natively). Lets tests drive the exact same request shape the real device
// would receive, without a real controller on the network.
export async function mockController(page, { staleGetSystemData = false } = {}) {
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
  // Snapshot used for getSystemData responses when staleGetSystemData is on —
  // simulates the real unit not having applied a just-sent command yet.
  const staleSnapshot = { ...state };

  await page.route('**/proxy**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/proxy/, '');
    const params = url.searchParams;

    if (path === '/getSystemData') {
      const s = staleGetSystemData ? staleSnapshot : state;
      return route.fulfill({
        contentType: 'application/xml',
        body: `<systemData><airconOnOff>${s.airconOnOff}</airconOnOff><mode>${s.mode}</mode><fanSpeed>${s.fanSpeed}</fanSpeed><centralDesiredTemp>${s.centralDesiredTemp}</centralDesiredTemp><centralActualTemp>${s.centralActualTemp}</centralActualTemp></systemData>`,
      });
    }
    if (path === '/setSystemData') {
      if (params.has('airconOnOff')) state.airconOnOff = params.get('airconOnOff');
      if (params.has('mode')) state.mode = params.get('mode');
      if (params.has('fanSpeed')) state.fanSpeed = params.get('fanSpeed');
      if (params.has('centralDesiredTemp')) state.centralDesiredTemp = params.get('centralDesiredTemp');
      return route.fulfill({ contentType: 'application/xml', body: '<ack>1</ack>' });
    }
    if (path === '/getZoneData') {
      const z = params.get('zone');
      const zs = state.zones[z];
      return route.fulfill({
        contentType: 'application/xml',
        body: `<zoneData><setting>${zs.setting}</setting><userPercentSetting>${zs.userPercentSetting}</userPercentSetting><desiredTemp>${zs.desiredTemp}</desiredTemp><actualTemp>${zs.actualTemp}</actualTemp></zoneData>`,
      });
    }
    if (path === '/setZoneData') {
      const z = params.get('zone');
      const zs = state.zones[z];
      if (params.has('zoneSetting')) zs.setting = params.get('zoneSetting');
      if (params.has('desiredTemp')) zs.desiredTemp = params.get('desiredTemp');
      if (params.has('userPercentSetting')) zs.userPercentSetting = params.get('userPercentSetting');
      return route.fulfill({ contentType: 'application/xml', body: '<ack>1</ack>' });
    }
    return route.fulfill({ status: 404, body: 'not mocked' });
  });

  return state;
}
