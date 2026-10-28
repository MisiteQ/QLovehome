/* QLovehome · 默认模板数据层
 * 首次打开时的示例户型：4 个房间铺满画布 + 每房一盏灯做示范。
 * 房间 / 设备都可以在可视化编辑器里改，也可以「从 HA 批量导入」换成自己的设备。
 * 保存后以 HA 服务器上的 qlh/qlh-config.json 为准，这里只是首次启动的默认值。
 */
window.LH = {
 "config": {
  "live": true,
  "refreshMs": 2000,
  "weather": {},
  "overview": {
   "people": [],
   "power": {}
  },
  "cameras": [],
  "gates": []
 },
 "plan": {
  "w": 620,
  "h": 692,
  "wall": "",
  "walls": "",
  "wallW": 10,
  "outline": "6,6 614,6 614,686 6,686",
  "solids": []
 },
 "rooms": [
  {
   "id": "living",
   "name": "客厅",
   "lx": 159,
   "ly": 177,
   "mk": "both",
   "pts": "8,8 310,8 310,346 8,346"
  },
  {
   "id": "kitchen",
   "name": "厨房",
   "lx": 463,
   "ly": 177,
   "mk": "both",
   "pts": "314,8 612,8 612,346 314,346"
  },
  {
   "id": "master",
   "name": "主卧",
   "lx": 159,
   "ly": 517,
   "mk": "both",
   "pts": "8,350 310,350 310,684 8,684"
  },
  {
   "id": "secondary",
   "name": "次卧",
   "lx": 463,
   "ly": 517,
   "mk": "both",
   "pts": "314,350 612,350 612,684 314,684"
  }
 ],
 "devices": [
  {
   "id": "d1",
   "room": "living",
   "name": "客厅灯",
   "kind": "light",
   "entity": "light.demo_living",
   "x": 159,
   "y": 240
  },
  {
   "id": "d2",
   "room": "kitchen",
   "name": "厨房灯",
   "kind": "light",
   "entity": "light.demo_kitchen",
   "x": 463,
   "y": 240
  },
  {
   "id": "d3",
   "room": "master",
   "name": "主卧灯",
   "kind": "light",
   "entity": "light.demo_master",
   "x": 159,
   "y": 580
  },
  {
   "id": "d4",
   "room": "secondary",
   "name": "次卧灯",
   "kind": "light",
   "entity": "light.demo_secondary",
   "x": 463,
   "y": 580
  }
 ],
 "missing": [],
 "readouts": [],
 "scenes": [],
 "filters": [
  {
   "id": "all",
   "name": "全部",
   "icon": "i-all"
  },
  {
   "id": "light",
   "name": "灯光",
   "icon": "i-bulb"
  },
  {
   "id": "ac",
   "name": "空调",
   "icon": "i-snow"
  },
  {
   "id": "heat",
   "name": "采暖",
   "icon": "i-heat"
  },
  {
   "id": "fresh",
   "name": "净化",
   "icon": "i-wind"
  },
  {
   "id": "other",
   "name": "其它",
   "icon": "i-plug"
  }
 ],
 "supplies": {
  "battery": [],
  "consume": []
 },
 "appliances": []
};
