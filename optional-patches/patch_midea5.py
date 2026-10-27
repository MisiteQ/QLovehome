# -*- coding: utf-8 -*-
"""midea_ac_lan 补丁 5（v211）：修 current_energy_consumption 的 state_class 冲突。

   HA 2026.10 日志警告：
     Entity sensor.<id>_current_energy_consumption is using state class 'measurement'
     which is impossible considering device class ('energy') it is using;
     expected None or one of 'total_increasing', 'total'

   事实：ACAttributes.current_energy_consumption 与 total_energy_consumption 一样，
   走 XC1MessageBody.parse_consumption()（4 字节）解析，单位 kWh —— 是累计电量，
   不是瞬时功率（瞬时功率另有 realtime_power，单位 W、device_class=power）。
   所以正确写法是 state_class = TOTAL_INCREASING（允许归零重置，如按月清零）。

   只改 ACAttributes.current_energy_consumption 这一块里的 state_class，
   不动 realtime_power（power + measurement 本来就合法）、不动 total_energy_consumption。
"""
import io
import os
import py_compile

D = "/config/custom_components/midea_ac_lan"
p = os.path.join(D, "midea_devices.py")
s = io.open(p, encoding="utf-8").read()

KEY = "ACAttributes.current_energy_consumption: {"
i = s.find(KEY)
if i < 0:
    print("anchor not found: " + KEY)
    raise SystemExit(1)

# 这一块的结束：下一个 "}," 之前
j = s.find("},", i)
if j < 0:
    print("block end not found")
    raise SystemExit(1)
block = s[i:j]

if "TOTAL_INCREASING" in block:
    print("已经是 TOTAL_INCREASING，跳过")
    raise SystemExit(0)
if "SensorStateClass.MEASUREMENT" not in block:
    print("块里没有 MEASUREMENT，人工确认一下：")
    print(block)
    raise SystemExit(1)

new_block = block.replace("SensorStateClass.MEASUREMENT", "SensorStateClass.TOTAL_INCREASING")
if new_block == block:
    print("replace 没生效")
    raise SystemExit(1)

s2 = s[:i] + new_block + s[j:]
bak = p + ".bak-v211-stateclass"
if not os.path.exists(bak):
    io.open(bak, "w", encoding="utf-8").write(s)
io.open(p, "w", encoding="utf-8").write(s2)

py_compile.compile(p, doraise=True)
print("patched. backup -> " + bak)
print(new_block)
