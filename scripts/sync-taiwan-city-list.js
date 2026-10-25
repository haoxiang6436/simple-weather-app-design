/**
 * 用和风天气官方城市列表刷新 src/data/CityList.js 里的「台湾省」区划数据。
 *
 * 背景：地址选择页把三级列表选出来的 value 直接丢给 /geo/v2/city/lookup，
 * 内地省市县传的是 6 位 adcode，但和风的城市库里没有台湾的 adcode
 * （location=710000 / 710100 一律返回 400 invalid-params），
 * 所以台湾这一支的 value 改用和风官方的 LocationID：
 *   台北市 = 101340101、中正区 = 15FC8、马公市 = 753A2 …
 * 这样三级列表选出来的仍然是一个和风能直接定位的串，lookupCity() 一行都不用改。
 *
 * 用法：
 *   curl -L -o China-City-List-latest.csv \
 *     https://raw.githubusercontent.com/qwd/LocationList/master/China-City-List-latest.csv
 *   node scripts/sync-taiwan-city-list.js China-City-List-latest.csv
 *
 * 数据来源：https://github.com/qwd/LocationList （和风天气官方维护，随接口数据一起更新）
 * 脚本只重写 CityList.js 里「台湾省」那一个节点，其余省份原样保留。
 */
const fs = require('fs')
const path = require('path')

const TAIWAN_ADM1 = '台湾省'
const PROVINCE_VALUE = '710000'
const nextProvinceValue = '810000'

// 官方列表里个别乡镇市区名残留了繁体字形，统一成简体，和内地县市保持一致
const CHAR_FIX = {
  峽: '峡',
  樹: '树',
  渓: '溪',
  華: '华',
  貢: '贡',
  蘆: '芦',
}

// 展示顺序：直辖市 → 市 → 县，和常见地图站点一致（官方列表是按 LocationID 排的）
const ADM2_ORDER = [
  '台北市', '新北市', '桃园市', '台中市', '台南市', '高雄市',
  '基隆市', '新竹市', '嘉义市',
  '新竹县', '苗栗县', '彰化县', '南投县', '云林县', '嘉义县', '屏东县',
  '宜兰县', '花莲县', '台东县', '澎湖县',
]

/**
 * 这几个县在和风数据里没有「县级」定位点，只有下面的乡镇市区，
 * 用县城所在地顶上（和风对「云林县」这类名字的查找结果也确实是褒忠乡之类，
 * 直接按名字查会定位到错误地点，所以这里写死县治的 LocationID）。
 */
const COUNTY_SEAT_FALLBACK = {
  新竹县: 'C30C', // 竹北市
  嘉义县: '4EB49', // 太保市
  云林县: '884E', // 斗六市
  澎湖县: '753A2', // 马公市
}

const fixName = (name) => Array.from(name).map((char) => CHAR_FIX[char] || char).join('')

/** 极简 CSV 解析：够用即可（官方列表只用到引号包裹和逗号分隔） */
const parseCsv = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((item) => item.some((cell) => cell !== ''))
}

