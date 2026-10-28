/* LoveHome 数据层 · 由 .workbuddy/gen_lovehome_data.py 生成，勿手改
 * 实体均来自 HA 现有设备（按区域归属整理）；状态由 lovehome.js 同源读取 hass。
 */
window.LH = {
 "config": {
  "live": true,
  "refreshMs": 2000,
  "weather": {
   "entity": "weather.forecast_home",
   "temp": "sensor.living_temperature",
   "hum": "sensor.living_humidity",
   "kwh": "sensor.state_grid_your_state_grid_account_daily_ele_num"
  },
  "overview": {
   "netDown": "sensor.router_download_speed",
   "netUp": "sensor.router_upload_speed",
   "people": [
    {
     "name": "家人一",
     "entity": "binary_sensor.family_member_1",
     "note": "两台设备任一在线即算在家",
     "probes": [
      {
       "n": "手机A（填你的IP）",
       "e": "binary_sensor.family_phone_a"
      },
      {
       "n": "手机B（填你的IP）",
       "e": "binary_sensor.family_phone_b"
      }
     ]
    },
    {
     "name": "家人二",
     "entity": "binary_sensor.family_member_2",
     "probes": [
      {
       "n": "手机C（填你的IP）",
       "e": "binary_sensor.family_phone_c"
      }
     ]
    },
    {
     "name": "家人三",
     "entity": "binary_sensor.family_member_3",
     "probes": [
      {
       "n": "手机D（填你的IP）",
       "e": "binary_sensor.family_phone_d"
      }
     ],
     "watch": {
      "label": "儿童手表",
      "tracker": "device_tracker.your_watch_device_id",
      "charge": "sensor.your_watch_device_id_charging_state_p_5_2",
      "place": "sensor.your_watch_device_id_current_address_p_2_6",
      "home": "你的小区名"
     }
    }
   ],
   "power": {
    "kwhDay": "sensor.state_grid_your_state_grid_account_daily_ele_num",
    "kwhMonth": "sensor.state_grid_your_state_grid_account_month_ele_num",
    "billMonth": "sensor.state_grid_your_state_grid_account_esti_amt",
    "balance": "sensor.state_grid_your_state_grid_account_balance",
    "kwhYear": "sensor.state_grid_your_state_grid_account_year_ele_num",
    "costYear": "sensor.state_grid_your_state_grid_account_year_ele_cost",
    "kwhLastMonth": "sensor.state_grid_your_state_grid_account_last_month_ele_num",
    "costLastMonth": "sensor.state_grid_your_state_grid_account_last_month_ele_cost",
    "dayDate": "sensor.state_grid_your_state_grid_account_daily_lasted_date",
    "refresh": "sensor.state_grid_your_state_grid_account_refresh_time",
    "pDay": "sensor.state_grid_your_state_grid_account_daily_p_ele_num",
    "vDay": "sensor.state_grid_your_state_grid_account_daily_v_ele_num",
    "pMonth": "sensor.state_grid_your_state_grid_account_month_p_ele_num",
    "vMonth": "sensor.state_grid_your_state_grid_account_month_v_ele_num",
    "graph30": "sensor.state_grid_your_state_grid_account_recent_30_daily_ele_list",
    "graph12": "sensor.state_grid_your_state_grid_account_recent_12_monthly_ele_list"
   }
  },
  "cameras": [
   {
    "name": "客厅云台机",
    "entity": "camera.living_ptz_control"
   },
   {
    "name": "厨房相机",
    "entity": "camera.kitchen_cam_control"
   },
   {
    "name": "可视门铃",
    "entity": "camera.doorbell_control"
   }
  ],
  "gates": [
   {
    "name": "路由器",
    "entity": "switch.router_wan"
   },
   {
    "name": "中枢网关",
    "entity": "switch.hub_online"
   },
   {
    "name": "多模网关",
    "entity": "switch.gateway_online"
   },
   {
    "name": "智能门锁",
    "entity": "sensor.smart_lock_door_state"
   },
   {
    "name": "可视门铃",
    "entity": "sensor.doorbell_status"
   }
  ]
 },
 "plan": {
  "w": 620,
  "h": 692,
  "wall": "M438.4 365.3 L433.2 365.3 L432.0 366.5 L432.0 570.0 L391.7 570.6 L391.1 584.5 L450.7 584.5 L450.7 571.2 L439.0 570.0Z M17.5 303.1 L17.5 638.9 L30.9 638.9 L30.4 477.6 L31.5 477.0 L31.5 404.6 L77.1 402.8 L77.1 396.1 L53.1 395.5 L50.2 394.3 L31.5 395.5 L30.4 394.3 L30.9 303.1Z M64.8 265.1 L64.8 317.0 L150.6 317.6 L150.6 394.3 L149.5 395.5 L122.6 395.5 L122.6 402.8 L157.6 402.8 L157.6 317.6 L161.7 317.0 L161.7 303.7 L156.5 301.9 L78.8 303.1 L78.2 265.1Z M209.0 256.6 L207.8 257.8 L207.3 303.7 L207.8 597.2 L206.7 617.1 L207.8 617.7 L207.8 623.2 L175.1 625.0 L175.1 638.9 L258.0 638.9 L259.2 640.1 L259.2 673.3 L272.6 673.9 L271.5 625.0 L221.3 624.4 L221.3 585.7 L223.0 584.5 L270.3 584.5 L270.3 571.2 L223.6 570.0 L221.8 568.8 L221.8 257.2Z M502.1 251.8 L501.5 283.2 L529.5 283.2 L529.5 302.5 L471.7 301.9 L471.1 300.7 L466.5 300.7 L465.9 301.9 L434.9 301.9 L432.0 303.7 L432.0 317.6 L433.2 318.8 L438.4 318.8 L440.2 317.0 L528.9 317.6 L529.5 407.0 L585.0 406.4 L588.5 407.6 L588.5 426.3 L589.6 427.5 L589.6 536.2 L588.5 559.2 L589.6 559.8 L589.6 570.0 L546.4 570.6 L545.9 584.5 L547.0 585.7 L588.5 584.5 L589.6 585.7 L589.6 624.4 L547.0 623.8 L545.3 625.6 L545.3 658.8 L544.1 660.0 L535.3 660.0 L535.3 673.9 L558.1 673.9 L558.1 640.1 L559.3 638.9 L602.5 638.9 L602.5 392.5 L543.5 391.3 L543.5 269.3 L516.1 268.7 L515.5 252.4Z M475.8 18.1 L477.0 61.0 L502.1 61.6 L502.1 196.9 L467.6 197.5 L467.6 204.7 L514.9 205.3 L515.5 18.7Z M340.4 18.1 L340.4 32.0 L378.9 32.6 L378.3 196.2 L267.4 197.5 L267.4 204.1 L421.5 204.7 L422.1 197.5 L385.9 196.9 L386.5 33.2 L413.3 32.0 L413.3 18.1Z M261.5 18.1 L183.9 18.1 L183.9 32.0 L210.2 32.0 L211.3 33.2 L211.3 204.7 L221.3 204.7 L221.8 198.1 L218.3 196.9 L218.3 32.6 L261.5 32.0Z M65.4 18.1 L64.8 230.7 L78.2 230.7 L78.8 179.9 L149.5 179.9 L150.6 181.2 L150.6 254.8 L156.5 255.4 L157.6 254.2 L157.6 205.3 L165.2 204.7 L165.2 197.5 L157.6 196.9 L157.6 173.3 L78.8 171.5 L79.4 144.9 L108.6 144.9 L108.6 141.3 L79.4 140.7 L79.4 32.6 L105.1 32.0 L105.1 18.1Z",
  "walls": "52.8,24.4 52.8,187.4 150.3,187.4 150.3,203.6 220.7,203.6 220.7,24.4|207.7,24.4 207.7,203.6 389.1,203.6 389.1,24.4|376.1,24.4 376.1,203.3 512.7,203.3 512.7,24.4|52.8,174.4 52.8,315.9 162.3,315.9 162.3,174.4|2.6,302.9 2.6,406.5 162.3,406.5 162.3,302.9|220.7,315.2 149.3,315.2 149.3,393.5 2.6,393.5 2.6,671.8 187.2,671.8 187.2,638 220.7,638|149.3,190.5 149.3,328.2 207.7,328.2 207.7,587.8 442.4,587.8 442.4,328.2 531.2,328.2 531.2,190.5|539,315.2 429.4,315.2 429.4,587.8 600.8,587.8 600.8,396.1 539,396.1|207.7,574.8 207.7,638 261.7,638 261.7,671.8 556.3,671.8 556.3,638 600.8,638 600.8,574.8",
  "wallW": 13.0,
  "outline": "-8.4,291.9 41.8,291.9 41.8,13.4 523.7,13.4 523.7,179.5 542.2,179.5 542.2,304.2 550,304.2 550,385.1 611.8,385.1 611.8,649 567.3,649 567.3,682.8 250.7,682.8 250.7,649 198.2,649 198.2,682.8 -8.4,682.8",
  "solids": [],
  "photo": {
   "src": "assets/plan-real.png?v=242",
   "x": 4.62,
   "y": 24.32,
   "w": 592.49,
   "h": 644.32,
   "outline": "47.4,24.3 532.9,24.3 532.9,283.8 543.4,284.9 543.4,361.6 596.5,362.7 596.5,636.2 558.4,636.2 556.1,667.6 246.2,667.6 245.1,637.3 171.1,637.3 169.9,655.7 4.6,655.7 4.6,292.4 47.4,291.4"
  }
 },
 "rooms": [
  {
   "id": "living",
   "name": "客餐厅",
   "lx": 203.3,
   "ly": 220.5,
   "mk": "both",
   "pts": "162.3,203.5 162.3,315.2 220.7,315.2 220.7,574.8 429.4,574.8 429.4,315.2 518.2,315.2 518.2,203.5",
   "temp": "sensor.living_temperature",
   "hum": "sensor.living_humidity"
  },
  {
   "id": "kitchen",
   "name": "厨房",
   "lx": 454.1,
   "ly": 165.4,
   "mk": "temp",
   "pts": "389.1,37.4 389.1,190.3 499.7,190.3 499.7,37.4",
   "temp": "sensor.kitchen_temperature",
   "hum": "sensor.kitchen_humidity"
  },
  {
   "id": "master",
   "name": "主卧",
   "lx": 23.6,
   "ly": 633.2,
   "mk": "both",
   "pts": "207.7,328.2 162.3,328.2 162.3,406.5 15.6,406.5 15.6,658.8 174.2,658.8 174.2,625 207.7,625",
   "temp": "sensor.master_temperature",
   "hum": "sensor.master_humidity"
  },
  {
   "id": "secondary",
   "name": "次卧",
   "lx": 450.4,
   "ly": 549.2,
   "mk": "temp",
   "pts": "526,328.2 442.4,328.2 442.4,574.8 587.8,574.8 587.8,409.1 526,409.1",
   "temp": "sensor.secondary_temperature",
   "hum": "sensor.secondary_humidity"
  },
  {
   "id": "study",
   "name": "书房",
   "lx": 258.7,
   "ly": 54.4,
   "mk": "temp",
   "pts": "220.7,37.4 220.7,190.6 376.1,190.6 376.1,37.4",
   "temp": "sensor.study_temperature",
   "hum": "sensor.study_humidity"
  },
  {
   "id": "balcony",
   "name": "阳台",
   "lx": 333.7,
   "ly": 604.8,
   "mk": "both",
   "pts": "220.7,587.8 220.7,625 274.7,625 274.7,658.8 543.3,658.8 543.3,625 587.8,625 587.8,587.8",
   "temp": "sensor.balcony_temperature",
   "hum": "sensor.balcony_humidity"
  },
  {
   "id": "closet",
   "name": "衣帽间",
   "lx": 73.8,
   "ly": 150.4,
   "mk": "temp",
   "pts": "65.8,37.4 65.8,174.4 163.3,174.4 163.3,190.6 207.7,190.6 207.7,37.4",
   "temp": "sensor.closet_temperature",
   "hum": "sensor.closet_humidity"
  },
  {
   "id": "guestwc",
   "name": "客卫",
   "lx": 73.8,
   "ly": 204.4,
   "mk": "temp",
   "pts": "65.8,187.4 65.8,302.9 149.3,302.9 149.3,187.4",
   "temp": "sensor.living_temperature",
   "hum": "sensor.living_humidity",
   "mirror": "living"
  },
  {
   "id": "masterwc",
   "name": "主卫",
   "lx": 23.6,
   "ly": 332.9,
   "mk": "temp",
   "pts": "15.6,315.9 15.6,393.5 149.3,393.5 149.3,315.9",
   "temp": "sensor.master_temperature",
   "hum": "sensor.master_humidity",
   "mirror": "master"
  }
 ],
 "devices": [
  {
   "id": "d1",
   "room": "living",
   "name": "客厅大灯",
   "kind": "light",
   "entity": "switch.living_main_light",
   "x": 320.8,
   "y": 466.8
  },
  {
   "id": "d2",
   "room": "living",
   "name": "餐厅灯",
   "kind": "light",
   "entity": "switch.dining_light",
   "x": 320.8,
   "y": 371.0
  },
  {
   "id": "d3",
   "room": "living",
   "name": "沙发氛围射灯",
   "kind": "light",
   "entity": "switch.sofa_ambient_light",
   "x": 411.4,
   "y": 415.5,
   "ctl": {
    "always": false,
    "sub": "三路一体 · 本路 / 同机其它 / 指示灯",
    "open": "设置",
    "echo": [
     {
      "e": "switch.triple_lamp_on_p_3_1",
      "map": {
       "on": "亮着",
       "off": "关着"
      }
     },
     {
      "e": "select.triple_lamp_mode_p_3_2"
     }
    ],
    "groups": [
     {
      "t": "本路 · 沙发射灯",
      "items": [
       {
        "k": "lamp",
        "label": "沙发射灯",
        "e": "switch.triple_lamp_on_p_3_1",
        "mode": "select.triple_lamp_mode_p_3_2"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.triple_lamp_toggle_a_3_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "同机其它两路",
      "hint": "同一台三键面板的另外两路，各自能切「有线开关 / 无线开关」",
      "items": [
       {
        "k": "lamp",
        "label": "餐边柜射灯",
        "e": "switch.triple_lamp_on_p_2_1",
        "mode": "select.triple_lamp_mode_p_2_2"
       },
       {
        "k": "lamp",
        "label": "氛围灯带",
        "e": "switch.triple_lamp_on_p_4_1",
        "mode": "select.triple_lamp_mode_p_4_2"
       }
      ]
     },
     {
      "t": "整机",
      "items": [
       {
        "k": "sw",
        "label": "指示灯",
        "e": "light.triple_lamp_s_10_indicator_light"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "面板实体键被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "左键",
        "e": "event.triple_lamp_click_e_5_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "中键",
        "e": "event.triple_lamp_click_e_6_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "右键",
        "e": "event.triple_lamp_click_e_7_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d4",
   "room": "living",
   "name": "氛围灯带",
   "kind": "light",
   "entity": "switch.light_strip",
   "x": 411.4,
   "y": 495.0,
   "ctl": {
    "always": false,
    "sub": "三路一体 · 本路 / 同机其它 / 指示灯",
    "open": "设置",
    "echo": [
     {
      "e": "switch.triple_lamp_on_p_4_1",
      "map": {
       "on": "亮着",
       "off": "关着"
      }
     },
     {
      "e": "select.triple_lamp_mode_p_4_2"
     }
    ],
    "groups": [
     {
      "t": "本路 · 氛围灯带",
      "items": [
       {
        "k": "lamp",
        "label": "氛围灯带",
        "e": "switch.triple_lamp_on_p_4_1",
        "mode": "select.triple_lamp_mode_p_4_2"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.triple_lamp_toggle_a_4_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "同机其它两路",
      "hint": "同一台三键面板的另外两路，各自能切「有线开关 / 无线开关」",
      "items": [
       {
        "k": "lamp",
        "label": "餐边柜射灯",
        "e": "switch.triple_lamp_on_p_2_1",
        "mode": "select.triple_lamp_mode_p_2_2"
       },
       {
        "k": "lamp",
        "label": "沙发射灯",
        "e": "switch.triple_lamp_on_p_3_1",
        "mode": "select.triple_lamp_mode_p_3_2"
       }
      ]
     },
     {
      "t": "整机",
      "items": [
       {
        "k": "sw",
        "label": "指示灯",
        "e": "light.triple_lamp_s_10_indicator_light"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "面板实体键被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "左键",
        "e": "event.triple_lamp_click_e_5_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "中键",
        "e": "event.triple_lamp_click_e_6_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "右键",
        "e": "event.triple_lamp_click_e_7_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d5",
   "room": "living",
   "name": "客厅空调",
   "kind": "ac",
   "entity": "climate.living_ac_climate",
   "x": 320.8,
   "y": 245.0
  },
  {
   "id": "d6",
   "room": "living",
   "name": "客厅云台机",
   "kind": "cam",
   "entity": "camera.living_ptz_control",
   "x": 253.5,
   "y": 295.15000000000003
  },
  {
   "id": "d7",
   "room": "living",
   "name": "智能门锁",
   "kind": "lock",
   "entity": "sensor.smart_lock_door_state",
   "x": 501.2,
   "y": 245.0,
   "ctl": {
    "always": true,
    "sub": "门状态 · 开锁记录 · 告警",
    "open": "设置",
    "echo": [
     {
      "e": "sensor.smart_lock_door_state_p_4_1021",
      "map": {
       "Locked": "已上锁",
       "Unlocked": "已开锁",
       "已开锁": "已开锁",
       "门虚掩": "门虚掩",
       "门虚掩解除": "虚掩已解除",
       "Jammed": "卡住"
      }
     },
     {
      "e": "sensor.smart_lock_battery_level_p_5_1003",
      "pre": "电量 ",
      "unit": "%"
     }
    ],
    "groups": [
     {
      "t": "门状态",
      "items": [
       {
        "k": "ro",
        "label": "锁体",
        "e": "sensor.smart_lock_door_state_p_4_1021",
        "map": {
         "Locked": "已上锁",
         "Unlocked": "已开锁",
         "已开锁": "已开锁",
         "门虚掩": "门虚掩",
         "门虚掩解除": "虚掩已解除",
         "Jammed": "卡住"
        }
       },
       {
        "k": "ro",
        "label": "电量",
        "e": "sensor.smart_lock_battery_level_p_5_1003",
        "unit": "%"
       },
       {
        "k": "ro",
        "label": "布防",
        "e": "binary_sensor.smart_lock_armed",
        "map": {
         "on": "已布防",
         "off": "未布防"
        }
       }
      ]
     },
     {
      "t": "最后一次操作",
      "hint": "来自 Xiaomi Miot 云端上报，可能滞后于锁体当前状态",
      "items": [
       {
        "k": "ro",
        "label": "开锁方式",
        "e": "sensor.smart_lock_connection_action",
        "map": {
         "outside_unlock": "室外开锁",
         "inside_unlock": "室内开锁",
         "outside_lock": "室外上锁",
         "inside_lock": "室内上锁",
         "lock": "上锁",
         "unlock": "开锁",
         "": "—"
        }
       },
       {
        "k": "ro",
        "label": "连接方式",
        "e": "sensor.smart_lock_connection",
        "map": {
         "bluetooth": "蓝牙",
         "password": "密码",
         "fingerprint": "指纹",
         "nfc": "NFC 卡",
         "key": "钥匙",
         "temporary_password": "临时密码"
        }
       },
       {
        "k": "ro",
        "label": "钥匙 ID",
        "e": "sensor.smart_lock_connection_key_id"
       }
      ]
     },
     {
      "t": "事件记录",
      "items": [
       {
        "k": "ro",
        "label": "锁事件",
        "e": "event.smart_lock_lock_event_e_3_1020",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "发生异常",
        "e": "event.smart_lock_exception_occurred_e_3_1007",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "门铃响了",
        "e": "event.smart_lock_doorbell_ring_e_6_1006",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "低电量告警",
        "e": "event.smart_lock_low_battery_e_5_1001",
        "fmt": "ago"
       }
      ]
     }
    ],
    "on": {
     "e": "sensor.smart_lock_door_state_p_4_1021",
     "not_vals": [
      "Locked",
      "unavailable",
      "unknown"
     ]
    }
   },
   "_fx": 501.2,
   "_fy": 245.0
  },
  {
   "id": "d8",
   "room": "living",
   "name": "进门射灯",
   "kind": "light",
   "entity": "switch.entrance_spot_light",
   "x": 452.2,
   "y": 245.0,
   "ctl": {
    "always": false,
    "sub": "方式 · 指示灯 · 无线按键",
    "open": "设置",
    "echo": [
     {
      "e": "switch.entrance_spot_lamp_on_p_2_1",
      "map": {
       "on": "亮着",
       "off": "关着"
      }
     },
     {
      "e": "select.entrance_spot_lamp_mode_p_2_2"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "灯光",
        "e": "switch.entrance_spot_lamp_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "工作方式",
        "e": "select.entrance_spot_lamp_mode_p_2_2"
       }
      ]
     },
     {
      "t": "面板",
      "hint": "「有线和无线开关」＝墙上按键和 HA 都能控制；「无线模式」＝按键只发信号，不再直接驱动这一路",
      "items": [
       {
        "k": "sw",
        "label": "指示灯",
        "e": "light.entrance_spot_lamp_s_10_indicator_light"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "墙上按键被按下时上报（只读，可做自动化触发）",
      "items": [
       {
        "k": "ro",
        "label": "单击",
        "e": "event.entrance_spot_lamp_click_e_8_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d9",
   "room": "living",
   "name": "迎门画射灯",
   "kind": "light",
   "entity": "switch.painting_spot_light",
   "x": 186.2,
   "y": 245.0,
   "ctl": {
    "always": false,
    "sub": "方式 · 指示灯 · 无线按键",
    "open": "设置",
    "echo": [
     {
      "e": "switch.painting_spot_lamp_on_p_2_1",
      "map": {
       "on": "亮着",
       "off": "关着"
      }
     },
     {
      "e": "select.painting_spot_lamp_mode_p_2_2"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "灯光",
        "e": "switch.painting_spot_lamp_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "工作方式",
        "e": "select.painting_spot_lamp_mode_p_2_2"
       }
      ]
     },
     {
      "t": "面板",
      "hint": "「有线和无线开关」＝墙上按键和 HA 都能控制；「无线模式」＝按键只发信号，不再直接驱动这一路",
      "items": [
       {
        "k": "sw",
        "label": "指示灯",
        "e": "light.painting_spot_lamp_s_10_indicator_light"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "墙上按键被按下时上报（只读，可做自动化触发）",
      "items": [
       {
        "k": "ro",
        "label": "单击",
        "e": "event.painting_spot_lamp_click_e_8_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   },
   "_fx": 186.2,
   "_fy": 245.0
  },
  {
   "id": "d10",
   "room": "living",
   "name": "餐边柜射灯",
   "kind": "light",
   "entity": "switch.sideboard_spot_light",
   "x": 253.5,
   "y": 433.3,
   "ctl": {
    "always": false,
    "sub": "三路一体 · 本路 / 同机其它 / 指示灯",
    "open": "设置",
    "echo": [
     {
      "e": "switch.triple_lamp_on_p_2_1",
      "map": {
       "on": "亮着",
       "off": "关着"
      }
     },
     {
      "e": "select.triple_lamp_mode_p_2_2"
     }
    ],
    "groups": [
     {
      "t": "本路 · 餐边柜射灯",
      "items": [
       {
        "k": "lamp",
        "label": "餐边柜射灯",
        "e": "switch.triple_lamp_on_p_2_1",
        "mode": "select.triple_lamp_mode_p_2_2"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.triple_lamp_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "同机其它两路",
      "hint": "同一台三键面板的另外两路，各自能切「有线开关 / 无线开关」",
      "items": [
       {
        "k": "lamp",
        "label": "沙发射灯",
        "e": "switch.triple_lamp_on_p_3_1",
        "mode": "select.triple_lamp_mode_p_3_2"
       },
       {
        "k": "lamp",
        "label": "氛围灯带",
        "e": "switch.triple_lamp_on_p_4_1",
        "mode": "select.triple_lamp_mode_p_4_2"
       }
      ]
     },
     {
      "t": "整机",
      "items": [
       {
        "k": "sw",
        "label": "指示灯",
        "e": "light.triple_lamp_s_10_indicator_light"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "面板实体键被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "左键",
        "e": "event.triple_lamp_click_e_5_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "中键",
        "e": "event.triple_lamp_click_e_6_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "右键",
        "e": "event.triple_lamp_click_e_7_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d11",
   "room": "living",
   "name": "网络降温风扇",
   "kind": "fan",
   "entity": "switch.network_fan",
   "x": 253.5,
   "y": 501.1,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 定时",
    "open": "设置",
    "echo": [
     {
      "e": "switch.network_fan_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     },
     {
      "e": "select.network_fan_mode_p_2_4"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.network_fan_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "开关模式",
        "e": "select.network_fan_mode_p_2_4"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.network_fan_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.network_fan_default_power_on_state_p_2_5"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d12",
   "room": "living",
   "name": "弱电箱风扇",
   "kind": "fan",
   "entity": "switch.weak_box_fan",
   "x": 253.5,
   "y": 467.2,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 定时",
    "open": "设置",
    "echo": [
     {
      "e": "switch.weak_box_fan_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     },
     {
      "e": "select.weak_box_fan_mode_p_2_4"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.weak_box_fan_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "开关模式",
        "e": "select.weak_box_fan_mode_p_2_4"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.weak_box_fan_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.weak_box_fan_default_power_on_state_p_2_5"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d13",
   "room": "living",
   "name": "服务器降温风扇",
   "kind": "fan",
   "entity": "switch.server_fan",
   "x": 253.5,
   "y": 535.0,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 定时",
    "open": "设置",
    "echo": [
     {
      "e": "switch.server_fan_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     },
     {
      "e": "select.server_fan_mode_p_2_4"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.server_fan_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "开关模式",
        "e": "select.server_fan_mode_p_2_4"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.server_fan_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.server_fan_default_power_on_state_p_2_5"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d14",
   "room": "living",
   "name": "客厅插排",
   "kind": "plug",
   "entity": "switch.living_power_strip",
   "x": 253.5,
   "y": 328.15
  },
  {
   "id": "d15",
   "room": "living",
   "name": "中控面板",
   "kind": "panel",
   "entity": "switch.smart_panel_mute",
   "x": 411.4,
   "y": 371.0,
   "ctl": {
    "always": true,
    "sub": "屏幕 · 音箱 · 三路按键",
    "open": "设置",
    "echo": [
     {
      "e": "select.smart_panel_display_state_p_16_2"
     },
     {
      "e": "number.smart_panel_volume_p_2_1",
      "pre": "音量 ",
      "unit": "%"
     }
    ],
    "groups": [
     {
      "t": "屏幕",
      "items": [
       {
        "k": "seg",
        "label": "屏幕状态",
        "e": "select.smart_panel_display_state_p_16_2"
       },
       {
        "k": "num",
        "label": "亮度",
        "e": "number.smart_panel_brightness_p_16_1",
        "unit": "%"
       },
       {
        "k": "sw",
        "label": "自动息屏",
        "e": "switch.smart_panel_auto_screen_off_p_16_3"
       },
       {
        "k": "sw",
        "label": "自动亮度",
        "e": "switch.smart_panel_auto_screen_brightness_p_16_4"
       }
      ]
     },
     {
      "t": "音箱",
      "items": [
       {
        "k": "num",
        "label": "音量",
        "e": "number.smart_panel_volume_p_2_1",
        "unit": "%"
       },
       {
        "k": "sw",
        "label": "麦克风禁麦",
        "e": "switch.smart_panel_mute_p_4_1"
       },
       {
        "k": "sw",
        "label": "睡眠模式",
        "e": "switch.smart_panel_sleep_mode_p_5_3"
       },
       {
        "k": "say",
        "label": "朗读文本",
        "e": "notify.smart_panel_play_text_a_5_3"
       },
       {
        "k": "btn",
        "label": "唤醒小爱",
        "e": "button.smart_panel_wake_up_a_5_1",
        "text": "唤醒"
       },
       {
        "k": "btn",
        "label": "停止闹钟",
        "e": "button.smart_panel_stop_alarm_a_6_1",
        "text": "停止"
       }
      ]
     },
     {
      "t": "面板三键",
      "hint": "三路继电器当前都是「无线开关」模式：只改面板状态、不驱动回路。",
      "items": [
       {
        "k": "lamp",
        "label": "客厅大灯",
        "e": "switch.smart_panel_on_p_10_1",
        "mode": "select.smart_panel_mode_p_10_2"
       },
       {
        "k": "lamp",
        "label": "沙发射灯",
        "e": "switch.smart_panel_on_p_11_1",
        "mode": "select.smart_panel_mode_p_11_2"
       },
       {
        "k": "lamp",
        "label": "氛围灯带",
        "e": "switch.smart_panel_on_p_12_1",
        "mode": "select.smart_panel_mode_p_12_2"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "面板实体键被按下时上报（只读，可做自动化触发）",
      "items": [
       {
        "k": "ro",
        "label": "左键",
        "e": "event.smart_panel_click_e_13_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "中键",
        "e": "event.smart_panel_click_e_14_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "右键",
        "e": "event.smart_panel_click_e_15_1",
        "fmt": "ago"
       }
      ]
     }
    ],
    "on": {
     "e": "select.smart_panel_display_state_p_16_2",
     "vals": [
      "亮屏"
     ]
    }
   },
   "_fx": 411.4,
   "_fy": 371.0
  },
  {
   "id": "d16",
   "room": "living",
   "name": "可视门铃",
   "kind": "bell",
   "entity": "sensor.doorbell_status",
   "x": 511.2,
   "y": 275.2,
   "ctl": {
    "always": true,
    "sub": "画面 · 提示音 · 侦测 · 夜视",
    "open": "设置",
    "echo": [
     {
      "e": "sensor.video_doorbell_status_p_2_2",
      "map": {
       "Idle": "待机",
       "Busy": "占用"
      }
     },
     {
      "e": "sensor.video_doorbell_battery_level_p_8_1",
      "pre": "电量 ",
      "unit": "%"
     }
    ],
    "groups": [
     {
      "t": "画面",
      "items": [
       {
        "k": "cam",
        "label": "实时画面",
        "e": "camera.doorbell_control",
        "text": "查看"
       },
       {
        "k": "ro",
        "label": "最近移动",
        "e": "camera.doorbell_control",
        "attr": "motion_video_time"
       },
       {
        "k": "ro",
        "label": "移动类型",
        "e": "camera.doorbell_control",
        "attr": "motion_video_type",
        "map": {
         "Stay": "有人停留",
         "Pass": "有人经过"
        }
       }
      ]
     },
     {
      "t": "提示与省电",
      "items": [
       {
        "k": "sw",
        "label": "提示音",
        "e": "switch.video_doorbell_alarm_p_7_1"
       },
       {
        "k": "sw",
        "label": "ECO 节能",
        "e": "switch.video_doorbell_eco_p_2_6"
       },
       {
        "k": "num",
        "label": "铃声",
        "e": "number.video_doorbell_ringtone_p_2_7",
        "unit": " 号"
       }
      ]
     },
     {
      "t": "移动侦测",
      "items": [
       {
        "k": "sel",
        "label": "触发条件",
        "e": "select.video_doorbell_motion_detection_p_4_1"
       },
       {
        "k": "seg",
        "label": "灵敏度",
        "e": "select.video_doorbell_detection_sensitivity_p_4_3",
        "map": {
         "Low": "低",
         "Middle": "中",
         "High": "高"
        }
       },
       {
        "k": "sel",
        "label": "报警间隔",
        "e": "select.video_doorbell_alarm_interval_p_4_2",
        "map": {
         "0": "不限"
        },
        "suffix": " 秒"
       }
      ]
     },
     {
      "t": "夜视",
      "items": [
       {
        "k": "seg",
        "label": "夜视",
        "e": "select.video_doorbell_night_shot_p_2_3",
        "map": {
         "Off": "关",
         "On": "开",
         "Auto": "自动"
        }
       }
      ]
     }
    ],
    "on": {
     "e": "sensor.video_doorbell_status_p_2_2",
     "not_vals": [
      "关机",
      "待机",
      "空闲",
      "Idle",
      "off",
      "unavailable",
      "unknown",
      "未知",
      "已完成",
      "完成",
      "预约"
     ]
    }
   },
   "_fx": 511.2,
   "_fy": 275.2
  },
  {
   "id": "d17",
   "room": "kitchen",
   "name": "厨房主灯",
   "kind": "light",
   "entity": "switch.kitchen_main_light",
   "x": 439.9,
   "y": 131.6
  },
  {
   "id": "d18",
   "room": "kitchen",
   "name": "厨房水池灯",
   "kind": "light",
   "entity": "switch.kitchen_sink_light",
   "x": 439.9,
   "y": 55.0
  },
  {
   "id": "d19",
   "room": "kitchen",
   "name": "厨房相机",
   "kind": "cam",
   "entity": "camera.kitchen_cam_control",
   "x": 405.0,
   "y": 55.0,
   "fb": [
    "switch.kitchen_cam_status"
   ]
  },
  {
   "id": "d20",
   "room": "kitchen",
   "name": "饮水机",
   "kind": "plug",
   "entity": "sensor.water_dispenser_status",
   "x": 405.0,
   "y": 131.6,
   "ctl": {
    "always": true,
    "sub": "出水 · 水质 · 滤芯 · 维护",
    "open": "设置",
    "echo": [
     {
      "e": "sensor.water_dispenser_status_p_2_3"
     },
     {
      "e": "number.water_dispenser_target_temperature_p_2_6",
      "pre": "设定 ",
      "unit": "°C"
     }
    ],
    "groups": [
     {
      "t": "出水",
      "items": [
       {
        "k": "ro",
        "label": "工作状态",
        "e": "sensor.water_dispenser_status_p_2_3"
       },
       {
        "k": "num",
        "label": "出水温度",
        "e": "number.water_dispenser_target_temperature_p_2_6",
        "unit": "°C"
       },
       {
        "k": "ro",
        "label": "当前水温",
        "e": "sensor.water_dispenser_temperature_p_2_5",
        "unit": "°C"
       }
      ]
     },
     {
      "t": "水质",
      "items": [
       {
        "k": "ro",
        "label": "进水 TDS",
        "e": "sensor.water_dispenser_tds_in_p_3_1",
        "unit": " ppm"
       },
       {
        "k": "ro",
        "label": "出水 TDS",
        "e": "sensor.water_dispenser_tds_out_p_3_2",
        "unit": " ppm"
       }
      ]
     },
     {
      "t": "滤芯",
      "hint": "按出水流量折算寿命，换芯后点重置",
      "items": [
       {
        "k": "ro",
        "label": "剩余寿命",
        "e": "sensor.water_dispenser_filter_life_level_p_5_1",
        "unit": "%"
       },
       {
        "k": "ro",
        "label": "剩余流量",
        "e": "sensor.water_dispenser_filter_left_flow_p_5_5",
        "unit": " L"
       },
       {
        "k": "ro",
        "label": "已用流量",
        "e": "sensor.water_dispenser_filter_used_flow_p_5_4",
        "unit": " L"
       },
       {
        "k": "ro",
        "label": "已用时长",
        "e": "sensor.water_dispenser_filter_used_time_p_5_3",
        "unit": " 小时"
       },
       {
        "k": "btn",
        "label": "重置滤芯",
        "e": "button.water_dispenser_reset_filter_life_a_5_1",
        "text": "重置"
       }
      ]
     },
     {
      "t": "维护 · 安全",
      "items": [
       {
        "k": "sw",
        "label": "UV 杀菌",
        "e": "switch.water_dispenser_uv_p_2_7"
       },
       {
        "k": "sw",
        "label": "童锁",
        "e": "switch.water_dispenser_physical_controls_locked_p_4_1"
       },
       {
        "k": "ro",
        "label": "故障",
        "e": "sensor.water_dispenser_fault_p_2_1"
       }
      ]
     }
    ],
    "on": {
     "e": "sensor.water_dispenser_status_p_2_3",
     "not_vals": [
      "关机",
      "待机",
      "空闲",
      "Idle",
      "off",
      "unavailable",
      "unknown",
      "未知",
      "已完成",
      "完成",
      "预约"
     ]
    }
   }
  },
  {
   "id": "d21",
   "room": "kitchen",
   "name": "燃气热水器",
   "kind": "heater",
   "entity": "water_heater.gas_water_heater_water_heater",
   "x": 405.0,
   "y": 87.31906494808105,
   "ctl": {
    "always": true,
    "sub": "通断 · 目标水温 · 燃烧状态",
    "open": "设置",
    "echo": [
     {
      "e": "water_heater.gas_water_heater_water_heater",
      "map": {
       "unavailable": "离线",
       "off": "已关机",
       "gas": "燃气模式",
       "electric": "电加热",
       "heat_pump": "热泵",
       "high_demand": "大水量",
       "eco": "节能",
       "performance": "高性能",
       "heat": "加热中",
       "unknown": "未知"
      }
     },
     {
      "e": "water_heater.gas_water_heater_water_heater",
      "attr": "temperature",
      "pre": "设定 ",
      "unit": "°C"
     }
    ],
    "groups": [
     {
      "t": "热水器",
      "hint": "这一组走 HA 的 water_heater 域（米家云上报），离线时下面几行会置灰",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "water_heater.gas_water_heater_water_heater"
       },
       {
        "k": "num",
        "label": "目标水温",
        "e": "water_heater.gas_water_heater_water_heater",
        "aval": "temperature",
        "unit": "°C",
        "min": 35,
        "max": 65
       },
       {
        "k": "ro",
        "label": "当前状态",
        "e": "water_heater.gas_water_heater_water_heater",
        "map": {
         "unavailable": "离线",
         "off": "已关机",
         "gas": "燃气模式",
         "electric": "电加热",
         "heat_pump": "热泵",
         "high_demand": "大水量",
         "eco": "节能",
         "performance": "高性能",
         "heat": "加热中",
         "unknown": "未知"
        }
       }
      ]
     },
     {
      "t": "镜像实体",
      "hint": "控制台镜像出来的燃烧 / 水温，不依赖米家云",
      "items": [
       {
        "k": "ro",
        "label": "燃烧",
        "e": "switch.heater_burning",
        "map": {
         "on": "燃烧中",
         "off": "未燃烧",
         "unavailable": "离线"
        }
       },
       {
        "k": "ro",
        "label": "水温",
        "e": "sensor.heater_water_temp",
        "unit": "°C"
       },
       {
        "k": "ro",
        "label": "设定水温",
        "e": "sensor.heater_target_temp",
        "unit": "°C"
       }
      ]
     }
    ],
    "on": {
     "e": "water_heater.gas_water_heater_water_heater",
     "attr": "burning_state",
     "vals": [
      true
     ]
    }
   }
  },
  {
   "id": "d22",
   "room": "kitchen",
   "name": "空气炸锅",
   "kind": "cook",
   "entity": "sensor.air_fryer_status",
   "x": 405.0,
   "y": 171.8,
   "ctl": {
    "always": true,
    "sub": "烹饪 · 温度 · 时间 · 状态",
    "open": "设置",
    "echo": [
     {
      "e": "sensor.air_fryer_status_p_2_1"
     },
     {
      "e": "sensor.air_fryer_left_time_p_2_5",
      "pre": "剩余 ",
      "unit": " 分钟"
     }
    ],
    "groups": [
     {
      "t": "烹饪",
      "hint": "先把温度和时间设好再点开始；暂停只是保温等待，不会结束程序",
      "items": [
       {
        "k": "btn",
        "label": "开始烹饪",
        "e": "button.air_fryer_start_cook_a_2_1",
        "text": "开始"
       },
       {
        "k": "btn",
        "label": "暂停",
        "e": "button.air_fryer_pause_a_2_3",
        "text": "暂停"
       },
       {
        "k": "btn",
        "label": "停止烹饪",
        "e": "button.air_fryer_cancel_cooking_a_2_2",
        "text": "停止"
       }
      ]
     },
     {
      "t": "参数",
      "items": [
       {
        "k": "num",
        "label": "烹饪温度",
        "e": "number.air_fryer_target_temperature_p_2_4",
        "unit": "°C"
       },
       {
        "k": "num",
        "label": "烹饪时间",
        "e": "number.air_fryer_target_time_p_2_3",
        "unit": " 分钟"
       }
      ]
     },
     {
      "t": "状态",
      "items": [
       {
        "k": "ro",
        "label": "工作状态",
        "e": "sensor.air_fryer_status_p_2_1"
       },
       {
        "k": "ro",
        "label": "剩余时间",
        "e": "sensor.air_fryer_left_time_p_2_5",
        "unit": " 分钟"
       },
       {
        "k": "ro",
        "label": "故障",
        "e": "sensor.air_fryer_fault_p_2_2"
       },
       {
        "k": "ro",
        "label": "上次完成",
        "e": "event.air_fryer_cooking_finished_e_2_1",
        "fmt": "ago"
       }
      ]
     }
    ],
    "on": {
     "e": "sensor.air_fryer_status_p_2_1",
     "not_vals": [
      "关机",
      "待机",
      "空闲",
      "Idle",
      "off",
      "unavailable",
      "unknown",
      "未知",
      "已完成",
      "完成",
      "预约"
     ]
    }
   }
  },
  {
   "id": "d23",
   "room": "master",
   "name": "主卧吸顶灯",
   "kind": "light",
   "entity": "switch.master_ceiling_light",
   "x": 118.6,
   "y": 586.3,
   "_fx": 118.6,
   "_fy": 586.3
  },
  {
   "id": "d24",
   "room": "master",
   "name": "主卧迎门灯",
   "kind": "light",
   "entity": "switch.master_hall_light",
   "x": 186.2,
   "y": 347.3,
   "_fx": 186.2,
   "_fy": 347.3
  },
  {
   "id": "d25",
   "room": "master",
   "name": "主卧空调",
   "kind": "ac",
   "entity": "climate.master_ac_climate",
   "x": 186.2,
   "y": 586.3,
   "_fx": 186.2,
   "_fy": 586.3
  },
  {
   "id": "d26",
   "room": "master",
   "name": "主卧氛围灯",
   "kind": "light",
   "entity": "switch.master_ambient_light",
   "x": 118.6,
   "y": 438.3,
   "_fx": 118.6,
   "_fy": 438.3
  },
  {
   "id": "d27",
   "room": "master",
   "name": "烛台",
   "kind": "light",
   "entity": "switch.candle_lamp",
   "x": 52.6,
   "y": 438.3,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 点动",
    "open": "设置",
    "echo": [
     {
      "e": "switch.candle_lamp_on_p_2_1",
      "map": {
       "on": "开着",
       "off": "关着"
      }
     },
     {
      "e": "select.candle_lamp_mode_p_2_2"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.candle_lamp_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "按键模式",
        "e": "select.candle_lamp_mode_p_2_2"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.candle_lamp_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.candle_lamp_default_power_on_state_p_2_3"
       },
       {
        "k": "sw",
        "label": "点动模式默认状态",
        "e": "switch.candle_lamp_on_p_11_1"
       },
       {
        "k": "num",
        "label": "按下持续时长",
        "e": "number.candle_lamp_mode_p_11_2",
        "unit": " 秒"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "外接开关被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "单击",
        "e": "event.candle_lamp_click_e_11_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   },
   "_fx": 52.6,
   "_fy": 438.3
  },
  {
   "id": "d28",
   "room": "master",
   "name": "主卧插座",
   "kind": "plug",
   "entity": "switch.master_outlet",
   "x": 186.2,
   "y": 521.2,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 定时",
    "open": "设置",
    "echo": [
     {
      "e": "switch.bedroom_outlet_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     },
     {
      "e": "select.bedroom_outlet_mode_p_2_4"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.bedroom_outlet_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "开关模式",
        "e": "select.bedroom_outlet_mode_p_2_4"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.bedroom_outlet_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.bedroom_outlet_default_power_on_state_p_2_5"
       }
      ]
     }
    ]
   },
   "_fx": 186.2,
   "_fy": 521.2
  },
  {
   "id": "d29",
   "room": "master",
   "name": "主卧长插排",
   "kind": "plug",
   "entity": "switch.metering_strip_power",
   "x": 85.6,
   "y": 438.3,
   "ctl": {
    "always": false,
    "sub": "通断 · 计量 · 温度",
    "open": "设置",
    "echo": [
     {
      "e": "switch.metering_strip_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     },
     {
      "e": "sensor.metering_strip_electric_power_p_3_2",
      "pre": "功率 ",
      "unit": " W"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.metering_strip_on_p_2_1"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.metering_strip_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "计量",
      "hint": "电压 / 电流米家报的是 mV / mA，这里已经换算成 V / A",
      "items": [
       {
        "k": "ro",
        "label": "实时功率",
        "e": "sensor.metering_strip_electric_power_p_3_2",
        "unit": " W"
       },
       {
        "k": "ro",
        "label": "累计电量",
        "e": "sensor.metering_strip_power_consumption_p_3_1",
        "unit": " kWh"
       },
       {
        "k": "ro",
        "label": "电压",
        "e": "sensor.metering_strip_voltage_p_3_3",
        "src": 1000,
        "unit": " V"
       },
       {
        "k": "ro",
        "label": "电流",
        "e": "sensor.metering_strip_electric_current_p_3_4",
        "src": 1000,
        "unit": " A"
       }
      ]
     },
     {
      "t": "状态",
      "hint": "「开关模式」米家只给 0 / 1，没写含义，改之前先记下原值",
      "items": [
       {
        "k": "num",
        "label": "开关模式",
        "e": "number.metering_strip_mode_p_2_2",
        "min": 0,
        "max": 1
       },
       {
        "k": "ro",
        "label": "插排温度",
        "e": "sensor.metering_strip_temperature_p_2_3",
        "unit": "°C"
       },
       {
        "k": "ro",
        "label": "已工作时间",
        "e": "sensor.metering_strip_working_time_p_2_4",
        "unit": " 分钟"
       }
      ]
     }
    ]
   },
   "_fx": 85.6,
   "_fy": 438.3
  },
  {
   "id": "d30",
   "room": "secondary",
   "name": "次卧吸顶灯",
   "kind": "light",
   "entity": "switch.secondary_ceiling_light",
   "x": 518.0,
   "y": 495.0,
   "_fx": 518.0,
   "_fy": 495.0
  },
  {
   "id": "d31",
   "room": "secondary",
   "name": "次卧迎门灯",
   "kind": "light",
   "entity": "switch.secondary_hall_light",
   "x": 478.0,
   "y": 355.0,
   "_fx": 478.0,
   "_fy": 355.0
  },
  {
   "id": "d32",
   "room": "secondary",
   "name": "空气净化器",
   "kind": "fresh",
   "entity": "switch.air_purifier_power",
   "x": 478.0,
   "y": 455.0,
   "ctl": {
    "always": false,
    "sub": "开关 · 模式 · 滤芯 · 环境",
    "open": "设置",
    "echo": [
     {
      "e": "switch.air_purifier_on_p_2_1",
      "map": {
       "on": "运行中",
       "off": "已关机"
      }
     },
     {
      "e": "select.air_purifier_mode_p_2_4"
     },
     {
      "e": "sensor.air_purifier_pm2_5_density_p_3_4",
      "pre": "PM2.5 "
     }
    ],
    "groups": [
     {
      "t": "运行",
      "items": [
       {
        "k": "sw",
        "label": "开关",
        "e": "switch.air_purifier_on_p_2_1"
       },
       {
        "k": "seg",
        "label": "工作模式",
        "e": "select.air_purifier_mode_p_2_4"
       },
       {
        "k": "btn",
        "label": "切换开关",
        "e": "button.air_purifier_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "屏幕 · 声音 · 童锁",
      "items": [
       {
        "k": "seg",
        "label": "显示屏",
        "e": "select.air_purifier_brightness_p_13_2"
       },
       {
        "k": "sw",
        "label": "提示音",
        "e": "switch.air_purifier_alarm_p_6_1"
       },
       {
        "k": "sw",
        "label": "物理控制锁",
        "e": "switch.air_purifier_physical_controls_locked_p_8_1"
       }
      ]
     },
     {
      "t": "环境",
      "items": [
       {
        "k": "ro",
        "label": "PM2.5",
        "e": "sensor.air_purifier_pm2_5_density_p_3_4",
        "unit": " μg/m³"
       },
       {
        "k": "ro",
        "label": "温度",
        "e": "sensor.air_purifier_temperature_p_3_7",
        "unit": "°C"
       },
       {
        "k": "ro",
        "label": "湿度",
        "e": "sensor.air_purifier_relative_humidity_p_3_1",
        "unit": "%"
       },
       {
        "k": "ro",
        "label": "故障",
        "e": "sensor.air_purifier_fault_p_2_2"
       }
      ]
     },
     {
      "t": "滤芯",
      "hint": "寿命见底后在米家 App 换滤芯，换完再点重置",
      "items": [
       {
        "k": "ro",
        "label": "剩余寿命",
        "e": "sensor.air_purifier_filter_life_level_p_4_1",
        "unit": "%"
       },
       {
        "k": "ro",
        "label": "剩余时间",
        "e": "sensor.air_purifier_filter_left_time_p_4_4",
        "unit": " 天"
       },
       {
        "k": "ro",
        "label": "已用时间",
        "e": "sensor.air_purifier_filter_used_time_p_4_3",
        "unit": " 天"
       }
      ]
     }
    ]
   },
   "_fx": 478.0,
   "_fy": 455.0
  },
  {
   "id": "d33",
   "room": "secondary",
   "name": "次卧空调",
   "kind": "ac",
   "entity": "climate.secondary_ac_climate",
   "x": 558.0,
   "y": 535.0,
   "_fx": 558.0,
   "_fy": 535.0
  },
  {
   "id": "d34",
   "room": "secondary",
   "name": "次卧小射灯",
   "kind": "light",
   "entity": "switch.secondary_spot_light",
   "x": 518.0,
   "y": 535.0,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 点动",
    "open": "设置",
    "echo": [
     {
      "e": "switch.small_spot_lamp_on_p_2_1",
      "map": {
       "on": "开着",
       "off": "关着"
      }
     },
     {
      "e": "select.small_spot_lamp_mode_p_2_2"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.small_spot_lamp_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "按键模式",
        "e": "select.small_spot_lamp_mode_p_2_2"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.small_spot_lamp_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.small_spot_lamp_default_power_on_state_p_2_3"
       },
       {
        "k": "sw",
        "label": "点动模式默认状态",
        "e": "switch.small_spot_lamp_on_p_11_1"
       },
       {
        "k": "num",
        "label": "按下持续时长",
        "e": "number.small_spot_lamp_mode_p_11_2",
        "unit": " 秒"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "外接开关被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "单击",
        "e": "event.small_spot_lamp_click_e_11_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   },
   "_fx": 518.0,
   "_fy": 535.0
  },
  {
   "id": "d35",
   "room": "study",
   "name": "书房吸顶灯",
   "kind": "light",
   "entity": "switch.study_ceiling_light",
   "x": 303.8,
   "y": 126.2,
   "_fx": 303.8,
   "_fy": 126.2
  },
  {
   "id": "d36",
   "room": "study",
   "name": "台灯",
   "kind": "light",
   "entity": "switch.desk_lamp",
   "x": 359.1,
   "y": 171.8
  },
  {
   "id": "d37",
   "room": "study",
   "name": "书房空调",
   "kind": "ac",
   "entity": "climate.study_ac_climate",
   "x": 240.2,
   "y": 75.5,
   "_fx": 240.2,
   "_fy": 75.5
  },
  {
   "id": "d38",
   "room": "study",
   "name": "书房氛围灯",
   "kind": "light",
   "entity": "switch.study_ambient_light",
   "x": 240.2,
   "y": 154.3
  },
  {
   "id": "d39",
   "room": "study",
   "name": "驱蚊器",
   "kind": "plug",
   "entity": "switch.mosquito_repellent",
   "x": 334.1,
   "y": 75.5
  },
  {
   "id": "d40",
   "room": "study",
   "name": "电脑通断器",
   "kind": "plug",
   "entity": "switch.pc_breaker",
   "x": 334.1,
   "y": 154.3
  },
  {
   "id": "d41",
   "room": "study",
   "name": "书房插排",
   "kind": "plug",
   "entity": "switch.study_power_strip",
   "x": 359.1,
   "y": 98.57082963291631,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 定时",
    "open": "设置",
    "echo": [
     {
      "e": "switch.study_power_strip_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     },
     {
      "e": "select.study_power_strip_mode_p_2_4"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.study_power_strip_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "开关模式",
        "e": "select.study_power_strip_mode_p_2_4"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.study_power_strip_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.study_power_strip_default_power_on_state_p_2_5"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d42",
   "room": "study",
   "name": "书房插座",
   "kind": "plug",
   "entity": "switch.study_outlet",
   "x": 240.2,
   "y": 126.2,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 定时",
    "open": "设置",
    "echo": [
     {
      "e": "switch.study_outlet_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     },
     {
      "e": "select.study_outlet_mode_p_2_4"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.study_outlet_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "开关模式",
        "e": "select.study_outlet_mode_p_2_4"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.study_outlet_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.study_outlet_default_power_on_state_p_2_5"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d43",
   "room": "study",
   "name": "书房音箱",
   "kind": "media",
   "entity": "media_player.speaker_study",
   "x": 359.1,
   "y": 55.0
  },
  {
   "id": "d44",
   "room": "study",
   "name": "小爱音箱 mini",
   "kind": "media",
   "entity": "media_player.speaker_mini",
   "x": 359.1,
   "y": 126.2
  },
  {
   "id": "d45",
   "room": "masterwc",
   "name": "主卫浴霸",
   "kind": "heat",
   "entity": "climate.masterwc_bath_heater_climate",
   "x": 85.6,
   "y": 347.3,
   "ctl": {
    "always": false,
    "sub": "取暖 · 吹风 · 换气 · 延时",
    "open": "设置",
    "echo": [
     {
      "e": "climate.masterwc_bath_heater",
      "map": {
       "auto": "运行中",
       "off": "已关机"
      }
     },
     {
      "e": "climate.masterwc_bath_heater",
      "attr": "preset_mode",
      "pre": "预设 "
     }
    ],
    "groups": [
     {
      "t": "浴霸",
      "hint": "自动 = 交给浴霸跑预设程序，关机 = 整机停",
      "items": [
       {
        "k": "seg",
        "label": "运行模式",
        "e": "climate.masterwc_bath_heater",
        "opts": [
         "auto",
         "off"
        ],
        "map": {
         "auto": "自动",
         "off": "关机"
        },
        "dom": "climate",
        "svc": "set_hvac_mode",
        "field": "hvac_mode"
       },
       {
        "k": "seg",
        "label": "预设程序",
        "e": "climate.masterwc_bath_heater",
        "aval": "preset_mode",
        "opts_attr": "preset_modes",
        "dom": "climate",
        "svc": "set_preset_mode",
        "field": "preset_mode"
       },
       {
        "k": "btn",
        "label": "停止工作",
        "e": "button.masterwc_bath_heater_stop_working_a_3_1",
        "text": "停止"
       }
      ]
     },
     {
      "t": "风暖",
      "items": [
       {
        "k": "sw",
        "label": "暖风",
        "e": "switch.masterwc_bath_heater_heating_p_3_3"
       },
       {
        "k": "sw",
        "label": "吹风",
        "e": "switch.masterwc_bath_heater_blow_p_3_2"
       },
       {
        "k": "sw",
        "label": "换气",
        "e": "switch.masterwc_bath_heater_ventilation_p_3_4"
       },
       {
        "k": "seg",
        "label": "加热档位",
        "e": "select.masterwc_bath_heater_heat_level_p_3_5",
        "map": {
         "加热低挡": "低挡",
         "加热高挡": "高挡"
        }
       }
      ]
     },
     {
      "t": "关机延时",
      "hint": "洗完澡让它再吹一会儿把湿气排掉",
      "items": [
       {
        "k": "sw",
        "label": "延时关机",
        "e": "switch.masterwc_bath_heater_off_delay_p_3_6"
       },
       {
        "k": "num",
        "label": "延时时长",
        "e": "number.masterwc_bath_heater_off_delay_time_p_3_7",
        "unit": " 分钟"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d46",
   "room": "masterwc",
   "name": "主卫灯",
   "kind": "light",
   "entity": "light.masterwc_light",
   "x": 132.3,
   "y": 347.3
  },
  {
   "id": "d47",
   "room": "masterwc",
   "name": "智能马桶盖",
   "kind": "toilet",
   "entity": "switch.smart_toilet_power",
   "x": 110.5,
   "y": 375.0,
   "ctl": {
    "always": true,
    "sub": "冲洗 · 座圈 · 夜灯 · 滤芯",
    "open": "设置",
    "echo": [
     {
      "e": "switch.smart_toilet_on_p_2_1",
      "map": {
       "on": "已开机",
       "off": "已关机"
      }
     },
     {
      "e": "select.smart_toilet_mode_p_2_7",
      "map": {
       "Idle": "待机",
       "Posterior Wash": "臀洗",
       "Feminine Wash": "妇洗",
       "Air Dry": "暖风烘干"
      }
     }
    ],
    "groups": [
     {
      "t": "运行",
      "hint": "「停止」只在冲洗 / 烘干进行中受理；关机或待机时按下会被设备拒绝（云端 code=-9999），这里已就地拦住",
      "items": [
       {
        "k": "sw",
        "label": "总开关",
        "e": "switch.smart_toilet_on_p_2_1"
       },
       {
        "k": "seg",
        "label": "工作模式",
        "e": "select.smart_toilet_mode_p_2_7",
        "map": {
         "Idle": "待机",
         "Posterior Wash": "臀洗",
         "Feminine Wash": "妇洗",
         "Air Dry": "暖风烘干"
        }
       },
       {
        "k": "btn",
        "label": "停止工作",
        "e": "button.smart_toilet_stop_working_a_2_1",
        "text": "停止",
        "guard": [
         {
          "e": "switch.smart_toilet_on_p_2_1",
          "skip_when": [
           "off",
           "unavailable",
           "unknown"
          ],
          "msg": "马桶盖现在是关机状态，没有在冲洗或烘干，不用停"
         },
         {
          "e": "select.smart_toilet_mode_p_2_7",
          "skip_when": [
           "Idle"
          ],
          "msg": "现在是待机，没有在冲洗或烘干，不用停"
         }
        ]
       },
       {
        "k": "ro",
        "label": "着座感应",
        "e": "binary_sensor.smart_toilet_seating_state_p_2_2",
        "map": {
         "on": "有人",
         "off": "无人"
        }
       }
      ]
     },
     {
      "t": "冲洗",
      "items": [
       {
        "k": "num",
        "label": "冲洗强度",
        "e": "number.smart_toilet_washing_strength_p_2_4",
        "unit": " 档"
       },
       {
        "k": "num",
        "label": "喷嘴位置",
        "e": "number.smart_toilet_nozzle_position_p_2_5",
        "unit": " 档"
       }
      ]
     },
     {
      "t": "座圈 · 除臭",
      "items": [
       {
        "k": "sw",
        "label": "座圈加热",
        "e": "switch.smart_toilet_heating_p_3_1"
       },
       {
        "k": "num",
        "label": "加热档位",
        "e": "number.smart_toilet_heat_level_p_3_2",
        "unit": " 档"
       },
       {
        "k": "sw",
        "label": "除臭",
        "e": "switch.smart_toilet_deodorization_p_2_6"
       }
      ]
     },
     {
      "t": "夜灯 · 提示音",
      "items": [
       {
        "k": "sw",
        "label": "夜灯",
        "e": "light.smart_toilet_s_4_night_light"
       },
       {
        "k": "sw",
        "label": "提示音",
        "e": "switch.smart_toilet_alarm_p_6_1"
       }
      ]
     },
     {
      "t": "滤芯",
      "items": [
       {
        "k": "ro",
        "label": "剩余寿命",
        "e": "sensor.smart_toilet_filter_life_level_p_5_1",
        "unit": "%"
       },
       {
        "k": "btn",
        "label": "重置滤芯",
        "e": "button.smart_toilet_reset_filter_life_a_5_1",
        "text": "重置"
       }
      ]
     }
    ],
    "on": {
     "e": "select.smart_toilet_mode_p_2_7",
     "vals": [
      "Posterior Wash",
      "Feminine Wash",
      "Air Dry"
     ]
    }
   },
   "_fx": 110.5,
   "_fy": 375.0
  },
  {
   "id": "d48",
   "room": "guestwc",
   "name": "客卫浴霸",
   "kind": "heat",
   "entity": "climate.guestwc_bath_heater_climate",
   "x": 118.6,
   "y": 245.0,
   "ctl": {
    "always": false,
    "sub": "取暖 · 吹风 · 换气 · 延时",
    "open": "设置",
    "echo": [
     {
      "e": "climate.guestwc_bath_heater",
      "map": {
       "auto": "运行中",
       "off": "已关机"
      }
     },
     {
      "e": "climate.guestwc_bath_heater",
      "attr": "preset_mode",
      "pre": "预设 "
     }
    ],
    "groups": [
     {
      "t": "浴霸",
      "hint": "自动 = 交给浴霸跑预设程序，关机 = 整机停",
      "items": [
       {
        "k": "seg",
        "label": "运行模式",
        "e": "climate.guestwc_bath_heater",
        "opts": [
         "auto",
         "off"
        ],
        "map": {
         "auto": "自动",
         "off": "关机"
        },
        "dom": "climate",
        "svc": "set_hvac_mode",
        "field": "hvac_mode"
       },
       {
        "k": "seg",
        "label": "预设程序",
        "e": "climate.guestwc_bath_heater",
        "aval": "preset_mode",
        "opts_attr": "preset_modes",
        "dom": "climate",
        "svc": "set_preset_mode",
        "field": "preset_mode"
       },
       {
        "k": "btn",
        "label": "停止工作",
        "e": "button.guestwc_bath_heater_stop_working_a_3_1",
        "text": "停止"
       }
      ]
     },
     {
      "t": "风暖",
      "items": [
       {
        "k": "sw",
        "label": "暖风",
        "e": "switch.guestwc_bath_heater_heating_p_3_3"
       },
       {
        "k": "sw",
        "label": "吹风",
        "e": "switch.guestwc_bath_heater_blow_p_3_2"
       },
       {
        "k": "sw",
        "label": "换气",
        "e": "switch.guestwc_bath_heater_ventilation_p_3_4"
       },
       {
        "k": "seg",
        "label": "加热档位",
        "e": "select.guestwc_bath_heater_heat_level_p_3_5",
        "map": {
         "加热低挡": "低挡",
         "加热高挡": "高挡"
        }
       }
      ]
     },
     {
      "t": "关机延时",
      "hint": "洗完澡让它再吹一会儿把湿气排掉",
      "items": [
       {
        "k": "sw",
        "label": "延时关机",
        "e": "switch.guestwc_bath_heater_off_delay_p_3_6"
       },
       {
        "k": "num",
        "label": "延时时长",
        "e": "number.guestwc_bath_heater_off_delay_time_p_3_7",
        "unit": " 分钟"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d49",
   "room": "guestwc",
   "name": "客卫灯",
   "kind": "light",
   "entity": "light.guestwc_light",
   "x": 118.6,
   "y": 285.0
  },
  {
   "id": "d50",
   "room": "closet",
   "name": "衣帽间吸顶灯",
   "kind": "light",
   "entity": "switch.closet_ceiling_light",
   "x": 142.0,
   "y": 126.2,
   "_fx": 142.0,
   "_fy": 126.2
  },
  {
   "id": "d51",
   "room": "closet",
   "name": "移动射灯",
   "kind": "light",
   "entity": "switch.moving_spot_light",
   "x": 106.0,
   "y": 55.0,
   "ctl": {
    "always": false,
    "sub": "模式 · 上电状态 · 点动",
    "open": "设置",
    "echo": [
     {
      "e": "switch.moving_spot_lamp_on_p_2_1",
      "map": {
       "on": "开着",
       "off": "关着"
      }
     },
     {
      "e": "select.moving_spot_lamp_mode_p_2_2"
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.moving_spot_lamp_on_p_2_1"
       },
       {
        "k": "sel",
        "label": "按键模式",
        "e": "select.moving_spot_lamp_mode_p_2_2"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.moving_spot_lamp_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "上电行为",
      "hint": "「默认上电状态」＝停电再来电时这路是开还是关；「断电记忆」＝恢复停电前的样子",
      "items": [
       {
        "k": "sel",
        "label": "默认上电状态",
        "e": "select.moving_spot_lamp_default_power_on_state_p_2_3"
       },
       {
        "k": "sw",
        "label": "点动模式默认状态",
        "e": "switch.moving_spot_lamp_on_p_11_1"
       },
       {
        "k": "num",
        "label": "按下持续时长",
        "e": "number.moving_spot_lamp_mode_p_11_2",
        "unit": " 秒"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "外接开关被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "单击",
        "e": "event.moving_spot_lamp_click_e_11_1",
        "fmt": "ago"
       }
      ]
     }
    ]
   },
   "_fx": 106.0,
   "_fy": 55.0
  },
  {
   "id": "d52",
   "room": "closet",
   "name": "衣帽间插排",
   "kind": "plug",
   "entity": "switch.closet_power_strip",
   "x": 186.2,
   "y": 160.0,
   "_fx": 186.2,
   "_fy": 160.0
  },
  {
   "id": "d53",
   "room": "closet",
   "name": "衣帽间空调",
   "kind": "ac",
   "entity": "climate.closet_ac_climate",
   "x": 186.2,
   "y": 55.0,
   "_fx": 186.2,
   "_fy": 55.0
  },
  {
   "id": "d54",
   "room": "balcony",
   "name": "晾衣架",
   "kind": "cover",
   "entity": "cover.clothes_airer",
   "x": 478.0,
   "y": 622.9
  },
  {
   "id": "d55",
   "room": "balcony",
   "name": "阳台灯",
   "kind": "light",
   "entity": "switch.balcony_light",
   "x": 315.7,
   "y": 622.9
  },
  {
   "id": "d56",
   "room": "balcony",
   "name": "晾衣架灯",
   "kind": "light",
   "entity": "light.clothes_airer_light",
   "x": 511.2,
   "y": 622.9
  },
  {
   "id": "d57",
   "room": "balcony",
   "name": "洗衣机",
   "kind": "appliance",
   "entity": "switch.washer_power",
   "x": 247.0,
   "y": 606.4,
   "ctl": {
    "always": false,
    "sub": "电源 · 开始 / 暂停 · 剩余时间",
    "open": "设置",
    "echo": [
     {
      "e": "switch.washer_power",
      "map": {
       "on": "已通电",
       "off": "已断电"
      }
     },
     {
      "e": "sensor.washer_progress",
      "map": {
       "Idle": "待机",
       "Wash": "洗涤中",
       "Pre-wash": "预洗中",
       "Rinse": "漂洗中",
       "Spin": "脱水中",
       "Hi-speed Spin": "高速脱水",
       "Dry": "烘干中",
       "Weight": "称重中",
       "Unknown": "未知"
      }
     }
    ],
    "groups": [
     {
      "t": "洗衣机",
      "hint": "「开始 / 暂停」就是机器上那颗开始键：开着的时候点一下暂停，暂停中再点一下继续。洗衣程序（快洗 / 羊毛 / 桶自洁…）米家没有接入 HA，请在机器面板或米家 App 里选",
      "items": [
       {
        "k": "sw",
        "label": "电源",
        "e": "switch.washer_power"
       },
       {
        "k": "sw",
        "label": "开始 / 暂停",
        "e": "switch.washer_start",
        "guard": [
         {
          "e": "switch.washer_power",
          "skip_when": [
           "off",
           "unavailable"
          ],
          "msg": "洗衣机还没开机，先开电源再按开始"
         }
        ]
       },
       {
        "k": "ro",
        "label": "当前阶段",
        "e": "sensor.washer_progress",
        "map": {
         "Idle": "待机",
         "Wash": "洗涤中",
         "Pre-wash": "预洗中",
         "Rinse": "漂洗中",
         "Spin": "脱水中",
         "Hi-speed Spin": "高速脱水",
         "Dry": "烘干中",
         "Weight": "称重中",
         "Unknown": "未知"
        }
       },
       {
        "k": "ro",
        "label": "剩余时间",
        "e": "sensor.washer_time_remaining",
        "unit": " 分钟"
       }
      ]
     },
     {
      "t": "镜像实体",
      "hint": "控制台镜像出来的运行状态，不依赖米家云",
      "items": [
       {
        "k": "ro",
        "label": "运行状态",
        "e": "switch.washer_running",
        "map": {
         "on": "运行中",
         "off": "待机"
        }
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d58",
   "room": "living",
   "name": "烘鞋器",
   "kind": "plug",
   "entity": "switch.shoe_dryer",
   "x": 529.0,
   "y": 201.0,
   "ctl": {
    "always": false,
    "sub": "通断 · 按键记录",
    "open": "设置",
    "echo": [
     {
      "e": "switch.shoe_dryer_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.shoe_dryer_on_p_2_1"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.shoe_dryer_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "插座上的物理键被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "单击",
        "e": "event.shoe_dryer_click_e_8_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "双击",
        "e": "event.shoe_dryer_double_click_e_8_2",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "长按",
        "e": "event.shoe_dryer_long_press_e_8_3",
        "fmt": "ago"
       }
      ]
     }
    ]
   }
  },
  {
   "id": "d59",
   "room": "living",
   "name": "电视台座",
   "kind": "plug",
   "entity": "switch.tv_stand_outlet",
   "x": 253.5,
   "y": 399.4,
   "ctl": {
    "always": false,
    "sub": "通断 · 按键记录",
    "open": "设置",
    "echo": [
     {
      "e": "switch.tv_stand_outlet_on_p_2_1",
      "map": {
       "on": "通电",
       "off": "断电"
      }
     }
    ],
    "groups": [
     {
      "t": "开关",
      "items": [
       {
        "k": "sw",
        "label": "通断",
        "e": "switch.tv_stand_outlet_on_p_2_1"
       },
       {
        "k": "btn",
        "label": "状态翻转",
        "e": "button.tv_stand_outlet_toggle_a_2_1",
        "text": "切换"
       }
      ]
     },
     {
      "t": "最近按键",
      "hint": "插座上的物理键被按下时上报（只读）",
      "items": [
       {
        "k": "ro",
        "label": "单击",
        "e": "event.tv_stand_outlet_click_e_8_1",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "双击",
        "e": "event.tv_stand_outlet_double_click_e_8_2",
        "fmt": "ago"
       },
       {
        "k": "ro",
        "label": "长按",
        "e": "event.tv_stand_outlet_long_press_e_8_3",
        "fmt": "ago"
       }
      ]
     }
    ]
   }
  }
 ],
 "missing": [
  {
   "name": "客厅摄像机（示例）",
   "model": "chuangmi.camera.xxx",
   "plat": "xiaomi_home",
   "n": 31,
   "doms": [
    "button",
    "light",
    "number",
    "select",
    "sensor",
    "switch",
    "text"
   ],
   "unavail": false,
   "ents": [
    "button.xxx_format",
    "switch.xxx_on",
    "sensor.xxx_status"
   ]
  },
  {
   "name": "阳台洗衣机（示例）",
   "model": "midea.washer.xxx",
   "plat": "xiaomi_miot",
   "n": 4,
   "doms": [
    "sensor",
    "switch"
   ],
   "unavail": false,
   "ents": [
    "switch.xxx_power",
    "switch.xxx_start",
    "sensor.xxx_progress"
   ]
  }
 ],
 "readouts": [
  {
   "room": "living",
   "name": "门锁状态",
   "entity": "sensor.smart_lock_door_state",
   "unit": "",
   "digits": null,
   "map": {
    "Locked": "已上锁",
    "Unlocked": "已开锁",
    "Jammed": "卡住",
    "unknown": "未知"
   },
   "kind": "sensor"
  },
  {
   "room": "living",
   "name": "门锁电量",
   "entity": "sensor.smart_lock_battery",
   "unit": "%",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "living",
   "name": "可视门铃",
   "entity": "sensor.doorbell_status",
   "unit": "",
   "digits": null,
   "map": {
    "Idle": "在线 · 待机",
    "Ringing": "响铃中",
    "unavailable": "离线",
    "unknown": "未知"
   },
   "kind": "sensor"
  },
  {
   "room": "living",
   "name": "门铃电量",
   "entity": "sensor.doorbell_battery",
   "unit": "%",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "living",
   "name": "路由器下载",
   "entity": "sensor.router_download_speed",
   "unit": "KiB/s",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "living",
   "name": "路由器上传",
   "entity": "sensor.router_upload_speed",
   "unit": "KiB/s",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "living",
   "name": "中枢网关",
   "entity": "switch.hub_online",
   "unit": "",
   "digits": null,
   "map": {
    "on": "在线",
    "off": "离线"
   },
   "kind": "sensor"
  },
  {
   "room": "living",
   "name": "客厅云台机",
   "entity": "switch.living_cam_online",
   "unit": "",
   "digits": null,
   "map": {
    "on": "在线",
    "off": "离线"
   },
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "炸锅状态",
   "entity": "sensor.air_fryer_status",
   "unit": "",
   "digits": null,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "炸锅剩余",
   "entity": "sensor.air_fryer_left_time",
   "unit": "分钟",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "饮水机",
   "entity": "sensor.water_dispenser_status",
   "unit": "",
   "digits": null,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "出水 TDS",
   "entity": "sensor.water_tds",
   "unit": "",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "滤芯剩余",
   "entity": "sensor.water_filter_life",
   "unit": "%",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "热水器水温",
   "entity": "sensor.heater_water_temp",
   "unit": "°C",
   "digits": 1,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "热水器设定",
   "entity": "sensor.heater_target_temp",
   "unit": "°C",
   "digits": 1,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "热水器燃烧",
   "entity": "switch.heater_burning",
   "unit": "",
   "digits": null,
   "map": {
    "on": "燃烧中",
    "off": "未燃烧"
   },
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "炸锅温度",
   "entity": "number.air_fryer_target_temperature",
   "unit": "°C",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "kitchen",
   "name": "厨房相机在线",
   "entity": "switch.kitchen_cam_online",
   "unit": "",
   "digits": null,
   "map": {
    "on": "在线",
    "off": "离线"
   },
   "kind": "sensor"
  },
  {
   "room": "master",
   "name": "主卧空调在线",
   "entity": "climate.master_ac_climate",
   "unit": "",
   "digits": null,
   "map": {
    "unavailable": "离线",
    "off": "待机"
   },
   "kind": "sensor"
  },
  {
   "room": "master",
   "name": "长插排实时功率",
   "entity": "sensor.metering_strip_power",
   "unit": "W",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "master",
   "name": "长插排累计电量",
   "entity": "sensor.metering_strip_energy",
   "unit": "kWh",
   "digits": 2,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "secondary",
   "name": "PM2.5",
   "entity": "sensor.air_purifier_pm25",
   "unit": "μg/m³",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "secondary",
   "name": "净化器滤芯",
   "entity": "sensor.air_purifier_filter_life",
   "unit": "%",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "secondary",
   "name": "滤芯可用",
   "entity": "sensor.air_purifier_filter_left_days",
   "unit": "天",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "secondary",
   "name": "次卧空调在线",
   "entity": "climate.secondary_ac_climate",
   "unit": "",
   "digits": null,
   "map": {
    "unavailable": "离线"
   },
   "kind": "sensor"
  },
  {
   "room": "study",
   "name": "衣柜门",
   "entity": "binary_sensor.wardrobe_door",
   "unit": "",
   "digits": null,
   "map": {
    "on": "打开",
    "off": "关闭"
   },
   "kind": "sensor"
  },
  {
   "room": "study",
   "name": "多模网关",
   "entity": "switch.gateway_online",
   "unit": "",
   "digits": null,
   "map": {
    "on": "在线",
    "off": "离线"
   },
   "kind": "sensor"
  },
  {
   "room": "study",
   "name": "防蚊片余量",
   "entity": "sensor.mosquito_repellent_left",
   "unit": "%",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "study",
   "name": "书房音箱",
   "entity": "media_player.speaker_mini",
   "unit": "",
   "digits": null,
   "map": {
    "idle": "待机",
    "playing": "播放中",
    "paused": "暂停",
    "off": "关闭",
    "unavailable": "离线"
   },
   "kind": "sensor"
  },
  {
   "room": "masterwc",
   "name": "马桶着座",
   "entity": "binary_sensor.smart_toilet_seating",
   "unit": "",
   "digits": null,
   "map": {
    "on": "有人",
    "off": "无人"
   },
   "kind": "sensor"
  },
  {
   "room": "masterwc",
   "name": "马桶滤芯",
   "entity": "sensor.smart_toilet_filter_life",
   "unit": "%",
   "digits": 0,
   "map": null,
   "kind": "sensor"
  },
  {
   "room": "balcony",
   "name": "晾衣架位置",
   "entity": "cover.clothes_airer",
   "unit": "",
   "digits": null,
   "map": null,
   "kind": "cover"
  }
 ],
 "scenes": [
  {
   "id": "quankai",
   "name": "全屋打开",
   "icon": "i-bulb",
   "hint": "打开全屋 25 盏灯",
   "actions": [
    {
     "entity": "switch.living_main_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.dining_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.sofa_ambient_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.light_strip",
     "service": "turn_on"
    },
    {
     "entity": "switch.entrance_spot_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.painting_spot_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.sideboard_spot_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.kitchen_main_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.kitchen_sink_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.master_ceiling_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.master_hall_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.master_ambient_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.candle_lamp",
     "service": "turn_on"
    },
    {
     "entity": "switch.secondary_ceiling_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.secondary_hall_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.secondary_spot_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.study_ceiling_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.desk_lamp",
     "service": "turn_on"
    },
    {
     "entity": "switch.study_ambient_light",
     "service": "turn_on"
    },
    {
     "entity": "light.masterwc_light",
     "service": "turn_on"
    },
    {
     "entity": "light.guestwc_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.closet_ceiling_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.moving_spot_light",
     "service": "turn_on"
    },
    {
     "entity": "switch.balcony_light",
     "service": "turn_on"
    },
    {
     "entity": "light.clothes_airer_light",
     "service": "turn_on"
    }
   ]
  },
  {
   "id": "quanguan",
   "name": "全屋关闭",
   "icon": "i-power",
   "hint": "关闭全屋所有灯光（空调不动）",
   "actions": [
    {
     "entity": "switch.living_main_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.dining_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.sofa_ambient_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.light_strip",
     "service": "turn_off"
    },
    {
     "entity": "switch.entrance_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.painting_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.sideboard_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.kitchen_main_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.kitchen_sink_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.master_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.master_hall_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.master_ambient_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.candle_lamp",
     "service": "turn_off"
    },
    {
     "entity": "switch.secondary_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.secondary_hall_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.secondary_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.study_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.desk_lamp",
     "service": "turn_off"
    },
    {
     "entity": "switch.study_ambient_light",
     "service": "turn_off"
    },
    {
     "entity": "light.masterwc_light",
     "service": "turn_off"
    },
    {
     "entity": "light.guestwc_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.closet_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.moving_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.balcony_light",
     "service": "turn_off"
    },
    {
     "entity": "light.clothes_airer_light",
     "service": "turn_off"
    }
   ]
  },
  {
   "id": "guanying",
   "name": "观影模式",
   "icon": "i-moon",
   "hint": "关掉全屋灯光，只留氛围灯带",
   "actions": [
    {
     "entity": "switch.living_main_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.dining_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.sofa_ambient_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.light_strip",
     "service": "turn_off"
    },
    {
     "entity": "switch.entrance_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.painting_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.sideboard_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.kitchen_main_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.kitchen_sink_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.master_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.master_hall_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.master_ambient_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.candle_lamp",
     "service": "turn_off"
    },
    {
     "entity": "switch.secondary_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.secondary_hall_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.secondary_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.study_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.desk_lamp",
     "service": "turn_off"
    },
    {
     "entity": "switch.study_ambient_light",
     "service": "turn_off"
    },
    {
     "entity": "light.masterwc_light",
     "service": "turn_off"
    },
    {
     "entity": "light.guestwc_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.closet_ceiling_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.moving_spot_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.balcony_light",
     "service": "turn_off"
    },
    {
     "entity": "light.clothes_airer_light",
     "service": "turn_off"
    },
    {
     "entity": "switch.light_strip",
     "service": "turn_on"
    }
   ]
  },
  {
   "id": "shuaxin",
   "name": "状态刷新",
   "icon": "i-refresh",
   "hint": "重新读取 HA 实体并重绘",
   "refresh": true,
   "actions": []
  }
 ],
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
 "panel": {
  "quick": [
   "客厅大灯",
   "餐厅灯",
   "厨房主灯",
   "阳台灯",
   "进门射灯",
   "迎门画射灯",
   "客厅插排",
   "主卧吸顶灯",
   "次卧吸顶灯",
   "书房吸顶灯"
  ],
  "security": [
   {
    "e": "switch.hub_online",
    "n": "中枢网关",
    "k": "hub",
    "map": {
     "on": "在线",
     "off": "离线"
    }
   },
   {
    "e": "switch.gateway_online",
    "n": "多模网关",
    "k": "hub",
    "map": {
     "on": "在线",
     "off": "离线"
    }
   },
   {
    "n": "智能门锁"
   },
   {
    "n": "可视门铃"
   },
   {
    "n": "客厅云台机"
   },
   {
    "n": "厨房相机"
   }
  ]
 },
 "supplies": {
  "battery": [
   {
    "n": "智能门锁",
    "e": "sensor.smart_lock_battery"
   },
   {
    "n": "可视门铃",
    "e": "sensor.doorbell_battery"
   },
   {
    "n": "NAS温湿度计",
    "e": "sensor.living_sensor_battery"
   },
   {
    "n": "主卧温湿度计",
    "e": "sensor.master_sensor_battery"
   },
   {
    "n": "次卧温湿度计",
    "e": "sensor.secondary_sensor_battery"
   },
   {
    "n": "书房温湿度计",
    "e": "sensor.study_sensor_battery"
   },
   {
    "n": "厨房温湿度计",
    "e": "sensor.kitchen_sensor_battery"
   },
   {
    "n": "阳台温湿度计",
    "e": "sensor.balcony_sensor_battery"
   },
   {
    "n": "衣帽间温湿度计",
    "e": "sensor.closet_sensor_battery"
   },
   {
    "n": "人体传感器",
    "e": "sensor.motion_sensor_battery"
   },
   {
    "n": "衣柜门传感器",
    "e": "sensor.wardrobe_door_battery"
   }
  ],
  "consume": [
   {
    "n": "马桶盖滤芯",
    "e": "sensor.smart_toilet_filter_life"
   },
   {
    "n": "净饮机滤芯",
    "e": "sensor.water_filter_life"
   },
   {
    "n": "净化器滤芯",
    "e": "sensor.air_purifier_filter_life"
   },
   {
    "n": "驱蚊片",
    "e": "sensor.mosquito_repellent_left"
   }
  ]
 },
 "appliances": [
  {
   "name": "洗衣机",
   "icon": "i-washer",
   "room": "阳台",
   "rows": [
    [
     "运行状态",
     "switch.washer_running",
     {
      "on": "运行中",
      "off": "待机"
     }
    ],
    [
     "电源",
     "switch.washer_power",
     {
      "on": "已通电",
      "off": "已断电"
     }
    ],
    [
     "当前阶段",
     "sensor.washer_progress",
     {
      "Idle": "待机",
      "Wash": "洗涤中",
      "Pre-wash": "预洗中",
      "Rinse": "漂洗中",
      "Spin": "脱水中",
      "Hi-speed Spin": "高速脱水",
      "Dry": "烘干中",
      "Weight": "称重中",
      "Unknown": "未知"
     }
    ],
    [
     "剩余时间",
     "sensor.washer_time_remaining",
     null,
     null,
     " 分钟"
    ]
   ],
   "hint": "滚筒洗衣机经米家接入：「运行状态」是模板镜像，电源 / 开始 / 阶段 / 剩余时间为真实实体；洗衣程序没有接入 HA，只能在机器面板或米家 App 里选。「剩余时间」只在洗的时候有数，洗完后 HA 给的是 unknown → 这里显示 —。"
  },
  {
   "name": "空气炸锅",
   "icon": "i-pot",
   "room": "厨房",
   "rows": [
    [
     "工作状态",
     "sensor.air_fryer_status",
     null
    ],
    [
     "剩余时间",
     "sensor.air_fryer_left_time",
     null,
     null,
     " 分钟"
    ],
    [
     "设定温度",
     "number.air_fryer_target_temperature",
     null
    ]
   ],
   "hint": "「剩余时间」「设定温度」是机器上最后一次设的值，关机也不会归零。"
  },
  {
   "name": "净饮机",
   "icon": "i-tap",
   "room": "厨房",
   "rows": [
    [
     "工作状态",
     "sensor.water_dispenser_status",
     null
    ],
    [
     "出水 TDS",
     "sensor.water_tds",
     null,
     null,
     " ppm"
    ],
    [
     "滤芯剩余",
     "sensor.water_filter_life",
     null
    ]
   ]
  },
  {
   "name": "空气净化器",
   "icon": "i-wind",
   "room": "次卧",
   "rows": [
    [
     "开关",
     "switch.air_purifier_power",
     {
      "on": "开启",
      "off": "关闭"
     }
    ],
    [
     "PM2.5",
     "sensor.air_purifier_pm25",
     null
    ],
    [
     "滤芯剩余",
     "sensor.air_purifier_filter_life",
     null
    ]
   ]
  },
  {
   "name": "晾衣架",
   "icon": "i-cover",
   "room": "阳台",
   "rows": [
    [
     "位置",
     "cover.clothes_airer",
     {
      "@cover": true
     }
    ],
    [
     "照明",
     "light.clothes_airer_light",
     {
      "on": "开启",
      "off": "关闭"
     }
    ]
   ]
  },
  {
   "name": "热水器",
   "icon": "i-flame",
   "room": "厨房",
   "rows": [
    [
     "模式",
     "water_heater.gas_water_heater_water_heater",
     {
      "off": "待机",
      "gas": "燃气",
      "electric": "电加热",
      "performance": "增容",
      "high_demand": "大流量",
      "heat_pump": "热泵",
      "eco": "节能",
      "unavailable": "离线"
     }
    ],
    [
     "正在燃烧",
     "binary_sensor.gas_water_heater_burning_state",
     {
      "on": "燃烧中",
      "off": "未燃烧",
      "unavailable": "离线",
      "unknown": "未上报"
     }
    ],
    [
     "当前水温",
     "sensor.gas_water_heater_current_temperature",
     null
    ],
    [
     "设定水温",
     "water_heater.gas_water_heater_water_heater",
     null,
     "temperature",
     " °C"
    ],
    [
     "电源",
     "switch.gas_water_heater_power",
     {
      "on": "已通电",
      "off": "已断电"
     }
    ],
    [
     "防护",
     "binary_sensor.gas_water_heater_protection",
     {
      "on": "正常",
      "off": "已触发"
     }
    ]
   ],
   "hint": "「模式」只说明走哪套燃烧方式，通着电就有，不代表正在烧；真在烧看「正在燃烧」。水温与设定温度由米家云端拉取，1~2 度的回差是正常的。"
  },
  {
   "name": "客厅空调",
   "icon": "i-snow",
   "room": "客厅",
   "keys": [
    "客厅空调"
   ],
   "rows": [
    [
     "模式",
     "climate.living_ac",
     {
      "off": "已关闭",
      "cool": "制冷",
      "heat": "制热",
      "dry": "除湿",
      "fan_only": "送风",
      "auto": "自动",
      "unavailable": "离线"
     }
    ],
    [
     "正在运行",
     "climate.living_ac",
     {
      "cooling": "制冷中",
      "heating": "制热中",
      "drying": "除湿中",
      "fan": "送风中",
      "idle": "待机（到温了）",
      "off": "已停机",
      "unavailable": "离线",
      "unknown": "未上报"
     },
     "hvac_action"
    ],
    [
     "当前室温",
     "climate.living_ac",
     null,
     "current_temperature",
     " °C"
    ],
    [
     "设定温度",
     "climate.living_ac",
     null,
     "temperature",
     " °C"
    ],
    [
     "风速",
     "climate.living_ac",
     null,
     "fan_mode"
    ]
   ],
   "hint": "海尔这台是 climate 一个实体兜全部读数，没有独立的功率 / 电量传感器，所以看不到耗电；「正在运行」是 hvac_action，能看出是压缩机在转还是已经到温待机。"
  },
  {
   "name": "主卧空调",
   "icon": "i-snow",
   "room": "主卧",
   "keys": [],
   "rows": [
    [
     "模式",
     "climate.master_ac_climate",
     {
      "off": "已关闭",
      "cool": "制冷",
      "heat": "制热",
      "dry": "除湿",
      "fan_only": "送风",
      "auto": "自动",
      "unavailable": "离线"
     }
    ],
    [
     "当前室温",
     "sensor.master_ac_indoor_temperature",
     null
    ],
    [
     "设定温度",
     "climate.master_ac_climate",
     null,
     "temperature",
     " °C"
    ],
    [
     "实时功率",
     "sensor.master_ac_realtime_power",
     null
    ],
    [
     "本期电量",
     "sensor.master_ac_current_energy_consumption",
     null
    ],
    [
     "累计电量",
     "sensor.master_ac_total_energy_consumption",
     null
    ]
   ],
   "hint": "「模式」是设定的工作方式，不等于正在制冷；米家没把 hvac_action 报上来，分不出「在制冷」还是「到温待机」。「本期电量」是空调自己记的一段周期计数（会归零），不是实时功率；「累计电量」是出厂至今的总和。「实时功率」关机时仍有 4~5 W 待机功耗。"
  },
  {
   "name": "次卧空调",
   "icon": "i-snow",
   "room": "次卧",
   "keys": [],
   "rows": [
    [
     "模式",
     "climate.secondary_ac_climate",
     {
      "off": "已关闭",
      "cool": "制冷",
      "heat": "制热",
      "dry": "除湿",
      "fan_only": "送风",
      "auto": "自动",
      "unavailable": "离线"
     }
    ],
    [
     "当前室温",
     "sensor.secondary_ac_indoor_temperature",
     null
    ],
    [
     "设定温度",
     "climate.secondary_ac_climate",
     null,
     "temperature",
     " °C"
    ],
    [
     "实时功率",
     "sensor.secondary_ac_realtime_power",
     null
    ],
    [
     "本期电量",
     "sensor.secondary_ac_current_energy_consumption",
     null
    ],
    [
     "累计电量",
     "sensor.secondary_ac_total_energy_consumption",
     null
    ]
   ],
   "hint": "「模式」是设定的工作方式，不等于正在制冷；米家没把 hvac_action 报上来，分不出「在制冷」还是「到温待机」。「本期电量」是空调自己记的一段周期计数（会归零），不是实时功率；「累计电量」是出厂至今的总和。「实时功率」关机时仍有 4~5 W 待机功耗。"
  },
  {
   "name": "书房空调",
   "icon": "i-snow",
   "room": "书房",
   "keys": [],
   "rows": [
    [
     "模式",
     "climate.study_ac_climate",
     {
      "off": "已关闭",
      "cool": "制冷",
      "heat": "制热",
      "dry": "除湿",
      "fan_only": "送风",
      "auto": "自动",
      "unavailable": "离线"
     }
    ],
    [
     "当前室温",
     "sensor.study_ac_indoor_temperature",
     null
    ],
    [
     "设定温度",
     "climate.study_ac_climate",
     null,
     "temperature",
     " °C"
    ],
    [
     "实时功率",
     "sensor.study_ac_realtime_power",
     null
    ],
    [
     "本期电量",
     "sensor.study_ac_current_energy_consumption",
     null
    ],
    [
     "累计电量",
     "sensor.study_ac_total_energy_consumption",
     null
    ]
   ],
   "hint": "「模式」是设定的工作方式，不等于正在制冷；米家没把 hvac_action 报上来，分不出「在制冷」还是「到温待机」。「本期电量」是空调自己记的一段周期计数（会归零），不是实时功率；「累计电量」是出厂至今的总和。「实时功率」关机时仍有 4~5 W 待机功耗。"
  },
  {
   "name": "衣帽间空调",
   "icon": "i-snow",
   "room": "衣帽间",
   "keys": [],
   "rows": [
    [
     "模式",
     "climate.closet_ac_climate",
     {
      "off": "已关闭",
      "cool": "制冷",
      "heat": "制热",
      "dry": "除湿",
      "fan_only": "送风",
      "auto": "自动",
      "unavailable": "离线"
     }
    ],
    [
     "当前室温",
     "sensor.closet_ac_indoor_temperature",
     null
    ],
    [
     "设定温度",
     "climate.closet_ac_climate",
     null,
     "temperature",
     " °C"
    ],
    [
     "实时功率",
     "sensor.closet_ac_realtime_power",
     null
    ],
    [
     "本期电量",
     "sensor.closet_ac_current_energy_consumption",
     null
    ],
    [
     "累计电量",
     "sensor.closet_ac_total_energy_consumption",
     null
    ]
   ],
   "hint": "「模式」是设定的工作方式，不等于正在制冷；米家没把 hvac_action 报上来，分不出「在制冷」还是「到温待机」。「本期电量」是空调自己记的一段周期计数（会归零），不是实时功率；「累计电量」是出厂至今的总和。「实时功率」关机时仍有 4~5 W 待机功耗。"
  }
 ]
};
