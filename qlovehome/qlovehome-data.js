/* QLovehome · 默认模板数据层
 * 首次打开时的示例户型：6 个房间（客厅 / 厨房 / 过道 / 主卧 / 卫生间 / 次卧）铺满画布，
 * 每房一盏灯做示范。
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
   "lx": 180,
   "ly": 180,
   "mk": "both",
   "pts": "8,8 352,8 352,352 8,352"
  },
  {
   "id": "kitchen",
   "name": "厨房",
   "lx": 484,
   "ly": 180,
   "mk": "both",
   "pts": "356,8 612,8 612,352 356,352"
  },
  {
   "id": "hall",
   "name": "过道",
   "lx": 310,
   "ly": 400,
   "mk": "both",
   "pts": "8,356 612,356 612,444 8,444"
  },
  {
   "id": "master",
   "name": "主卧",
   "lx": 154,
   "ly": 520,
   "mk": "both",
   "pts": "8,448 300,448 300,684 8,684"
  },
  {
   "id": "masterwc",
   "name": "卫生间",
   "lx": 372,
   "ly": 520,
   "mk": "both",
   "pts": "304,448 440,448 440,684 304,684"
  },
  {
   "id": "secondary",
   "name": "次卧",
   "lx": 528,
   "ly": 520,
   "mk": "both",
   "pts": "444,448 612,448 612,684 444,684"
  }
 ],
 "devices": [
  {
   "id": "d1",
   "room": "living",
   "name": "客厅灯",
   "kind": "light",
   "entity": "light.demo_living",
   "x": 180,
   "y": 240
  },
  {
   "id": "d2",
   "room": "kitchen",
   "name": "厨房灯",
   "kind": "light",
   "entity": "light.demo_kitchen",
   "x": 484,
   "y": 240
  },
  {
   "id": "d3",
   "room": "hall",
   "name": "过道灯",
   "kind": "light",
   "entity": "light.demo_hall",
   "x": 110,
   "y": 400
  },
  {
   "id": "d4",
   "room": "master",
   "name": "主卧灯",
   "kind": "light",
   "entity": "light.demo_master",
   "x": 154,
   "y": 600
  },
  {
   "id": "d5",
   "room": "masterwc",
   "name": "卫生间灯",
   "kind": "light",
   "entity": "light.demo_bath",
   "x": 372,
   "y": 600
  },
  {
   "id": "d6",
   "room": "secondary",
   "name": "次卧灯",
   "kind": "light",
   "entity": "light.demo_secondary",
   "x": 528,
   "y": 600
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