const buildTaiwanBlock = (rows) => {
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row.adm2)) groups.set(row.adm2, [])
    groups.get(row.adm2).push(row)
  }

  const order = [
    ...ADM2_ORDER.filter((name) => groups.has(name)),
    ...[...groups.keys()].filter((name) => !ADM2_ORDER.includes(name)),
  ]

  const collator = new Intl.Collator('zh-Hans-CN')
  const cityNodes = order.map((adm2) => {
    const items = groups.get(adm2)
    const cityId =
      items.find((item) => item.name === adm2)?.id ||
      items.find((item) => item.id.startsWith('10134'))?.id ||
      COUNTY_SEAT_FALLBACK[adm2] ||  // 县治兜底
      items[0].id
    const districts = items
      .filter((item) => item.id !== cityId)
      .sort((a, b) => collator.compare(a.name, b.name))
    return { id: cityId, label: adm2, districts }
  })

  const indent = (level) => ' '.repeat(4 * level)
  const lines = []
  lines.push(`${indent(1)}// 台湾省：和风城市库里没有台湾的 adcode（传 710000 / 710100 会返回 400），`)
  lines.push(`${indent(1)}// 所以这一支的 value 直接用和风官方 LocationID（台北市 101340101、中正区 15FC8…），`)
  lines.push(`${indent(1)}// 三级列表选出来的依然是和风能直接定位的串，lookupCity() 无需改动。`)
  lines.push(`${indent(1)}// 数据用 node scripts/sync-taiwan-city-list.js <和风官方城市列表.csv> 刷新。`)
  lines.push(`${indent(1)}{`)
  lines.push(`${indent(2)}"value": "${PROVINCE_VALUE}",`)
  lines.push(`${indent(2)}"label": "${TAIWAN_ADM1}",`)
  lines.push(`${indent(2)}"children": [`)
  cityNodes.forEach((city, cityIndex) => {
    lines.push(`${indent(3)}{`)
    lines.push(`${indent(4)}"value": "${city.id}",`)
    lines.push(`${indent(4)}"label": "${city.label}",`)
    lines.push(`${indent(4)}"children": [`)
    city.districts.forEach((district, districtIndex) => {
      lines.push(`${indent(5)}{`)
      lines.push(`${indent(6)}"value": "${district.id}",`)
      lines.push(`${indent(6)}"label": "${district.name}"`)
      lines.push(`${indent(5)}}${districtIndex === city.districts.length - 1 ? '' : ','}`)
    })
    lines.push(`${indent(4)}]`)
    lines.push(`${indent(3)}}${cityIndex === cityNodes.length - 1 ? '' : ','}`)
  })
  lines.push(`${indent(2)}]`)
  lines.push(`${indent(1)}},`)

  return { text: lines.join('\n') + '\n', cityNodes }
}

const main = () => {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('用法: node scripts/sync-taiwan-city-list.js <和风官方城市列表.csv>')
    process.exit(1)
  }

  const table = parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8').replace(/^\uFEFF/, ''))
  const headerIndex = table.findIndex((row) => row[0] === 'Location_ID')
  if (headerIndex < 0) {
    console.error('没找到 Location_ID 表头，确认一下是不是和风官方的 China-City-List-latest.csv')
    process.exit(1)
  }
  const header = table[headerIndex]
  const col = (name) => header.indexOf(name)
  const rows = table
    .slice(headerIndex + 1)
    .filter((row) => row[col('Adm1_Name_ZH')] === TAIWAN_ADM1)
    .map((row) => ({
      id: row[col('Location_ID')],
      name: fixName(row[col('Location_Name_ZH')]),
      adm2: fixName(row[col('Adm2_Name_ZH')]),
    }))
    .filter((row) => row.id && row.name && row.adm2)

  if (!rows.length) {
    console.error(`官方列表里没有「${TAIWAN_ADM1}」的数据，先确认 CSV 版本`)
    process.exit(1)
  }

  const { text: block, cityNodes } = buildTaiwanBlock(rows)

  const targetPath = path.resolve(__dirname, '..', 'src', 'data', 'CityList.js')
  const source = fs.readFileSync(targetPath, 'utf8').replace(/\r\n/g, '\n')
  const start = source.indexOf(`    {\n        "value": "${PROVINCE_VALUE}",`)
  const end = source.indexOf(`    {\n        "value": "${nextProvinceValue}",`)
  if (start < 0 || end < 0 || end < start) {
    console.error('没有在 CityList.js 里定位到台湾省 / 香港特别行政区两个节点，已中止（文件不会改动）')
    process.exit(1)
  }

  fs.writeFileSync(targetPath, source.slice(0, start) + block + source.slice(end), 'utf8')

  const districtCount = cityNodes.reduce((total, city) => total + city.districts.length, 0)
  console.log(`已更新 ${targetPath}`)
  console.log(`台湾省：${cityNodes.length} 个市/县，${districtCount} 个区/县/乡镇（共 ${rows.length} 条官方数据）`)
  console.log(`市级节点：${cityNodes.map((city) => `${city.label}(${city.id})`).join('、')}`)
}

main()
