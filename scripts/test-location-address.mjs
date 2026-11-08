// Run with: node --experimental-vm-modules scripts/test-location-address.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import * as vue from 'vue'
import * as pinia from 'pinia'

const root = new URL('../src/features/weather/', import.meta.url)
const sources = Object.fromEntries(await Promise.all(
  ['useWeatherStore', 'useAddressRefresh', 'pointAddress', 'placeLookup', 'warnings'].map(async (name) =>
    [name, await readFile(new URL(`${name}.js`, root), 'utf8')]),
))
const cityA = { id: 'a', name: '黄岩', adm1: '浙江省', adm2: '台州市', lon: '121.26', lat: '28.65' }
const cityB = { id: 'b', name: '海曙', adm1: '浙江省', adm2: '宁波市', lon: '121.55', lat: '29.87' }
const address = (city, road = '中学路') => ({
  district: `${city.name}区`, city: city.adm2, province: city.adm1, township: '某街道', road,
})
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1 }
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

async function fixture({ city = cityA, key = 'test-key', saved = {} } = {}) {
  const timers = new Map()
  let timerId = 0
  const errors = []
  const context = vm.createContext({
    console: { log() {}, error: (...args) => errors.push(args) },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId },
    clearTimeout: (id) => timers.delete(id),
  })
  const AmapKey = vue.ref(key)
  const reverseCalls = []
  const weatherCalls = []
  let historyCalls = 0
  let reverse = async () => address(cityA)
  let lookup = async () => ({ location: [city] })
  const initial = { city: `${city.adm1}, ${city.name}`, location: city.id, CityDetail: city, point: null, ...saved }
  const stored = new Map()
  const api = {
    lookupCity: (...args) => lookup(...args),
    get7DayForecast: async (coord) => { weatherCalls.push(coord); return { daily: [] } },
    getCurrentWeather: async (coord) => { weatherCalls.push(coord); return { icon: '100', temp: '20' } },
    getWeatherWarnings: async (coord) => { weatherCalls.push(coord); return { alerts: [] } },
    getWeatherIndices: async () => ({ daily: [] }),
    getMinutelyPrecipitation: async () => ({ minutely: [] }),
  }
  const mocks = {
    vue, pinia,
    '@vueuse/core': { useStorage: (name, value) => {
      if (!stored.has(name)) stored.set(name, vue.ref(name === 'WeatherChosenCity' ? initial : value))
      return stored.get(name)
    } },
    '@/api/weather': api,
    '@/api/errors': { isNetworkError: () => false },
    '@/shared/Bus': { default: { emit() {} } },
    '@/features/wallpaper/constants': { BUS_EVENTS: {} },
    '@/api/credentials': { AmapKey, UserApiFingerprint: vue.ref('test'), ActiveEntries: vue.ref([{}]) },
    '@/features/onboarding/onboardingState': { ChosenLocationPath: vue.ref([]) },
    '@/config/weatherCache': { getCacheTtl: () => 60000, isCacheFresh: () => false },
    '@/features/weather/mapTiles': { wgs84ToGcj02: (lng, lat) => [lng, lat] },
    './reverseGeocode': {
      isReverseGeocodeEnabled: () => !!AmapKey.value,
      reverseGeocode: (...args) => { reverseCalls.push(args); return reverse(...args) },
    },
    './useLocationHistory': { refreshLocationHistory: async () => { historyCalls += 1 } },
  }
  const modules = new Map()
  async function moduleFor(specifier) {
    const name = specifier === '@/store' ? 'useWeatherStore' : specifier.split('/').at(-1)
    const id = sources[name] ? name : specifier
    if (modules.has(id)) return modules.get(id)
    const mod = sources[name]
      ? new vm.SourceTextModule(sources[name], { context, identifier: name })
      : new vm.SyntheticModule(Object.keys(mocks[specifier] || {}), function () {
        for (const [key, value] of Object.entries(mocks[specifier])) this.setExport(key, value)
      }, { context, identifier: specifier })
    assert.ok(sources[name] || mocks[specifier], `Missing test dependency: ${specifier}`)
    modules.set(id, mod)
    await mod.link(moduleFor)
    return mod
  }
  const mod = await moduleFor('useAddressRefresh')
  await mod.evaluate()
  pinia.setActivePinia(pinia.createPinia())
  const store = modules.get('useWeatherStore').namespace.useWeatherStore()
  const scope = vue.effectScope()
  scope.run(() => mod.namespace.useAddressRefresh())
  const settle = async () => {
    for (let index = 0; index < 30; index += 1) await Promise.resolve()
    await vue.nextTick()
  }
  const flush = async () => {
    await settle()
    for (let index = 0; timers.size && index < 30; index += 1) {
      const callbacks = [...timers.values()]
      timers.clear()
      callbacks.forEach((callback) => callback())
      await settle()
    }
    assert.equal(timers.size, 0, 'Timers should settle')
  }
  return {
    store, AmapKey, reverseCalls, weatherCalls, errors, flush,
    get historyCalls() { return historyCalls },
    setReverse: (fn) => { reverse = fn }, setLookup: (fn) => { lookup = fn },
    stop: () => scope.stop(),
  }
}

