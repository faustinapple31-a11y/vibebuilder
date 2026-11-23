"""Which builders an architecture style of the Style Bible uses. A style that is absent keeps its own PartList, textured.

Never mixes rules: a modern style has no timber house to fall back on, a desert one no gable roof.
"""
from wf_modern import SHED, modern_house
from wf_city import CITY
from wf_desert import CARVED, DESERT
from wf_home import HOMES, WORN_HOMES

FAMILIES = {
    "modern_house": {**CITY, **HOMES},
    "apartment_block": {**CITY, **HOMES},
    "industrial_shed": {**CITY, "house": SHED["house"], "house_large": SHED["house_large"]},
    "desert_adobe": DESERT,
    "egyptian": CARVED,
}
WORN = {**CITY, **WORN_HOMES}