// 旧区县地址启动即补查，中心坐标与天气一致，且不会冒充地图选点。
{
  const f = await fixture()
  await f.flush()
  check(f.reverseCalls.map((args) => args.slice(0, 2)), [[121.26, 28.65]])
  check(f.store.CityAddressLabel, '黄岩区 中学路')
  check(f.store.dayDateCity.point, null)
  check(f.store.dayDateCity.centerAddress.districtSource, 'amap')
  check(f.weatherCalls.length, 0)
  check(f.historyCalls, 0)
  const saved = JSON.parse(JSON.stringify(f.store.dayDateCity))
  f.stop()
  const restored = await fixture({ saved })
  await restored.flush()
  check(restored.reverseCalls.length, 0)
  check(restored.store.CityAddressLabel, '黄岩区 中学路')
  restored.stop()
}

// 不点地图直接确认另一区县，反查和天气都使用新中心；同区县确认复用地址。
{
  const f = await fixture()
  await f.flush()
  f.setReverse(async () => address(cityB, '解放路'))
  await f.store.getLocationInformation({ city: cityB, isSearch: true })
  await f.flush()
  check(f.reverseCalls.at(-1).slice(0, 2), [121.55, 29.87])
  check(f.weatherCalls.every((coord) => coord.lon === 121.55 && coord.lat === 29.87), true)
  check(f.store.CityAddressLabel, '海曙区 解放路')
  await f.store.getLocationInformation({ city: cityB, isSearch: true })
  await f.flush()
  check(f.reverseCalls.length, 2)
  check(f.store.dayDateCity.point, null)
  f.stop()
}

// 快速切换中心后，迟到的旧响应不能覆盖新地址；卸载后也不能回写。
{
  const f = await fixture()
  const old = deferred()
  f.setReverse(() => old.promise)
  await f.flush()
  f.setReverse(async () => address(cityB, '解放路'))
  f.store.dayDateCity = { ...f.store.dayDateCity, location: cityB.id, CityDetail: cityB }
  await f.flush()
  old.resolve(address(cityA))
  await f.flush()
  check(f.store.CityAddressLabel, '海曙区 解放路')
  const pending = deferred()
  f.setReverse(() => pending.promise)
  f.store.dayDateCity = { ...f.store.dayDateCity, location: cityA.id, CityDetail: cityA }
  await f.flush()
  f.stop()
  pending.resolve(address(cityA))
  await f.flush()
  check(f.store.CityAddressLabel, '浙江省, 黄岩')
}

// 没有高德时用区县兜底；补填密钥升级街道，清空密钥移除旧路名。
{
  const f = await fixture({ key: '' })
  await f.flush()
  check(f.store.CityAddressLabel, '台州市 黄岩附近')
  f.AmapKey.value = 'new-key'
  await f.flush()
  check(f.store.CityAddressLabel, '黄岩区 中学路')
  check(f.historyCalls, 1)
  f.AmapKey.value = ''
  await f.flush()
  check(f.store.dayDateCity.centerAddress.road, '')
  check(f.store.dayDateCity.centerAddress.districtSource, 'qweather')
  check(f.store.CityAddressLabel, '台州市 黄岩附近')
  check(f.historyCalls, 2)
  f.stop()
}

// 反查两路失败时保持地区显示；地图选点启动时不重复发请求。
{
  const f = await fixture()
  f.setReverse(async () => { throw new Error('offline') })
  f.setLookup(async () => { throw new Error('offline') })
  await f.flush()
  check(f.store.CityAddressLabel, '浙江省, 黄岩')
  check(f.store.dayDateCity.point, null)
  check(f.errors.length, 0)
  f.stop()
  const point = { lng: 121.27, lat: 28.66, crs: 'GCJ02', district: '黄岩区', road: '新路', districtSource: 'amap' }
  const selected = await fixture({ saved: { point } })
  await selected.flush()
  check(selected.reverseCalls.length, 0)
  check(selected.store.CityAddressLabel, '黄岩区 新路')
  selected.stop()
}

console.log(`PASS: ${checks} location address checks`)
